import { agentToken, hubPost } from "@/lib/exit-hub-proxy";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { token?: string } | null;
  if (!body || body.token !== agentToken()) {
    return Response.json({ error: "token inválido" }, { status: 401 });
  }
  try {
    const response = await hubPost("/result", body);
    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "hub indisponível" }, { status: 503 });
  }
}
