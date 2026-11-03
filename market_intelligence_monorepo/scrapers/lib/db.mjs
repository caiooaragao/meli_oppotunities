import { hammingDistance } from "./image.mjs";
import { IMAGE_SAME } from "./match.mjs";

export async function ensureSchema(client) {
  await client.query("ALTER TABLE best_sellers ADD COLUMN IF NOT EXISTS sold_quantity INTEGER");
  await client.query("ALTER TABLE best_sellers ADD COLUMN IF NOT EXISTS sold_label TEXT");
  await client.query("ALTER TABLE best_sellers ADD COLUMN IF NOT EXISTS department_name TEXT");
  await client.query(`
    CREATE TABLE IF NOT EXISTS supplier_matches (
      ml_item_id TEXT NOT NULL,
      source TEXT NOT NULL,
      rank INTEGER NOT NULL,
      offer_id TEXT NOT NULL,
      title TEXT NOT NULL,
      price_brl NUMERIC(14, 2) NOT NULL,
      unit_price_brl NUMERIC(14, 2),
      pack_ratio INTEGER NOT NULL DEFAULT 1,
      min_order NUMERIC(12, 2),
      order_unit TEXT,
      sold_label TEXT,
      store_name TEXT,
      product_url TEXT,
      thumbnail TEXT,
      verdict TEXT NOT NULL,
      score NUMERIC(4, 3),
      text_score NUMERIC(4, 3),
      spec_matched INTEGER,
      spec_total INTEGER,
      model_match BOOLEAN NOT NULL DEFAULT FALSE,
      image_distance INTEGER,
      cross_checked BOOLEAN NOT NULL DEFAULT FALSE,
      search_query TEXT,
      scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (ml_item_id, source, rank)
    )
  `);
  await client.query("ALTER TABLE supplier_matches ADD COLUMN IF NOT EXISTS image_hash TEXT");
  await client.query(`
    CREATE TABLE IF NOT EXISTS supplier_match_runs (
      ml_item_id TEXT NOT NULL,
      source TEXT NOT NULL,
      search_query TEXT,
      result_count INTEGER,
      candidate_count INTEGER,
      accepted_count INTEGER,
      rejections JSONB,
      error TEXT,
      matcher_version INTEGER NOT NULL,
      scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (ml_item_id, source)
    )
  `);
}

