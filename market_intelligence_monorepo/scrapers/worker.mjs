import { parentPort, workerData } from "node:worker_threads";
import { RateLimitError, searchAlibaba } from "./lib/alibaba.mjs";
import { AntiBotError, searchAliExpress } from "./lib/aliexpress.mjs";
import { sleep } from "./lib/env.mjs";
import { hammingDistance, imageHash } from "./lib/image.mjs";
import {
  VERDICT_RANK,
  buildQueries,
  compareText,
  distinctiveStems,
  features,
  offerFeatures,
  score,
  shareFunction,
  verdict,
} from "./lib/match.mjs";
import { fetchCategory, fetchTopSales } from "./lib/mercadolivre.mjs";

const SEARCH = { aliexpress: searchAliExpress, alibaba: searchAlibaba };
const IMAGE_CHECKS = 6;
const KEEP = 3;
const MAX_QUERIES = { aliexpress: 3, alibaba: 3 };
const wordShare = shareFunction(workerData.frequency);
// The AliExpress mobile site took 160 searches a minute without blocking; 500ms plus jitter keeps
// the run near 100. (The desktop site blocked past ten a minute, which is why it is not used.)
const GAP_MS = { aliexpress: 500, alibaba: 150, ...workerData.gaps };
const SLOT = { aliexpress: 0, alibaba: 1 };
// [next free slot per site..., current gap per site...], shared by every thread.
const shared = new BigInt64Array(workerData.slots ?? new SharedArrayBuffer(32));
const nextSlot = shared;
const GAP_OFFSET = 2;
for (const [source, index] of Object.entries(SLOT)) {
  Atomics.compareExchange(shared, GAP_OFFSET + index, 0n, BigInt(GAP_MS[source]));
}
// Alibaba shows a captcha for ~3 min once the IP goes past its rate; the AliExpress block lasts
// about five, so the pause has to outlive it or the next search just renews the block.
const PENALTY_MS = { aliexpress: 360_000, alibaba: 180_000 };
const MAX_GAP_MS = { aliexpress: 20_000, alibaba: 4_000 };
// How much slower the site gets after each block.
const GAP_GROWTH = { aliexpress: [2n, 1n], alibaba: [2n, 1n] };
const MAX_PENALTIES = 6;
// Both sites answer the queries of one product at once.
const PARALLEL_QUERIES = new Set(["alibaba", "aliexpress"]);

// Rate limit shared by every thread: each search reserves the next free slot for its site.
async function throttle(source) {
  const index = SLOT[source];
  const base = Number(Atomics.load(shared, GAP_OFFSET + index));
  const gap = BigInt(Math.round(base * (1 + Math.random() * 0.5)));
  for (;;) {
    const now = BigInt(Date.now());
    const current = Atomics.load(nextSlot, index);
    const slot = current > now ? current : now;
    if (Atomics.compareExchange(nextSlot, index, current, slot + gap) === current) {
      const wait = Number(slot - now);
      if (wait > 0) await sleep(wait);
      return;
    }
  }
}

// When a site starts throttling, every thread holds off that site together.
function cooldown(source, ms) {
  const index = SLOT[source];
  const until = BigInt(Date.now() + ms);
  for (;;) {
    const current = Atomics.load(nextSlot, index);
    if (current >= until) return;
    if (Atomics.compareExchange(nextSlot, index, current, until) === current) return;
  }
}

// Every in-flight request hits the captcha at once; only the first one pauses the site and
// slows it down, the rest just wait for that pause.
function penalize(source) {
  const index = SLOT[source];
  const penalty = PENALTY_MS[source];
  const now = BigInt(Date.now());
  const until = now + BigInt(penalty);
  for (;;) {
    const current = Atomics.load(nextSlot, index);
    if (current >= now + BigInt(penalty / 2)) return;
    if (Atomics.compareExchange(nextSlot, index, current, until) === current) break;
  }
  const gapIndex = GAP_OFFSET + index;
  const [num, den] = GAP_GROWTH[source];
  const gap = Atomics.load(shared, gapIndex);
  const grown = (gap * num) / den;
  const raised = grown > 100n ? grown : 100n;
  const cap = BigInt(MAX_GAP_MS[source]);
  Atomics.store(shared, gapIndex, raised < cap ? raised : cap);
  console.warn(
    `${source} pediu verificação; pausa de ${Math.round(penalty / 60_000)} min, ` +
      `depois 1 busca a cada ${Atomics.load(shared, gapIndex)}ms`,
  );
}

function isTransient(error) {
  return /HTTP (429|5\d\d)|timeout|aborted|fetch failed|respondeu|ECONNRESET|in JSON/i.test(error.message);
}

function isBlock(error) {
  return error instanceof RateLimitError || error instanceof AntiBotError;
}

