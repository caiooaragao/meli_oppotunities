import { pool } from "./db";
import { round2 } from "./format";
import {
  BASE_SCENARIO,
  computeCost,
  decide,
  scoreMatch,
  type CostBreakdown,
  type Decision,
  type MatchStrength,
} from "./margin";

export type OpportunityFilters = {
  department: string;
  decision: "todas" | Decision;
  source: "todas" | "aliexpress" | "alibaba";
};

export type OpportunityRow = {
  itemId: string;
  title: string;
  thumbnail: string | null;
  permalink: string | null;
  departmentName: string;
  categoryName: string;
  rank: number;
  price: number;
  originalPrice: number | null;
  soldQuantity: number | null;
  soldLabel: string | null;
  freeShipping: boolean;
  source: "aliexpress" | "alibaba";
  supplierTitle: string;
  supplierUrl: string | null;
  supplierCostBrl: number;
  minOrder: number | null;
  orderUnit: string | null;
  verdict: string | null;
  score: number | null;
  matchStrength: MatchStrength;
  lotCapitalBrl: number | null;
  decision: Decision;
  cost: CostBreakdown;
};

export type SourcingRow = {
  itemId: string;
  title: string;
  thumbnail: string | null;
  permalink: string | null;
  departmentName: string;
  categoryName: string;
  rank: number;
  price: number;
  originalPrice: number | null;
  soldQuantity: number | null;
  soldLabel: string | null;
  freeShipping: boolean;
  promo: boolean;
  aboveFreightThreshold: boolean;
};

export type DepartmentStat = {
  department: string;
  products: number;
  matched: number;
  matchRate: number;
  medianPrice: number | null;
  medianSold: number | null;
  promoRate: number;
  above79Rate: number;
};

export type FunnelStep = {
  key: string;
  label: string;
  value: number;
};

export type OpportunityDashboard = {
  scrapedAt: string | null;
  scenarioName: string;
  ruleVersion: string;
  fxUsdBrl: number;
  floorPct: number;
  floorBrl: number;
  discovered: number;
  matched: number;
  coverage: number;
  decisions: Record<Decision, number>;
  funnel: FunnelStep[];
  histogram: { bin: string; start: number; count: number }[];
  rows: OpportunityRow[];
  sourcing: SourcingRow[];
  departments: DepartmentStat[];
  departmentNames: string[];
};

type Payload = {
  summary: {
    discovered: number;
    matched: number;
    strong: number;
    scraped_at: string | null;
  };
  matched: ListingRow[];
  sourcing: SourcingSqlRow[];
  departments: DepartmentSqlRow[];
  department_names: string[];
};

type ListingRow = {
  item_id: string;
  category_id: string;
  category_name: string | null;
  title: string;
  price: string | number | null;
  original_price: string | number | null;
  permalink: string | null;
  thumbnail: string | null;
  rank: number;
  free_shipping: boolean;
  sold_quantity: number | null;
  sold_label: string | null;
  department_name: string | null;
  ali_title: string | null;
  ali_url: string | null;
  ali_price: string | number | null;
  ali_verdict: string | null;
  ali_score: string | number | null;
  ali_min_order: string | number | null;
  ali_order_unit: string | null;
  alb_title: string | null;
  alb_url: string | null;
  alb_price: string | number | null;
  alb_verdict: string | null;
  alb_score: string | number | null;
  alb_min_order: string | number | null;
  alb_order_unit: string | null;
};

type SourcingSqlRow = {
  item_id: string;
  title: string;
  thumbnail: string | null;
  permalink: string | null;
  department_name: string | null;
  category_name: string | null;
  category_id: string;
  rank: number;
  price: string | number | null;
  original_price: string | number | null;
  sold_quantity: number | null;
  sold_label: string | null;
  free_shipping: boolean;
};

type DepartmentSqlRow = {
  department_name: string;
  products: number;
  matched: number;
  median_price: number | null;
  median_sold: number | null;
  promo_rate: number;
  above79_rate: number;
};

