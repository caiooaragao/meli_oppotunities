import { readFileSync } from "node:fs";
import { connection } from "next/server";
import { agentToken } from "@/lib/exit-hub-proxy";

export async function GET(request: Request) {
  await connection();
  const origin = new URL(request.url).origin;
  const template = readFileSync(new URL("../../../../scrapers/exit-agent.mjs", import.meta.url), "utf8");
  const script = template
    .replaceAll("__HUB__", `${origin}/api/exit`)
    .replaceAll("__TOKEN__", agentToken());
  return new Response(script, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Content-Disposition": "attachment; filename=agente-residencial.mjs",
      "Cache-Control": "no-store",
    },
  });
}
