// Mercado Livre best sellers + the same product on AliExpress and Alibaba, in one run.
//
//   node scrapers/run.mjs                       tudo
//   node scrapers/run.mjs --only=ml             só os mais vendidos
//   node scrapers/run.mjs --only=suppliers      só a busca nos fornecedores
//   node scrapers/run.mjs --limit=200 --fresh   refaz as buscas dos 200 primeiros
//
// Env: WORKERS (threads, 8; Alibaba usa todas, AliExpress reserva 2–4 para si),
//      SUPPLIER_SOURCES (aliexpress,alibaba), DATABASE_URL,
//      SUPPLIER_CONCURRENCY (produtos em paralelo no Alibaba, 64),
//      ALIEXPRESS_CONCURRENCY (produtos em paralelo no AliExpress, 8),
//      ALIBABA_GAP_MS (150, dobra a cada captcha),
//      ALIEXPRESS_GAP_MS (500; o site mobile aguentou 160 buscas/min, o desktop bloqueia em 10),
//      ALIEXPRESS_PAGES (páginas de 20 itens por busca, 2),
//      EXIT_AGENT_TOKEN (token do agente residencial), EXIT_HUB_PORT (8787, só localhost).
import { availableParallelism } from "node:os";
import pg from "pg";
import {
  crossCheck,
  ensureSchema,
  loadPendingProducts,
  loadTitles,
  purgeStaleMatches,
  saveBestSellers,
  saveMatch,
  summarize,
} from "./lib/db.mjs";
import { connectionString, loadEnv } from "./lib/env.mjs";
import { ensureHub, hubStatus } from "./lib/exit-hub.mjs";
import { MATCHER_VERSION, wordFrequency } from "./lib/match.mjs";
import { fetchHome } from "./lib/mercadolivre.mjs";
import { createPool, mapLimit } from "./lib/pool.mjs";

const PRODUCTS_PER_CATEGORY = 20;
const TREE_LEVELS = 2;
// The worker already waits the block out and retries several times before giving a product up as
// blocked; this many in a row means the IP is not coming back this run.
const ALIEXPRESS_MAX_BLOCKS = 3;

function parseArgs(argv) {
  const args = { only: null, limit: 0, fresh: false };
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, "").split("=");
    if (key === "only") args.only = value;
    else if (key === "limit") args.limit = Number(value) || 0;
    else if (key === "fresh") args.fresh = true;
  }
  if (args.only && !["ml", "suppliers"].includes(args.only)) {
    throw new Error(`--only aceita ml ou suppliers, recebeu ${args.only}`);
  }
  return args;
}

async function runAll(pool, kind, jobs, label) {
  const results = [];
  const errors = [];
  let finished = 0;
  await Promise.all(
    jobs.map((payload) =>
      pool
        .run(kind, payload)
        .then((result) => results.push(result))
        .catch((error) => {
          if (errors.length < 5) console.warn(`${label}: ${error.message}`);
          errors.push(error.message);
        })
        .finally(() => {
          finished += 1;
          if (finished % 500 === 0 || finished === jobs.length) {
            console.log(`${label}: ${finished}/${jobs.length}`);
          }
        }),
    ),
  );
  return { results, errors };
}

async function discoverCategories(pool, rootIds) {
  const categories = new Map();
  let frontier = rootIds;

  for (let level = 0; level < TREE_LEVELS && frontier.length > 0; level += 1) {
    const wave = await runAll(
      pool,
      "category",
      frontier.map((categoryId) => ({ categoryId })),
      `árvore nível ${level + 1}`,
    );
    const next = [];
    for (const category of wave.results) {
      categories.set(category.id, category);
      for (const child of category.children) {
        if (!categories.has(child.id)) {
          categories.set(child.id, { ...child, department: category.department, children: [] });
        }
        next.push(child.id);
      }
    }
    frontier = [...new Set(next)];
  }
  return categories;
}

