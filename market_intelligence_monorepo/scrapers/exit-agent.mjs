#!/usr/bin/env node
// Rode no computador de casa (IP residencial), com o Node instalado:
//   node agente-residencial.mjs
// Deixe esta janela aberta enquanto a VPS faz o scrape do AliExpress.
const HUB = process.env.EXIT_HUB || "__HUB__";
const TOKEN = process.env.EXIT_TOKEN || "__TOKEN__";

const ALLOWED_HOST =
  /(^|\.)((aliexpress\.(com|us|ru))|alibaba\.com|aliexpress-media\.com|alicdn\.com)$/i;

if (HUB.includes("__HUB__") || TOKEN.includes("__TOKEN__")) {
  console.error("Baixe o arquivo pelo botão no site da VPS; este modelo não traz o endereço.");
  process.exit(1);
}

function allowed(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ALLOWED_HOST.test(url.hostname);
  } catch {
    return false;
  }
}

async function waitForJob() {
  const response = await fetch(`${HUB}/wait?token=${encodeURIComponent(TOKEN)}`, {
    signal: AbortSignal.timeout(35_000),
  });
  if (response.status === 204) return null;
  if (response.status === 401) throw new Error("token inválido");
  if (!response.ok) throw new Error(`hub HTTP ${response.status}`);
  return response.json();
}

async function runJob(job) {
  if (!allowed(job.url)) throw new Error(`url recusada: ${job.url}`);
  const response = await fetch(job.url, {
    method: job.method || "GET",
    signal: AbortSignal.timeout(25_000),
    redirect: "follow",
    headers: job.headers || {},
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  const headers = {};
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") return;
    headers[key] = value;
  });
  const setCookie =
    typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  const posted = await fetch(`${HUB}/result`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: TOKEN,
      id: job.id,
      status: response.status,
      headers,
      setCookie,
      body: buffer.toString("base64"),
    }),
  });
  if (!posted.ok) throw new Error(`falha ao devolver job (${posted.status})`);
}

console.log(`agente residencial → ${HUB}`);
console.log("Deixe aberto. Ctrl+C para sair.");

for (;;) {
  try {
    const job = await waitForJob();
    if (!job) continue;
    await runJob(job);
    process.stdout.write(".");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/timeout|aborted/i.test(message)) continue;
    console.warn(`\n${message}`);
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}
