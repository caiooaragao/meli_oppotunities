import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const HUB_PORT = Number(process.env.EXIT_HUB_PORT || 8787);
export const HUB_URL = process.env.EXIT_HUB_URL || `http://127.0.0.1:${HUB_PORT}`;

const AGENT_TTL_MS = 45_000;
const WAIT_MS = 25_000;
const FETCH_MS = 30_000;

const ALLOWED_HOST =
  /(^|\.)((aliexpress\.(com|us|ru))|alibaba\.com|aliexpress-media\.com|alicdn\.com)$/i;

let lastSeen = 0;
const waiters = [];
const queued = [];
const inflight = new Map();

export function agentToken() {
  return process.env.EXIT_AGENT_TOKEN || "mi-exit-local";
}

export function isAllowedUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ALLOWED_HOST.test(url.hostname);
  } catch {
    return false;
  }
}

export function hubStatus() {
  return {
    connected: Date.now() - lastSeen < AGENT_TTL_MS,
    lastSeen: lastSeen || null,
  };
}

function sendJson(response, status, body) {
  const json = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  response.end(json);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function tokenOf(request, query, body) {
  const header = request.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return query.get("token") || body?.token || "";
}

function authorized(request, query, body) {
  return tokenOf(request, query, body) === agentToken();
}

function takeWaiter() {
  while (waiters.length > 0) {
    const waiter = waiters.shift();
    if (!waiter.done) return waiter;
  }
  return null;
}

function offerJob(job) {
  const waiter = takeWaiter();
  if (waiter) {
    waiter.done = true;
    waiter.resolve(job);
    return;
  }
  queued.push(job);
}

async function handleWait(response) {
  lastSeen = Date.now();
  if (queued.length > 0) {
    sendJson(response, 200, queued.shift());
    return;
  }
  const job = await new Promise((resolve) => {
    const waiter = { resolve, done: false };
    waiters.push(waiter);
    setTimeout(() => {
      if (waiter.done) return;
      waiter.done = true;
      resolve(null);
    }, WAIT_MS);
  });
  if (!job) {
    response.writeHead(204, { "Cache-Control": "no-store" });
    response.end();
    return;
  }
  sendJson(response, 200, job);
}

function handleResult(body, response) {
  const pending = inflight.get(body?.id);
  if (!pending) {
    sendJson(response, 404, { error: "job desconhecido" });
    return;
  }
  inflight.delete(body.id);
  pending.resolve({
    status: Number(body.status) || 502,
    headers: body.headers && typeof body.headers === "object" ? body.headers : {},
    setCookie: Array.isArray(body.setCookie) ? body.setCookie : [],
    body: String(body.body || ""),
  });
  sendJson(response, 200, { ok: true });
}

async function handleFetch(body, response) {
  const url = String(body?.url || "");
  if (!isAllowedUrl(url)) {
    sendJson(response, 400, { error: "url fora dos sites permitidos" });
    return;
  }
  if (Date.now() - lastSeen >= AGENT_TTL_MS) {
    sendJson(response, 503, { error: "agente desconectado" });
    return;
  }

  const id = randomUUID();
  const job = {
    id,
    url,
    method: body.method || "GET",
    headers: body.headers && typeof body.headers === "object" ? body.headers : {},
  };
  const result = new Promise((resolve, reject) => {
    inflight.set(id, { resolve, reject });
    setTimeout(() => {
      if (!inflight.has(id)) return;
      inflight.delete(id);
      reject(new Error("agente não respondeu a tempo"));
    }, FETCH_MS);
  });
  offerJob(job);

  try {
    sendJson(response, 200, await result);
  } catch (error) {
    sendJson(response, 504, { error: error instanceof Error ? error.message : String(error) });
  }
}

export async function handleHubRequest(request, response) {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (request.method === "GET" && (path === "/status" || path === "/")) {
    sendJson(response, 200, hubStatus());
    return;
  }

  let body = null;
  if (request.method === "POST") {
    try {
      body = JSON.parse((await readBody(request)) || "{}");
    } catch {
      sendJson(response, 400, { error: "json inválido" });
      return;
    }
  }

  if (!authorized(request, url.searchParams, body)) {
    sendJson(response, 401, { error: "token inválido" });
    return;
  }

  if (request.method === "GET" && path === "/wait") {
    await handleWait(response);
    return;
  }
  if (request.method === "POST" && path === "/result") {
    handleResult(body, response);
    return;
  }
  if (request.method === "POST" && path === "/fetch") {
    await handleFetch(body, response);
    return;
  }

  sendJson(response, 404, { error: "não encontrado" });
}

export function ensureHub() {
  if (globalThis.__exitHubServer) return globalThis.__exitHubServer;
  const server = createServer((request, response) => {
    handleHubRequest(request, response).catch((error) => {
      if (!response.headersSent) {
        sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
      }
    });
  });
  server.listen(HUB_PORT, "127.0.0.1");
  server.on("error", (error) => {
    if (error && error.code === "EADDRINUSE") return;
    console.warn(`exit-hub: ${error.message}`);
  });
  globalThis.__exitHubServer = server;
  return server;
}

const isMain =
  Boolean(process.argv[1]) &&
  resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
if (isMain) {
  ensureHub();
  console.log(`exit-hub em ${HUB_URL} (só localhost; o agente entra pelo site)`);
}
