export const HUB_URL = process.env.EXIT_HUB_URL || "http://127.0.0.1:8787";

export function agentToken() {
  return process.env.EXIT_AGENT_TOKEN || "mi-exit-local";
}

export async function hubGet(path: string, search = "") {
  return fetch(`${HUB_URL}${path}${search}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${agentToken()}` },
  });
}

export async function hubPost(path: string, body: unknown) {
  return fetch(`${HUB_URL}${path}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${agentToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