function topPerCategory(lists, categories) {
  const catalog = new Map();
  for (const products of lists) {
    for (const product of products) {
      const key = `${product.itemId}:${product.categoryId}`;
      const current = catalog.get(key);
      if (!current || product.position < current.rank) {
        catalog.set(key, { ...product, rank: product.position });
      }
    }
  }

  const byCategory = new Map();
  for (const product of catalog.values()) {
    const list = byCategory.get(product.categoryId) || [];
    list.push(product);
    byCategory.set(product.categoryId, list);
  }

  const selected = [];
  for (const list of byCategory.values()) {
    list.sort((left, right) => left.rank - right.rank || left.title.localeCompare(right.title, "pt-BR"));
    for (const product of list.slice(0, PRODUCTS_PER_CATEGORY)) {
      const category = categories.get(product.categoryId);
      selected.push({
        ...product,
        categoryName: category?.name || product.categoryId,
        departmentName: category?.department || null,
      });
    }
  }
  return selected;
}

async function scrapeMercadoLivre(pool, rootIds, db) {
  console.log(`departamentos: ${rootIds.length}`);
  const categories = await discoverCategories(pool, rootIds);
  console.log(`categorias na árvore: ${categories.size}`);

  const sales = await runAll(
    pool,
    "topsales",
    [...categories.keys()].map((categoryId) => ({ categoryId })),
    "mais vendidos",
  );
  if (sales.errors.length > 0) console.log(`falhas ao buscar rankings: ${sales.errors.length}`);

  const products = topPerCategory(sales.results, categories);
  if (products.length === 0) throw new Error("Nenhum mais vendido coletado; best_sellers ficou como estava");
  await saveBestSellers(db, products);
  const unique = new Set(products.map((product) => product.itemId)).size;
  console.log(`gravados ${products.length} produtos (${unique} anúncios distintos)`);
}

function formatOffer(result, crossed) {
  if (result.error) return result.blocked ? "bloqueado" : `erro: ${result.error}`;
  const best = result.offers[0];
  if (!best) return `sem o mesmo produto (${result.candidateCount} candidatos)`;
  const price = best.priceBrl.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return `${price} ${best.verdict}${crossed ? " ✓ bate com o outro site" : ""}`;
}

const LANE_TAG = { aliexpress: "ali ", alibaba: "baba" };

function laneConcurrency(source) {
  return source === "aliexpress"
    ? Number(process.env.ALIEXPRESS_CONCURRENCY || 8)
    : Number(process.env.SUPPLIER_CONCURRENCY || 64);
}

// AliExpress keeps 2–4 threads of its own so Alibaba's 64 in-flight jobs cannot starve it.
function laneThreads(source, threads) {
  if (source === "aliexpress") return Math.max(2, Math.min(4, threads));
  return Math.max(2, threads);
}

