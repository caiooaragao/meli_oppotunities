import { Pool } from "pg";

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgres://mi:mi@localhost:5432/market_intelligence",
});
