CREATE TABLE IF NOT EXISTS best_sellers (
  item_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  category_name TEXT,
  title TEXT NOT NULL,
  price NUMERIC(12, 2),
  original_price NUMERIC(12, 2),
  currency_id TEXT,
  permalink TEXT,
  thumbnail TEXT,
  rank INTEGER NOT NULL,
  free_shipping BOOLEAN NOT NULL DEFAULT FALSE,
  sold_quantity INTEGER,
  sold_label TEXT,
  department_name TEXT,
  source TEXT,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, category_id)
);

CREATE INDEX IF NOT EXISTS best_sellers_category_rank_idx
  ON best_sellers (category_name, rank);

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
  image_hash TEXT,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ml_item_id, source, rank)
);

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
);
