import { connection } from "next/server";
import { hubGet } from "@/lib/exit-hub-proxy";

export async function GET() {
  await connection();
  try {
    const response = await hubGet("/status");
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ connected: false, lastSeen: null }, { status: 200 });
  }
}
