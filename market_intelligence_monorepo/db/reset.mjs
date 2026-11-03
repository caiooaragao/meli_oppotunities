// Apaga todos os dados das tabelas do app (estrutura permanece).
// Uso: npm run db:reset
import pg from "pg";
import { loadEnv, connectionString } from "../scrapers/lib/env.mjs";

const TABLES = [
  "supplier_matches",
  "supplier_match_runs",
  "supplier_offers",
  "supplier_searches",
  "best_sellers",
];

loadEnv();
const client = new pg.Client({ connectionString: connectionString() });
await client.connect();

const found = await client.query(
  `SELECT tablename FROM pg_tables
   WHERE schemaname = 'public' AND tablename = ANY($1::text[])`,
  [TABLES],
);

if (found.rows.length === 0) {
  console.log("Nenhuma tabela conhecida no banco; nada a apagar.");
  await client.end();
  process.exit(0);
}

const names = found.rows.map((row) => row.tablename).join(", ");
await client.query(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);
console.log(`Tabelas zeradas: ${names}`);
await client.end();