export async function saveBestSellers(client, products) {
  await client.query("BEGIN");
  try {
    await client.query("DELETE FROM best_sellers");
    const columns = [
      "item_id", "category_id", "category_name", "department_name", "title", "price",
      "original_price", "currency_id", "permalink", "thumbnail", "rank", "free_shipping",
      "sold_quantity", "sold_label", "source",
    ];
    const chunkSize = 150;
    for (let offset = 0; offset < products.length; offset += chunkSize) {
      const chunk = products.slice(offset, offset + chunkSize);
      const values = [];
      const placeholders = chunk.map((product, index) => {
        values.push(
          product.itemId, product.categoryId, product.categoryName, product.departmentName,
          product.title, product.price, product.originalPrice, product.currencyId,
          product.permalink, product.thumbnail, product.rank, product.freeShipping,
          product.soldQuantity, product.soldLabel, product.source,
        );
        const base = index * columns.length;
        return `(${columns.map((_, slot) => `$${base + slot + 1}`).join(", ")})`;
      });
      await client.query(
        `INSERT INTO best_sellers (${columns.join(", ")}) VALUES ${placeholders.join(", ")}`,
        values,
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

// Every distinct title in the catalogue, for the word frequencies the search queries use.
export async function loadTitles(client) {
  const result = await client.query("SELECT DISTINCT title FROM best_sellers");
  return result.rows.map((row) => row.title);
}

// Matches found with older rules are the ones the new rules exist to undo; drop them up front so
// the screens stop showing them while the run redoes those searches.
export async function purgeStaleMatches(client, { sources, version }) {
  const result = await client.query(
    `DELETE FROM supplier_matches m
     USING supplier_match_runs r
     WHERE r.ml_item_id = m.ml_item_id AND r.source = m.source
       AND m.source = ANY($1::text[]) AND r.matcher_version <> $2`,
    [sources, version],
  );
  await client.query(
    `UPDATE supplier_match_runs SET accepted_count = 0
     WHERE source = ANY($1::text[]) AND matcher_version <> $2 AND accepted_count > 0`,
    [sources, version],
  );
  return result.rowCount;
}

// One row per Mercado Livre item: the same ad shows up in a category and in its parent.
export async function loadPendingProducts(client, { sources, version, limit, fresh }) {
  const params = [sources, version, Boolean(fresh)];
  const limitSql = limit > 0 ? `LIMIT $${params.push(limit)}` : "";
  const result = await client.query(
    `WITH items AS (
       SELECT item_id,
              min(title) AS title,
              min(price) AS price,
              min(thumbnail) AS thumbnail,
              min(rank) AS best_rank,
              max(sold_quantity) AS sold
       FROM best_sellers
       WHERE price IS NOT NULL AND price > 0
       GROUP BY item_id
     )
     SELECT i.item_id, i.title, i.price, i.thumbnail,
            CASE WHEN $3::boolean THEN '{}'::text[] ELSE coalesce(d.done, '{}') END AS done
     FROM items i
     LEFT JOIN LATERAL (
       SELECT array_agg(r.source) AS done
       FROM supplier_match_runs r
       WHERE r.ml_item_id = i.item_id
         AND r.source = ANY($1::text[])
         AND r.error IS NULL
         AND r.matcher_version = $2
     ) d ON true
     WHERE $3::boolean OR coalesce(cardinality(d.done), 0) < cardinality($1::text[])
     ORDER BY i.best_rank, i.sold DESC NULLS LAST, i.item_id
     ${limitSql}`,
    params,
  );
  return result.rows.map((row) => ({
    itemId: row.item_id,
    title: row.title,
    price: Number(row.price),
    thumbnail: row.thumbnail,
    done: row.done || [],
  }));
}

export async function saveMatch(pool, itemId, source, result, version) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (!result.error) {
      await client.query("DELETE FROM supplier_matches WHERE ml_item_id = $1 AND source = $2", [
        itemId,
        source,
      ]);
      for (const [index, offer] of result.offers.entries()) {
        await client.query(
          `INSERT INTO supplier_matches (
             ml_item_id, source, rank, offer_id, title, price_brl, unit_price_brl, pack_ratio,
             min_order, order_unit, sold_label, store_name, product_url, thumbnail, verdict,
             score, text_score, spec_matched, spec_total, model_match, image_distance,
             cross_checked, search_query, image_hash
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24
           )
           ON CONFLICT (ml_item_id, source, rank) DO UPDATE
             SET offer_id = EXCLUDED.offer_id,
                 title = EXCLUDED.title,
                 price_brl = EXCLUDED.price_brl,
                 unit_price_brl = EXCLUDED.unit_price_brl,
                 pack_ratio = EXCLUDED.pack_ratio,
                 min_order = EXCLUDED.min_order,
                 order_unit = EXCLUDED.order_unit,
                 sold_label = EXCLUDED.sold_label,
                 store_name = EXCLUDED.store_name,
                 product_url = EXCLUDED.product_url,
                 thumbnail = EXCLUDED.thumbnail,
                 verdict = EXCLUDED.verdict,
                 score = EXCLUDED.score,
                 text_score = EXCLUDED.text_score,
                 spec_matched = EXCLUDED.spec_matched,
                 spec_total = EXCLUDED.spec_total,
                 model_match = EXCLUDED.model_match,
                 image_distance = EXCLUDED.image_distance,
                 cross_checked = EXCLUDED.cross_checked,
                 search_query = EXCLUDED.search_query,
                 image_hash = EXCLUDED.image_hash,
                 scraped_at = now()`,
          [
            itemId, source, index + 1, offer.offerId, offer.title, offer.priceBrl,
            offer.unitPriceBrl, offer.packRatio, offer.minOrder, offer.orderUnit,
            offer.soldLabel, offer.storeName, offer.productUrl, offer.thumbnail, offer.verdict,
            offer.score, offer.textScore, offer.specMatched, offer.specTotal, offer.modelMatch,
            offer.imageDistance, false, result.query, offer.imageHash || null,
          ],
        );
      }
    }
    await client.query(
      `INSERT INTO supplier_match_runs (
         ml_item_id, source, search_query, result_count, candidate_count, accepted_count,
         rejections, error, matcher_version
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (ml_item_id, source) DO UPDATE
         SET search_query = EXCLUDED.search_query,
             result_count = EXCLUDED.result_count,
             candidate_count = EXCLUDED.candidate_count,
             accepted_count = EXCLUDED.accepted_count,
             rejections = EXCLUDED.rejections,
             error = EXCLUDED.error,
             matcher_version = EXCLUDED.matcher_version,
             scraped_at = now()`,
      [
        itemId, source, result.query, result.resultCount, result.candidateCount,
        result.offers.length, JSON.stringify(result.rejections || {}), result.error || null,
        version,
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// Both sites only count as "the same item" when their winning offers also agree with each other.
// Each site runs at its own pace, so this runs whenever either one saves a new winner.
export async function crossCheck(pool, itemId) {
  const { rows } = await pool.query(
    `SELECT source, image_hash, model_match
     FROM supplier_matches
     WHERE ml_item_id = $1 AND rank = 1 AND source IN ('aliexpress', 'alibaba')`,
    [itemId],
  );
  const [left, right] = rows;
  const distance = right ? hammingDistance(left.image_hash, right.image_hash) : null;
  const crossChecked = Boolean(
    right && ((distance != null && distance <= IMAGE_SAME) || (left.model_match && right.model_match)),
  );
  if (rows.length === 0) return null;
  await pool.query(
    `UPDATE supplier_matches SET cross_checked = $2
     WHERE ml_item_id = $1 AND rank = 1 AND source IN ('aliexpress', 'alibaba')`,
    [itemId, crossChecked],
  );
  return right ? crossChecked : null;
}

export async function summarize(client) {
  const sources = await client.query(`
    SELECT source,
           count(*) AS searched,
           count(*) FILTER (WHERE accepted_count > 0) AS matched,
           count(*) FILTER (WHERE error IS NOT NULL) AS errors
    FROM supplier_match_runs
    GROUP BY source
    ORDER BY source
  `);
  const presence = await client.query(`
    SELECT count(*) FILTER (WHERE n >= 1) AS any_site,
           count(*) FILTER (WHERE n >= 2) AS both_sites,
           count(*) FILTER (WHERE crossed) AS crossed
    FROM (
      SELECT ml_item_id, count(DISTINCT source) AS n, bool_or(cross_checked) AS crossed
      FROM supplier_matches
      WHERE rank = 1
      GROUP BY ml_item_id
    ) m
  `);
  return { sources: sources.rows, presence: presence.rows[0] };
}
