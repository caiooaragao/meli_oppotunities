import { agentToken, HUB_URL } from "./exit-hub.mjs";

export async function exitFetch(url, init = {}) {
  const headers = init.headers || {};
  const headerObject = headers instanceof Headers ? Object.fromEntries(headers) : { ...headers };
  try {
    const response = await fetch(`${HUB_URL}/fetch`, {
      method: "POST",
      signal: init.signal ?? AbortSignal.timeout(35_000),
      headers: {
        Authorization: `Bearer ${agentToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: String(url),
        method: init.method || "GET",
        headers: headerObject,
      }),
    });
    if (response.status === 503 || response.status === 401) {
      return fetch(url, init);
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `exit-hub HTTP ${response.status}`);
    }
    const payload = await response.json();
    const out = new Headers(payload.headers || {});
    for (const cookie of payload.setCookie || []) out.append("set-cookie", cookie);
    return new Response(Buffer.from(String(payload.body || ""), "base64"), {
      status: payload.status,
      headers: out,
    });
  } catch (error) {
    if (error instanceof TypeError || /ECONNREFUSED|fetch failed/i.test(error.message)) {
      return fetch(url, init);
    }
    throw error;
  }
}