export async function loadOpportunityDashboard(
  filters: OpportunityFilters,
): Promise<OpportunityDashboard> {
  const department = filters.department !== "todas" ? filters.department : null;
  const result = await pool.query<{ payload: Payload }>(
    `WITH listings AS (
       SELECT DISTINCT ON (item_id)
         item_id,
         category_id,
         category_name,
         title,
         price,
         original_price,
         permalink,
         thumbnail,
         rank,
         free_shipping,
         sold_quantity,
         sold_label,
         department_name,
         scraped_at
       FROM best_sellers
       ORDER BY
         item_id,
         rank ASC NULLS LAST,
         CASE WHEN category_name IS NULL OR category_name = 'Outros' THEN 1 ELSE 0 END,
         scraped_at DESC
     ),
     joined AS (
       SELECT l.item_id,
              l.category_id,
              l.category_name,
              l.title,
              l.price,
              l.original_price,
              l.permalink,
              l.thumbnail,
              l.rank,
              l.free_shipping,
              l.sold_quantity,
              l.sold_label,
              l.department_name,
              l.scraped_at,
              ali.title AS ali_title,
              ali.product_url AS ali_url,
              ali.price_brl AS ali_price,
              ali.verdict AS ali_verdict,
              ali.score AS ali_score,
              ali.min_order AS ali_min_order,
              ali.order_unit AS ali_order_unit,
              alb.title AS alb_title,
              alb.product_url AS alb_url,
              alb.price_brl AS alb_price,
              alb.verdict AS alb_verdict,
              alb.score AS alb_score,
              alb.min_order AS alb_min_order,
              alb.order_unit AS alb_order_unit
       FROM listings l
       LEFT JOIN supplier_matches ali
         ON ali.ml_item_id = l.item_id AND ali.source = 'aliexpress' AND ali.rank = 1
       LEFT JOIN supplier_matches alb
         ON alb.ml_item_id = l.item_id AND alb.source = 'alibaba' AND alb.rank = 1
       WHERE l.price IS NOT NULL
         AND ($1::text IS NULL OR l.department_name = $1)
     )
     SELECT json_build_object(
       'summary', json_build_object(
         'discovered', (SELECT count(*)::int FROM joined),
         'matched', (
           SELECT count(*)::int FROM joined
           WHERE ali_price IS NOT NULL OR alb_price IS NOT NULL
         ),
         'strong', (
           SELECT count(*)::int FROM joined
           WHERE ali_verdict IN ('foto', 'modelo') OR alb_verdict IN ('foto', 'modelo')
         ),
         'scraped_at', (SELECT max(scraped_at) FROM joined)
       ),
       'matched', (
         SELECT coalesce(json_agg(to_jsonb(m)), '[]'::json)
         FROM (
           SELECT item_id, category_id, category_name, title, price, original_price,
                  permalink, thumbnail, rank, free_shipping, sold_quantity, sold_label,
                  department_name, ali_title, ali_url, ali_price, ali_verdict, ali_score,
                  ali_min_order, ali_order_unit, alb_title, alb_url, alb_price, alb_verdict,
                  alb_score, alb_min_order, alb_order_unit
           FROM joined
           WHERE ali_price IS NOT NULL OR alb_price IS NOT NULL
         ) m
       ),
       'sourcing', (
         SELECT coalesce(json_agg(to_jsonb(s)), '[]'::json)
         FROM (
           SELECT item_id, title, thumbnail, permalink, department_name, category_name,
                  category_id, rank, price, original_price, sold_quantity, sold_label,
                  free_shipping
           FROM joined
           WHERE ali_price IS NULL AND alb_price IS NULL
           ORDER BY (COALESCE(sold_quantity, 0) * price) DESC NULLS LAST, rank ASC
           LIMIT 60
         ) s
       ),
       'departments', (
         SELECT coalesce(json_agg(to_jsonb(d)), '[]'::json)
         FROM (
           SELECT department_name,
                  count(*)::int AS products,
                  count(*) FILTER (WHERE ali_price IS NOT NULL OR alb_price IS NOT NULL)::int AS matched,
                  percentile_cont(0.5) WITHIN GROUP (ORDER BY price)::float AS median_price,
                  percentile_cont(0.5) WITHIN GROUP (ORDER BY sold_quantity)::float AS median_sold,
                  avg(CASE WHEN original_price > price THEN 1.0 ELSE 0.0 END)::float AS promo_rate,
                  avg(CASE WHEN price >= 79 THEN 1.0 ELSE 0.0 END)::float AS above79_rate
           FROM joined
           WHERE department_name IS NOT NULL
           GROUP BY department_name
           ORDER BY count(*) DESC
         ) d
       ),
       'department_names', (
         SELECT coalesce(json_agg(department_name ORDER BY department_name), '[]'::json)
         FROM (SELECT DISTINCT department_name FROM best_sellers WHERE department_name IS NOT NULL) n
       )
     ) AS payload`,
    [department],
  );

  const payload = result.rows[0]?.payload;
  if (!payload) {
    return emptyDashboard();
  }

  const discovered = payload.summary.discovered ?? 0;
  const matchedCount = payload.summary.matched ?? 0;
  const strongMatches = payload.summary.strong ?? 0;

  const allRows: OpportunityRow[] = [];
  let floorHits = 0;

  for (const row of payload.matched ?? []) {
    const price = numberOrNull(row.price);
    if (price == null) continue;
    const offer = pickOffer(row, filters.source);
    if (!offer) continue;

    const matchStrength = scoreMatch(offer.verdict);
    const cost = computeCost({
      priceBrl: price,
      supplierCostBrl: offer.priceBrl,
      source: offer.source,
      matchStrength,
    });
    const decision = decide({ hasMatch: true, matchStrength, cost });
    if (
      cost.contributionMarginPct >= BASE_SCENARIO.marginFloorPct &&
      cost.contributionMarginBrl >= BASE_SCENARIO.marginFloorBrl
    ) {
      floorHits += 1;
    }

    const minOrder = offer.minOrder;
    allRows.push({
      itemId: row.item_id,
      title: row.title,
      thumbnail: row.thumbnail,
      permalink: row.permalink,
      departmentName: row.department_name || "Outros",
      categoryName: row.category_name || row.category_id,
      rank: row.rank,
      price,
      originalPrice: numberOrNull(row.original_price),
      soldQuantity: row.sold_quantity,
      soldLabel: row.sold_label,
      freeShipping: row.free_shipping,
      source: offer.source,
      supplierTitle: offer.title,
      supplierUrl: offer.url,
      supplierCostBrl: offer.priceBrl,
      minOrder,
      orderUnit: offer.orderUnit,
      verdict: offer.verdict,
      score: offer.score,
      matchStrength,
      lotCapitalBrl:
        minOrder != null && minOrder > 1 ? round2(minOrder * offer.priceBrl) : offer.priceBrl,
      decision,
      cost,
    });
  }

  const visibleRows = allRows
    .filter((row) => filters.decision === "todas" || row.decision === filters.decision)
    .sort(compareOpportunities);

  const decisions: Record<Decision, number> = { comprar: 0, observar: 0, descartar: 0 };
  for (const row of allRows) decisions[row.decision] += 1;

  return {
    scrapedAt: payload.summary.scraped_at,
    scenarioName: BASE_SCENARIO.name,
    ruleVersion: BASE_SCENARIO.ruleVersion,
    fxUsdBrl: BASE_SCENARIO.fxUsdBrl,
    floorPct: BASE_SCENARIO.marginFloorPct * 100,
    floorBrl: BASE_SCENARIO.marginFloorBrl,
    discovered,
    matched: matchedCount,
    coverage: discovered === 0 ? 0 : matchedCount / discovered,
    decisions,
    funnel: [
      { key: "discovered", label: "Descobertos na vitrine", value: discovered },
      { key: "matched", label: "Com correspondência", value: matchedCount },
      { key: "strong", label: "Foto ou modelo batem", value: strongMatches },
      { key: "floor", label: "Margem no piso (25% e R$ 15)", value: floorHits },
      { key: "buy", label: "Comprar (confiança oficial)", value: decisions.comprar },
    ],
    histogram: buildHistogram(visibleRows),
    rows: visibleRows,
    sourcing: (payload.sourcing ?? []).map(toSourcingRow),
    departments: (payload.departments ?? []).map((row) => ({
      department: row.department_name,
      products: row.products,
      matched: row.matched,
      matchRate: row.products === 0 ? 0 : row.matched / row.products,
      medianPrice: row.median_price,
      medianSold: row.median_sold,
      promoRate: row.promo_rate,
      above79Rate: row.above79_rate,
    })),
    departmentNames: payload.department_names ?? [],
  };
}

