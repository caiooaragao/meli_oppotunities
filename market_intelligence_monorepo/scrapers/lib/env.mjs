import { readFileSync } from "node:fs";

export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export function loadEnv() {
  try {
    const text = readFileSync(new URL("../../.env", import.meta.url), "utf8");
    for (const line of text.split("\n")) {
      const match = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // .env is optional when DATABASE_URL is already set.
  }
}

export function connectionString() {
  return process.env.DATABASE_URL || "postgres://mi:mi@localhost:5432/market_intelligence";
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
