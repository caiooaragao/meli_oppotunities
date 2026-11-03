export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { ensureHub } = await import("./scrapers/lib/exit-hub.mjs");
  ensureHub();
}