function emptyDashboard(): OpportunityDashboard {
  return {
    scrapedAt: null,
    scenarioName: BASE_SCENARIO.name,
    ruleVersion: BASE_SCENARIO.ruleVersion,
    fxUsdBrl: BASE_SCENARIO.fxUsdBrl,
    floorPct: BASE_SCENARIO.marginFloorPct * 100,
    floorBrl: BASE_SCENARIO.marginFloorBrl,
    discovered: 0,
    matched: 0,
    coverage: 0,
    decisions: { comprar: 0, observar: 0, descartar: 0 },
    funnel: [],
    histogram: [],
    rows: [],
    sourcing: [],
    departments: [],
    departmentNames: [],
  };
}

function toSourcingRow(row: SourcingSqlRow): SourcingRow {
  const price = numberOrNull(row.price) ?? 0;
  const originalPrice = numberOrNull(row.original_price);
  return {
    itemId: row.item_id,
    title: row.title,
    thumbnail: row.thumbnail,
    permalink: row.permalink,
    departmentName: row.department_name || "Outros",
    categoryName: row.category_name || row.category_id,
    rank: row.rank,
    price,
    originalPrice,
    soldQuantity: row.sold_quantity,
    soldLabel: row.sold_label,
    freeShipping: row.free_shipping,
    promo: originalPrice != null && originalPrice > price,
    aboveFreightThreshold: price >= BASE_SCENARIO.freeShippingThreshold,
  };
}

