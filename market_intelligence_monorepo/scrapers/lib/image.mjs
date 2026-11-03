import sharp from "sharp";
import { USER_AGENT } from "./env.mjs";

sharp.cache(false);
sharp.concurrency(1);

const cache = new Map();
const CACHE_LIMIT = 2_000;

export function imageHash(url) {
  if (!url) return Promise.resolve(null);
  if (cache.has(url)) return cache.get(url);
  const pending = computeHash(url).catch(() => null);
  cache.set(url, pending);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  return pending;
}

// Difference hash of the product after trimming the flat background, so the same photo
// with different padding or resolution lands on the same 64 bits.
async function computeHash(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
    headers: { "User-Agent": USER_AGENT, Accept: "image/*" },
  });
  if (!response.ok) return null;
  const input = Buffer.from(await response.arrayBuffer());

  let base = await sharp(input).flatten({ background: "#ffffff" }).toBuffer();
  try {
    base = await sharp(base).trim({ threshold: 18 }).toBuffer();
  } catch {
    // Images with a single color can't be trimmed.
  }

  const { data } = await sharp(base)
    .grayscale()
    .resize(9, 8, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let hash = 0n;
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const bit = data[y * 9 + x] < data[y * 9 + x + 1] ? 1n : 0n;
      hash = (hash << 1n) | bit;
    }
  }
  return hash.toString(16).padStart(16, "0");
}

export function hammingDistance(left, right) {
  if (!left || !right) return null;
  let value = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let count = 0;
  while (value > 0n) {
    count += Number(value & 1n);
    value >>= 1n;
  }
  return count;
}