// A block pauses the whole site for every thread and the same query is retried after it; only a
// block that survives several pauses comes back to the caller.
async function search(source, query) {
  let penalties = 0;
  for (let attempt = 0; ; attempt += 1) {
    await throttle(source);
    try {
      return await SEARCH[source](query);
    } catch (error) {
      if (isBlock(error) && penalties < MAX_PENALTIES) {
        penalties += 1;
        penalize(source);
        continue;
      }
      if (isBlock(error) || !isTransient(error) || attempt >= 3) throw error;
      cooldown(source, 1_000 * 2 ** attempt);
    }
  }
}

function sizedThumbnail(source, url) {
  if (!url) return null;
  if (source === "aliexpress" && !/_\d+x\d+/.test(url)) return `${url}_220x220.jpg`;
  return url;
}

function rankAccepted(left, right) {
  return (
    VERDICT_RANK[right.verdict] - VERDICT_RANK[left.verdict] ||
    Math.round(right.score * 20) - Math.round(left.score * 20) ||
    left.priceBrl - right.priceBrl
  );
}

async function matchSource(source, product, ml, mlImage, allQueries) {
  const queries = allQueries.slice(0, MAX_QUERIES[source] || allQueries.length);
  let resultCount = 0;
  let candidateCount = 0;
  const rejections = {};

  // Most products miss on the first query, so on sites that allow it both go out together.
  const prefetched = PARALLEL_QUERIES.has(source)
    ? queries.map((query) => {
        const request = search(source, query);
        request.catch(() => {});
        return request;
      })
    : null;

  for (const [queryIndex, query] of queries.entries()) {
    const found = prefetched ? await prefetched[queryIndex] : await search(source, query);
    resultCount += found.resultCount;

    const parsed = found.offers.map((offer) => ({ offer, features: offerFeatures(offer.title) }));
    const distinctive = distinctiveStems(ml, parsed.map((entry) => entry.features));
    const gated = [];
    for (const { offer, features: words } of parsed) {
      const check = compareText(ml, words, product.price, offer.priceBrl);
      if (check.rejected) {
        const reason = check.rejected.split(" (")[0];
        rejections[reason] = (rejections[reason] || 0) + 1;
        continue;
      }
      gated.push({ offer, words, check });
    }
    candidateCount += gated.length;
    gated.sort((left, right) => right.check.textScore - left.check.textScore);

    if (gated.length === 0) continue;
    const mlHash = await mlImage();
    const withImage = gated.slice(0, IMAGE_CHECKS);
    const hashes = mlHash
      ? await Promise.all(withImage.map(({ offer }) => imageHash(sizedThumbnail(source, offer.thumbnail))))
      : withImage.map(() => null);

    const accepted = [];
    gated.forEach(({ offer, words, check }, index) => {
      const offerHash = hashes[index] ?? null;
      const distance = hammingDistance(mlHash, offerHash);
      const kind = verdict(check, distance, words, distinctive);
      if (!kind) {
        rejections["sem confirmação"] = (rejections["sem confirmação"] || 0) + 1;
        return;
      }
      accepted.push({
        ...offer,
        unitPriceBrl: offer.priceBrl,
        priceBrl: check.priceBrl,
        packRatio: check.packRatio,
        verdict: kind,
        score: score(check, distance),
        textScore: Math.round(check.textScore * 1000) / 1000,
        specMatched: check.specMatched,
        specTotal: check.specTotal,
        modelMatch: check.modelMatch,
        imageDistance: distance,
        imageHash: offerHash,
      });
    });

    if (accepted.length > 0) {
      accepted.sort(rankAccepted);
      return { query, resultCount, candidateCount, offers: accepted.slice(0, KEEP), rejections };
    }
  }

  return { query: queries[0], resultCount, candidateCount, offers: [], rejections };
}

async function matchProduct({ product, sources }) {
  const ml = features(product.title);
  const queries = buildQueries(ml, wordShare);
  let mlHash = null;
  const mlImage = () => (mlHash ??= imageHash(product.thumbnail));
  const results = {};

  await Promise.all(
    sources.map(async (source) => {
      try {
        results[source] = await matchSource(source, product, ml, mlImage, queries);
      } catch (error) {
        results[source] = {
          query: queries[0],
          resultCount: 0,
          candidateCount: 0,
          offers: [],
          error: error instanceof Error ? error.message : String(error),
          blocked: error instanceof AntiBotError,
        };
      }
    }),
  );
  return { results };
}

const handlers = {
  category: ({ categoryId }) => fetchCategory(categoryId, workerData.cookie),
  topsales: ({ categoryId }) => fetchTopSales(categoryId, workerData.cookie),
  match: matchProduct,
};

parentPort.on("message", async (job) => {
  try {
    const result = await handlers[job.kind](job.payload);
    parentPort.postMessage({ id: job.id, result });
  } catch (error) {
    parentPort.postMessage({ id: job.id, error: error instanceof Error ? error.message : String(error) });
  }
});
