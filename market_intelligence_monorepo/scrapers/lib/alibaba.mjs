import { USER_AGENT } from "./env.mjs";

// The block is per IP and lifts on its own after a few minutes.
export class RateLimitError extends Error {}

export async function searchAlibaba(query) {
  const url = new URL("https://open-s.alibaba.com/openservice/galleryProductOfferResultViewService");
  url.searchParams.set("appName", "magellan");
  url.searchParams.set("appKey", "a5m1ismomeptugvfmkkjnwwqnwyrhpb1");
  url.searchParams.set("searchText", query);
  url.searchParams.set("page", "1");
  url.searchParams.set("language", "pt");
  url.searchParams.set("currency", "BRL");

  const response = await fetch(url, {
    signal: AbortSignal.timeout(25_000),
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      "Accept-Language": "pt-BR,pt;q=0.9",
      Cookie: "aep_usuc_f=c_tp=BRL&region=BR",
    },
  });
  if (response.status === 429) throw new RateLimitError("Alibaba HTTP 429");
  if (!response.ok) throw new Error(`Alibaba HTTP ${response.status}`);

  const body = await response.text();
  if (!body.trimStart().startsWith("{")) {
    if (/punish|captcha|baxia/i.test(body)) throw new RateLimitError("Alibaba pediu captcha");
    throw new Error("Alibaba devolveu HTML em vez de JSON");
  }
  const payload = JSON.parse(body);
  if (payload.code !== 200) throw new Error(`Alibaba respondeu ${payload.msg || payload.code}`);

  const items = Array.isArray(payload.data?.offerList) ? payload.data.offerList : [];
  const offers = [];
  for (const item of items) {
    const title = cleanTitle(item.information?.puretitle || item.information?.title);
    const tier = entryTier(item);
    if (!title || item.id == null || tier == null) continue;
    offers.push({
      offerId: String(item.id),
      title,
      priceBrl: tier.priceBrl,
      minOrder: tier.minOrder,
      orderUnit: tier.unit,
      soldLabel: item.information?.marketingPowerCommon?.text || null,
      storeName: item.supplier?.supplierName || null,
      productUrl: absoluteUrl(item.information?.productUrl),
      thumbnail: absoluteUrl(item.image?.mainImage),
    });
  }

  if (items.length > 0 && offers.length === 0) {
    throw new Error("Alibaba não devolveu preço em BRL");
  }
  return { resultCount: items.length, offers };
}

// Only the localized tier price is in BRL; tradePrice stays in USD even with currency=BRL.
function entryTier(item) {
  const tiers = Array.isArray(item.promotionInfoVO?.quantityPrices)
    ? item.promotionInfoVO.quantityPrices
    : [];
  const entry = [...tiers]
    .filter((tier) => brl(tier?.localPrice) != null)
    .sort((left, right) => Number(left.quantityMin) - Number(right.quantityMin))[0];
  if (!entry) return null;
  return {
    priceBrl: brl(entry.localPrice),
    minOrder: Number.isFinite(Number(entry.quantityMin)) ? Number(entry.quantityMin) : null,
    unit: entry.unit || item.tradePrice?.unit || null,
  };
}

function brl(value) {
  const match = String(value || "").match(/^\s*R\$\s*([\d.]+(?:,\d+)?)/);
  if (!match) return null;
  const parsed = Number(match[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanTitle(value) {
  return String(value || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function absoluteUrl(value) {
  if (!value) return null;
  if (value.startsWith("//")) return `https:${value}`;
  return value;
}
