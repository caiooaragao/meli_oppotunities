import { USER_AGENT, sleep } from "./env.mjs";

const FALLBACK_ROOTS = [
  "MLB1743", "MLB5672", "MLB1574", "MLB1051", "MLB1430", "MLB1648", "MLB5726",
  "MLB1276", "MLB1459", "MLB263532", "MLB1246", "MLB1000", "MLB271599", "MLB1403",
  "MLB1367", "MLB1368", "MLB1384", "MLB1132", "MLB1500", "MLB1039", "MLB12404",
  "MLB1144", "MLB1499", "MLB218519", "MLB1182", "MLB3937", "MLB1196", "MLB1168",
  "MLB1071", "MLB264586", "MLB1540", "MLB1002", "MLB1953",
];

function headers(cookie, accept) {
  return {
    "User-Agent": USER_AGENT,
    Accept: accept,
    "Accept-Language": "pt-BR,pt;q=0.9",
    Referer: "https://www.mercadolivre.com.br/",
    "x-card-type": "polycard",
    Cookie: cookie || "",
  };
}

function cookieHeader(response) {
  const cookies =
    typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

export async function fetchHome() {
  const first = await fetch("https://www.mercadolivre.com.br/", {
    headers: headers("", "text/html"),
  });
  if (!first.ok) throw new Error(`Home respondeu HTTP ${first.status}`);
  const cookie = cookieHeader(first);
  await first.arrayBuffer();

  const response = await fetch("https://www.mercadolivre.com.br/", {
    headers: headers(cookie, "text/html"),
  });
  if (!response.ok) throw new Error(`Home respondeu HTTP ${response.status}`);
  const html = await response.text();
  if (html.includes("account-verification") || html.includes("suspicious-traffic")) {
    throw new Error("A home do Mercado Livre devolveu a verificação anti-bot");
  }

  const rootIds = [...html.matchAll(/c_category_id=(MLB\d+)/g)].map((match) => match[1]);
  return {
    cookie: cookie || cookieHeader(response),
    rootIds: [...new Set([...rootIds, ...FALLBACK_ROOTS])],
  };
}

async function fetchJson(url, cookie) {
  let lastError = new Error(`sem resposta de ${url}`);
  // The recommendations endpoint answers 403 when it is rate limiting, not only on real denials.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
      headers: headers(cookie, "application/json"),
    });
    if (response.ok) return response.json();
    lastError = new Error(`HTTP ${response.status} em ${url}`);
    if (![403, 429].includes(response.status) && response.status < 500) break;
    await sleep(1_000 * 2 ** attempt + Math.random() * 500);
  }
  throw lastError;
}

export async function fetchCategory(categoryId, cookie) {
  const data = await fetchJson(`https://api.mercadolibre.com/categories/${categoryId}`, cookie);
  const path = Array.isArray(data.path_from_root) ? data.path_from_root : [];
  return {
    id: data.id,
    name: data.name,
    department: path[0]?.name || data.name,
    children: (data.children_categories || []).map((child) => ({
      id: child.id,
      name: child.name || child.id,
    })),
  };
}

export async function fetchTopSales(categoryId, cookie) {
  const url = new URL("https://www.mercadolivre.com.br/recommendations/v2");
  url.searchParams.set("site_id", "MLB");
  url.searchParams.set("client", "home_pom_top-sales-by-category-recommendations");
  url.searchParams.set("category_id", categoryId);
  url.searchParams.set("limit", "20");
  url.searchParams.set("page", "1");

  const data = await fetchJson(url, cookie);
  const cards = data.recommendation_info?.polycards || [];
  return cards
    .map((card, index) => productFromCard(card, categoryId, index + 1))
    .filter(Boolean);
}

function productFromCard(card, categoryId, position) {
  const itemId = card?.metadata?.id;
  const title = card?.components?.find((part) => part.type === "title")?.title?.text;
  if (!itemId || !title) return null;

  const pricePart = card.components.find((part) => part.type === "price")?.price;
  const shipping = card.components.find((part) => part.type === "shipping")?.shipping?.text || "";
  const sold = parseSold(pricePart?.discount_label?.text);
  const pictureId = card.pictures?.pictures?.[0]?.id;
  let permalink = card.metadata.url || "";
  if (permalink && !permalink.startsWith("http")) permalink = `https://${permalink}`;

  return {
    itemId: String(itemId),
    categoryId: String(categoryId || card.metadata.category_id || "MLB"),
    title: String(title),
    price: pricePart?.current_price?.value ?? null,
    originalPrice: previousPrice(pricePart),
    currencyId: pricePart?.current_price?.currency || "BRL",
    permalink: permalink.split("#")[0] || null,
    thumbnail: pictureId ? `https://http2.mlstatic.com/D_NQ_NP_2X_${pictureId}-V.webp` : null,
    position,
    freeShipping: /gr[aá]tis/i.test(shipping),
    soldQuantity: sold.quantity,
    soldLabel: sold.label,
    source: `top-sales:${categoryId}`,
  };
}

function previousPrice(price) {
  const values = (price?.price_labels || []).flatMap((entry) => entry.values || []);
  const previous = values.find((entry) => entry.price?.previous);
  return previous?.price?.value ?? null;
}

export function parseSold(label) {
  if (typeof label !== "string" || !/vendid/i.test(label)) {
    return { quantity: null, label: null };
  }

  const match = label.match(/(\d+(?:[.,]\d+)?)\s*(milh(?:[ãa]o|ões|oes)|mil|m)?/i);
  if (!match) return { quantity: null, label: label.trim() };

  const unit = (match[2] || "").toLowerCase();
  let value = Number(match[1].replace(/\./g, "").replace(",", "."));
  if (Number.isNaN(value)) return { quantity: null, label: label.trim() };
  if (unit.startsWith("milh") || unit === "m") value *= 1_000_000;
  else if (unit === "mil") value *= 1_000;

  return { quantity: Math.round(value), label: label.trim() };
}
