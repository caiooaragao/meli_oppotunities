import { connection } from "next/server";
import { agentToken, hubGet } from "@/lib/exit-hub-proxy";

export const maxDuration = 60;

export async function GET(request: Request) {
  await connection();
  const token = new URL(request.url).searchParams.get("token") || "";
  if (token !== agentToken()) {
    return Response.json({ error: "token inválido" }, { status: 401 });
  }
  try {
    const response = await hubGet("/wait", `?token=${encodeURIComponent(token)}`);
    if (response.status === 204) return new Response(null, { status: 204 });
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "hub indisponível" }, { status: 503 });
  }
}