// Each site gets its own queue, its own worker pool and its own pace. A block or a backlog
// on one never takes threads from the other.
async function matchSuppliers(args, db, { threads, slots, gaps }) {
  const sources = (process.env.SUPPLIER_SOURCES || "aliexpress,alibaba")
    .split(",")
    .map((source) => source.trim())
    .filter(Boolean);
  const stale = await purgeStaleMatches(db, { sources, version: MATCHER_VERSION });
  if (stale > 0) console.log(`${stale} correspondências de regras antigas apagadas; serão refeitas`);
  const products = await loadPendingProducts(db, {
    sources,
    version: MATCHER_VERSION,
    limit: args.limit,
    fresh: args.fresh,
  });
  const frequency = wordFrequency(await loadTitles(db));
  const lanes = sources.map((source) => {
    const concurrency = laneConcurrency(source);
    const workers = laneThreads(source, threads);
    return {
      source,
      products: products.filter((product) => !product.done.includes(source)),
      concurrency,
      workers,
      pool: createPool(
        workers,
        { slots, gaps, frequency },
        Math.max(1, Math.ceil(concurrency / workers)),
      ),
      finished: 0,
      matched: 0,
    };
  });
  console.log(`${products.length} anúncios do Mercado Livre pendentes (regras v${MATCHER_VERSION})`);
  for (const lane of lanes) {
    console.log(
      `  ${lane.source}: ${lane.products.length} para buscar, ${lane.concurrency} em paralelo ` +
        `(${lane.workers} threads próprias)`,
    );
  }

  const writerSlots = lanes.reduce((sum, lane) => sum + lane.concurrency, 0);
  const writer = new pg.Pool({ connectionString: connectionString(), max: Math.min(writerSlots, 16) });
  const startedAt = Date.now();
  const aliexpress = { blocks: 0 };

  async function runLane(lane) {
    const { source } = lane;
    const tag = LANE_TAG[source] || source;
    await mapLimit(lane.products, lane.concurrency, async (product) => {
      if (source === "aliexpress" && aliexpress.blocks >= ALIEXPRESS_MAX_BLOCKS) return;

      let result;
      try {
        result = (await lane.pool.run("match", { product, sources: [source] })).results[source];
      } catch (error) {
        lane.finished += 1;
        console.warn(`${tag} falha ${product.itemId}: ${error.message}`);
        return;
      }

      if (source === "aliexpress") {
        if (result.blocked) {
          aliexpress.blocks += 1;
          if (aliexpress.blocks >= ALIEXPRESS_MAX_BLOCKS) {
            console.warn(
              "AliExpress seguiu bloqueado depois das pausas; desligado até o próximo run " +
                "(o Alibaba continua, e o próximo run retoma de onde parou)",
            );
          }
        } else if (!result.error) {
          aliexpress.blocks = 0;
        }
      }

      // A blocked search is saved as an error, so the product stays pending for the next run.
      let crossed = null;
      try {
        await saveMatch(writer, product.itemId, source, result, MATCHER_VERSION);
        crossed = result.error ? null : await crossCheck(writer, product.itemId);
      } catch (error) {
        lane.finished += 1;
        console.warn(`${tag} falha ao gravar ${product.itemId}: ${error.message}`);
        return;
      }
      lane.finished += 1;
      if (result.offers.length > 0) lane.matched += 1;

      console.log(
        `${tag} ${String(lane.finished).padStart(6, " ")}/${lane.products.length} ` +
          `${result.query || product.title} | ${formatOffer(result, crossed)}`,
      );
      if (lane.finished % 200 === 0) {
        const perMinute = lane.finished / ((Date.now() - startedAt) / 60_000);
        const remaining = (lane.products.length - lane.finished) / perMinute;
        console.log(
          `--- ${source}: ${Math.round(perMinute)} anúncios/min, ${lane.matched} achados, ` +
            `faltam ~${Math.round(remaining)} min ---`,
        );
      }
    });
    console.log(`--- ${source} terminou: ${lane.matched}/${lane.finished} com o mesmo produto ---`);
  }

  try {
    await Promise.all(lanes.map(runLane));
  } finally {
    await writer.end();
    await Promise.all(lanes.map((lane) => lane.pool.close()));
  }
}

async function main() {
  loadEnv();
  ensureHub();
  const args = parseArgs(process.argv.slice(2));
  const threads = Number(process.env.WORKERS || Math.min(8, availableParallelism()));

  const db = new pg.Client({ connectionString: connectionString() });
  await db.connect();
  await ensureSchema(db);

  const slots = new SharedArrayBuffer(32);
  const gaps = {};
  if (process.env.ALIEXPRESS_GAP_MS) gaps.aliexpress = Number(process.env.ALIEXPRESS_GAP_MS);
  if (process.env.ALIBABA_GAP_MS) gaps.alibaba = Number(process.env.ALIBABA_GAP_MS);
  let pool;
  try {
    if (args.only !== "suppliers") {
      const home = await fetchHome();
      pool = createPool(threads, { cookie: home.cookie, slots });
      await scrapeMercadoLivre(pool, home.rootIds, db);
      await pool.close();
      pool = null;
    }
    if (args.only !== "ml") {
      const exit = hubStatus();
      console.log(
        exit.connected
          ? "AliExpress sai pelo agente residencial (IP de casa)"
          : "AliExpress sem agente: sai pelo IP desta máquina. No site, Baixar agente e rode no computador de casa.",
      );
      await matchSuppliers(args, db, { threads, slots, gaps });
      const summary = await summarize(db);
      console.log("cobertura:");
      for (const row of summary.sources) {
        console.log(`  ${row.source}: ${row.matched}/${row.searched} com o mesmo produto, ${row.errors} erros`);
      }
      console.log(
        `  anúncios do ML achados em algum site: ${summary.presence.any_site}; ` +
          `nos dois: ${summary.presence.both_sites}; conferidos entre os dois: ${summary.presence.crossed}`,
      );
    }
  } finally {
    await pool?.close();
    await db.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