function pickOffer(row: ListingRow, source: OpportunityFilters["source"]) {
  const ali = quoteFrom(
    "aliexpress",
    row.ali_title,
    row.ali_url,
    row.ali_price,
    row.ali_verdict,
    row.ali_score,
    row.ali_min_order,
    row.ali_order_unit,
  );
  const alb = quoteFrom(
    "alibaba",
    row.alb_title,
    row.alb_url,
    row.alb_price,
    row.alb_verdict,
    row.alb_score,
    row.alb_min_order,
    row.alb_order_unit,
  );
  if (source === "aliexpress") return ali;
  if (source === "alibaba") return alb;
  if (ali && alb) return ali;
  return ali ?? alb;
}

function quoteFrom(
  source: "aliexpress" | "alibaba",
  title: string | null,
  url: string | null,
  price: string | number | null,
  verdict: string | null,
  score: string | number | null,
  minOrder: string | number | null,
  orderUnit: string | null,
) {
  const priceBrl = numberOrNull(price);
  if (title == null || priceBrl == null) return null;
  return {
    source,
    title,
    url,
    priceBrl,
    verdict,
    score: numberOrNull(score),
    minOrder: numberOrNull(minOrder),
    orderUnit,
  };
}

function compareOpportunities(left: OpportunityRow, right: OpportunityRow) {
  const rank: Record<Decision, number> = { comprar: 0, observar: 1, descartar: 2 };
  if (rank[left.decision] !== rank[right.decision]) {
    return rank[left.decision] - rank[right.decision];
  }
  return right.cost.contributionMarginBrl - left.cost.contributionMarginBrl;
}

function buildHistogram(rows: OpportunityRow[]) {
  const bins = [
    { bin: "< 0%", start: -Infinity, end: 0 },
    { bin: "0–10%", start: 0, end: 0.1 },
    { bin: "10–20%", start: 0.1, end: 0.2 },
    { bin: "20–25%", start: 0.2, end: 0.25 },
    { bin: "25–35%", start: 0.25, end: 0.35 },
    { bin: "35%+", start: 0.35, end: Infinity },
  ];
  return bins.map(({ bin, start, end }) => ({
    bin,
    start,
    count: rows.filter((row) => {
      const pct = row.cost.contributionMarginPct;
      return pct >= start && pct < end;
    }).length,
  }));
}

function numberOrNull(value: string | number | null) {
  if (value == null) return null;
  if (typeof value === "number") return Number.isNaN(value) ? null : value;
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}
