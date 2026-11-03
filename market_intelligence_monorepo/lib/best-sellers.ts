import { pool } from "./db";

export type BestSeller = {
  item_id: string;
  category_id: string;
  category_name: string | null;
  title: string;
  price: string | null;
  original_price: string | null;
  currency_id: string | null;
  permalink: string | null;
  thumbnail: string | null;
  rank: number;
  free_shipping: boolean;
  sold_quantity: number | null;
  sold_label: string | null;
  department_name: string | null;
  scraped_at: Date;
  aliexpress: SupplierQuote | null;
  alibaba: SupplierQuote | null;
};

export type SupplierQuote = {
  title: string;
  priceBrl: number | null;
  unitPriceBrl: number | null;
  packRatio: number;
  url: string | null;
  verdict: string | null;
  score: number | null;
  imageDistance: number | null;
  crossChecked: boolean;
  minOrder: number | null;
  orderUnit: string | null;
};

export type CatalogFilters = {
  query: string;
  department: string;
  category: string;
  shipping: "todos" | "gratis" | "pago";
  minPrice: string;
  maxPrice: string;
  minSold: string;
  aliMin: string;
  aliMax: string;
  alibabaMin: string;
  alibabaMax: string;
  presence: "algum" | "ambos" | "todos" | "so_meli" | "so_aliexpress";
  sort: "rank" | "price-asc" | "price-desc" | "sold-desc" | "title" | "gap-desc";
  page: number;
};

export type CatalogCategory = {
  department: string;
  name: string;
};

const PAGE_SIZE = 50;

export async function listCatalogFacets() {
  const [names, summary] = await Promise.all([
    pool.query<{ department_name: string; category_name: string }>(
      `SELECT DISTINCT department_name, category_name
       FROM best_sellers
       WHERE department_name IS NOT NULL AND category_name IS NOT NULL
       ORDER BY department_name, category_name`,
    ),
    pool.query<{ products: number; scraped_at: Date | null }>(
      `SELECT count(*)::int AS products, max(scraped_at) AS scraped_at FROM best_sellers`,
    ),
  ]);

  return {
    departments: [...new Set(names.rows.map((row) => row.department_name))],
    categories: names.rows.map((row) => ({
      department: row.department_name,
      name: row.category_name,
    })),
    products: summary.rows[0]?.products ?? 0,
    scrapedAt: summary.rows[0]?.scraped_at ?? null,
  };
}

