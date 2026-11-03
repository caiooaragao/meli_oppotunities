import { exitFetch } from "./exit-fetch.mjs";

// The desktop site (pt.aliexpress.com and every other subdomain) blocks the IP past about ten
// searches a minute, for about five minutes. The mobile site answers the same search, with the
// same JSON, from a separate counter: 160 searches a minute went through with the desktop IP
// still blocked. So searches go to m.aliexpress.com with a phone user agent, and the desktop
// response is only kept as a parse fallback. Pacing lives in worker.mjs; this module only talks
// to the site.
export class AntiBotError extends Error {}

const MOBILE_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const SITE_COOKIE = ["aep_usuc_f", "site=bra&c_tp=BRL&region=BR&b_locale=pt_BR"];
// Mobile pages carry 20 items; two of them cover what one desktop page did.
const PAGES = Number(process.env.ALIEXPRESS_PAGES || 2);

// Cookies the site hands out on the first answer, sent back on the next ones so the run looks
// like one visitor browsing instead of a new one per search. Dropped when the site punishes,
// because the punished session carries an x5secdata cookie.
const jar = new Map([SITE_COOKIE]);

function absorbCookies(response) {
  const cookies =
    typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  for (const cookie of cookies) {
    const [pair] = cookie.split(";");
    const at = pair.indexOf("=");
    if (at <= 0) continue;
    const name = pair.slice(0, at).trim();
    if (name === "x5secdata") continue;
    jar.set(name, pair.slice(at + 1).trim());
  }
}

export function resetSession() {
  jar.clear();
  jar.set(...SITE_COOKIE);
}

function isPunished(html) {
  return html.length < 20_000 && /_____tmd_____\/punish|x5secdata|baxia/i.test(html);
}

async function fetchPage(slug, page) {
  const url = new URL(`https://m.aliexpress.com/wholesale/${slug}.html`);
  if (page > 1) url.searchParams.set("page", String(page));
  const response = await exitFetch(url, {
    signal: AbortSignal.timeout(25_000),
    headers: {
      "User-Agent": MOBILE_USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "pt-BR,pt;q=0.9",
      Referer: "https://m.aliexpress.com/",
      Cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; "),
    },
  });
  if (response.status === 429) {
    throw new AntiBotError("AliExpress HTTP 429");
  }
  if (!response.ok) throw new Error(`AliExpress HTTP ${response.status}`);

  const html = await response.text();
  if (isPunished(html)) {
    resetSession();
    throw new AntiBotError("AliExpress pediu verificação anti-bot");
  }
  absorbCookies(response);
  return parseItems(html);
}

export async function searchAliExpress(query) {
  const slug = encodeURIComponent(query.trim().replace(/\s+/g, "-"));
  const first = await fetchPage(slug, 1);
  // Later pages only when the first one was full; a short first page is the whole result.
  const rest =
    first.length >= 20 && PAGES > 1
      ? await Promise.all(
          Array.from({ length: PAGES - 1 }, (_, index) => fetchPage(slug, index + 2).catch(() => [])),
        )
      : [];
  const items = [...first, ...rest.flat()];
  const byId = new Map();
  for (const item of items) {
    const sale = item.prices?.salePrice;
    const original = item.prices?.originalPrice;
    const price = sale?.minPrice ?? original?.minPrice;
    const currency = sale?.currencyCode || original?.currencyCode;
    if (price == null || currency !== "BRL") continue;

    const id = String(item.productId);
    byId.set(id, {
      offerId: id,
      title: item.title.displayTitle,
      priceBrl: Number(price),
      minOrder: 1,
      orderUnit: "unidade",
      soldLabel:
        [item.evaluation?.starRating ? `${item.evaluation.starRating} estrelas` : null, item.trade?.tradeDesc]
          .filter(Boolean)
          .join(" · ") || null,
      storeName: null,
      productUrl: `https://pt.aliexpress.com/item/${id}.html`,
      thumbnail: absoluteUrl(item.images?.[0]?.imgUrl || item.image?.imgUrl),
    });
  }

  if (items.length > 0 && byId.size === 0) {
    throw new Error("AliExpress não devolveu preço em BRL");
  }
  return { resultCount: items.length, offers: [...byId.values()] };
}

// Mobile pages embed the search state in the app context; desktop pages in _dida_config_.
const MARKERS = [
  { find: 'var b = {"appData"', skip: "var b = ".length },
  { find: "window._dida_config_._init_data_= { data: ", skip: "window._dida_config_._init_data_= { data: ".length },
];

function parseItems(html) {
  let jsonStart = -1;
  for (const { find, skip } of MARKERS) {
    const start = html.indexOf(find);
    if (start !== -1) {
      jsonStart = start + skip;
      break;
    }
  }
  if (jsonStart === -1) throw new Error("AliExpress não devolveu a lista de produtos");

  const data = JSON.parse(readJsonObject(html, jsonStart));
  const content = findItemList(data) || [];
  return content.filter((item) => item?.productId && item?.title?.displayTitle);
}

function readJsonObject(text, start) {
  if (text[start] !== "{") throw new Error("AliExpress não devolveu JSON da busca");

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  throw new Error("JSON da busca do AliExpress não fechou");
}

function findItemList(node, depth = 0) {
  if (depth > 14 || node == null) return null;
  if (Array.isArray(node)) {
    for (const entry of node.slice(0, 12)) {
      const found = findItemList(entry, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== "object") return null;
  if (Array.isArray(node.itemList?.content)) return node.itemList.content;
  for (const value of Object.values(node)) {
    const found = findItemList(value, depth + 1);
    if (found) return found;
  }
  return null;
}

function absoluteUrl(value) {
  if (!value) return null;
  if (value.startsWith("//")) return `https:${value}`;
  return value;
}