export async function listBestSellers(filters: CatalogFilters): Promise<{
  rows: BestSeller[];
  total: number;
  page: number;
}> {
  const where: string[] = [];
  const values: unknown[] = [];
  const add = (clause: string, value: unknown) => {
    values.push(value);
    where.push(clause.replace("$#", `$${values.length}`));
  };

  if (filters.department && filters.department !== "todas") {
    add("department_name = $#", filters.department);
  }
  if (filters.category && filters.category !== "todas") {
    add("category_name = $#", filters.category);
  }
  if (filters.query.trim()) {
    add("title ILIKE $# ESCAPE '\\'", likePattern(filters.query.trim()));
  }
  if (filters.shipping === "gratis") where.push("free_shipping = true");
  if (filters.shipping === "pago") where.push("free_shipping = false");
  const minPrice = numberOrNull(filters.minPrice);
  const maxPrice = numberOrNull(filters.maxPrice);
  const minSold = numberOrNull(filters.minSold);
  if (minPrice != null) add("price >= $#", minPrice);
  if (maxPrice != null) add("price <= $#", maxPrice);
  if (minSold != null) add("sold_quantity >= $#", minSold);
  const aliMin = numberOrNull(filters.aliMin);
  const aliMax = numberOrNull(filters.aliMax);
  const alibabaMin = numberOrNull(filters.alibabaMin);
  const alibabaMax = numberOrNull(filters.alibabaMax);
  if (aliMin != null) add(`${gapSql("aliexpress")} >= $#`, aliMin);
  if (aliMax != null) add(`${gapSql("aliexpress")} <= $#`, aliMax);
  if (alibabaMin != null) add(`${gapSql("alibaba")} >= $#`, alibabaMin);
  if (alibabaMax != null) add(`${gapSql("alibaba")} <= $#`, alibabaMax);
  if (filters.presence === "so_meli") {
    where.push(
      `NOT EXISTS (
        SELECT 1 FROM supplier_matches
        WHERE ml_item_id = best_sellers.item_id AND rank = 1
      )`,
    );
  } else if (filters.presence === "so_aliexpress") {
    where.push(
      `EXISTS (
        SELECT 1 FROM supplier_matches
        WHERE ml_item_id = best_sellers.item_id AND source = 'aliexpress' AND rank = 1
      )`,
    );
    where.push(
      `NOT EXISTS (
        SELECT 1 FROM supplier_matches
        WHERE ml_item_id = best_sellers.item_id AND source = 'alibaba' AND rank = 1
      )`,
    );
  } else if (filters.presence === "ambos") {
    where.push(
      `(SELECT count(DISTINCT source) FROM supplier_matches
        WHERE ml_item_id = best_sellers.item_id AND rank = 1) >= 2`,
    );
  } else if (filters.presence === "algum") {
    where.push(
      `(SELECT count(DISTINCT source) FROM supplier_matches
        WHERE ml_item_id = best_sellers.item_id AND rank = 1) >= 1`,
    );
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const totalResult = await pool.query<{ total: number }>(
    `SELECT count(*)::int AS total FROM best_sellers ${whereSql}`,
    values,
  );
  const total = totalResult.rows[0]?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page || 1), pageCount);
  const pageValues = [...values, PAGE_SIZE, (page - 1) * PAGE_SIZE];
  const selectSql = `SELECT item_id,
            category_id,
            category_name,
            title,
            price::text AS price,
            original_price::text AS original_price,
            currency_id,
            permalink,
            thumbnail,
            rank,
            free_shipping,
            sold_quantity,
            sold_label,
            department_name,
            scraped_at
     FROM best_sellers
     ${whereSql}`;
  const limitSql = `LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
  const result = await pool
    .query<SellerRow>(`${selectSql} ${orderBy(filters.sort)} ${limitSql}`, pageValues)
    .catch((error: { code?: string }) => {
      if (filters.sort !== "gap-desc" || error.code !== "42P01") throw error;
      return pool.query<SellerRow>(
        `${selectSql} ${orderBy("rank")} ${limitSql}`,
        pageValues,
      );
    });

  const quotes = await loadOffers(result.rows).catch(() => [] as OfferRow[]);

  const byItem = new Map<string, Pick<BestSeller, "aliexpress" | "alibaba">>();
  for (const offer of quotes) {
    const current = byItem.get(offer.ml_item_id) ?? { aliexpress: null, alibaba: null };
    const quote = toQuote(offer);
    if (offer.source === "aliexpress") current.aliexpress = quote;
    if (offer.source === "alibaba") current.alibaba = quote;
    byItem.set(offer.ml_item_id, current);
  }

  return {
    rows: result.rows.map((row) => {
      const match = byItem.get(row.item_id);
      return {
        ...row,
        aliexpress: match?.aliexpress ?? null,
        alibaba: match?.alibaba ?? null,
      };
    }),
    total,
    page,
  };
}

function gapSql(source: "aliexpress" | "alibaba") {
  return `(price - (
    SELECT price_brl FROM supplier_matches
    WHERE ml_item_id = best_sellers.item_id AND source = '${source}' AND rank = 1
  ))`;
}

function likePattern(value: string) {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function orderBy(sort: CatalogFilters["sort"]) {
  if (sort === "price-asc") return "ORDER BY price ASC NULLS LAST, title ASC";
  if (sort === "price-desc") return "ORDER BY price DESC NULLS LAST, title ASC";
  if (sort === "sold-desc") return "ORDER BY sold_quantity DESC NULLS LAST, title ASC";
  if (sort === "title") return "ORDER BY title ASC";
  if (sort === "gap-desc") {
    return `ORDER BY (
      price - (
        SELECT min(price_brl) FROM supplier_matches
        WHERE ml_item_id = best_sellers.item_id AND rank = 1
      )
    ) DESC NULLS LAST, title ASC`;
  }
  return "ORDER BY department_name ASC, category_name ASC, rank ASC, title ASC";
}

async function loadOffers(rows: SellerRow[]) {
  if (rows.length === 0) return [] as OfferRow[];
  const itemIds = [...new Set(rows.map((row) => row.item_id))];
  const result = await pool.query<OfferRow>(
    `SELECT ml_item_id,
            source,
            title,
            price_brl::text AS price_brl,
            unit_price_brl::text AS unit_price_brl,
            pack_ratio,
            product_url,
            verdict,
            score::text AS score,
            image_distance,
            cross_checked,
            min_order::text AS min_order,
            order_unit
     FROM supplier_matches
     WHERE rank = 1 AND ml_item_id = ANY($1::text[])`,
    [itemIds],
  );
  return result.rows;
}

type SellerRow = Omit<BestSeller, "aliexpress" | "alibaba">;

type OfferRow = {
  ml_item_id: string;
  source: string;
  title: string;
  price_brl: string | null;
  unit_price_brl: string | null;
  pack_ratio: number;
  product_url: string | null;
  verdict: string | null;
  score: string | null;
  image_distance: number | null;
  cross_checked: boolean;
  min_order: string | null;
  order_unit: string | null;
};

function toQuote(offer: OfferRow): SupplierQuote {
  return {
    title: offer.title,
    priceBrl: numberOrNull(offer.price_brl),
    unitPriceBrl: numberOrNull(offer.unit_price_brl),
    packRatio: offer.pack_ratio,
    url: offer.product_url,
    verdict: offer.verdict,
    score: numberOrNull(offer.score),
    imageDistance: offer.image_distance,
    crossChecked: offer.cross_checked,
    minOrder: numberOrNull(offer.min_order),
    orderUnit: offer.order_unit,
  };
}

function numberOrNull(value: string | null) {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}
