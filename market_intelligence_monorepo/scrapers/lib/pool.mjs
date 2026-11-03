import { Worker } from "node:worker_threads";

const WORKER_URL = new URL("../worker.mjs", import.meta.url);

// Each thread runs up to `perThread` jobs at once: the jobs are mostly network I/O, so one
// thread can keep many requests in flight while the others decode images.
export function createPool(size, workerData = {}, perThread = 1) {
  const free = [];
  const queue = [];
  const pending = new Map();
  const workers = new Set();
  let nextId = 0;
  let closed = false;

  function settle(id, error, result) {
    const job = pending.get(id);
    if (!job) return;
    pending.delete(id);
    job.worker.jobs.delete(id);
    if (error) job.reject(error);
    else job.resolve(result);
  }

  function send(worker, job) {
    worker.jobs.add(job.id);
    pending.get(job.id).worker = worker;
    worker.postMessage(job);
  }

  function release(worker) {
    if (closed || !workers.has(worker)) return;
    const job = queue.shift();
    if (job) send(worker, job);
    else free.push(worker);
  }

  function spawn() {
    const worker = new Worker(WORKER_URL, { workerData });
    worker.jobs = new Set();
    workers.add(worker);

    worker.on("message", (message) => {
      settle(message.id, message.error ? new Error(message.error) : null, message.result);
      release(worker);
    });
    worker.on("error", (error) => {
      for (const id of [...worker.jobs]) settle(id, error);
    });
    worker.on("exit", () => {
      workers.delete(worker);
      for (let index = free.length - 1; index >= 0; index -= 1) {
        if (free[index] === worker) free.splice(index, 1);
      }
      for (const id of [...worker.jobs]) settle(id, new Error("worker saiu no meio do job"));
      if (!closed) {
        const replacement = spawn();
        for (let slot = 0; slot < perThread; slot += 1) release(replacement);
      }
    });
    return worker;
  }

  for (let index = 0; index < size; index += 1) {
    const worker = spawn();
    for (let slot = 0; slot < perThread; slot += 1) free.push(worker);
  }

  return {
    size,
    capacity: size * perThread,
    run(kind, payload) {
      return new Promise((resolve, reject) => {
        nextId += 1;
        const job = { id: nextId, kind, payload };
        pending.set(job.id, { resolve, reject, worker: null });
        const worker = free.pop();
        if (worker) send(worker, job);
        else queue.push(job);
      });
    },
    async close() {
      closed = true;
      await Promise.all([...workers].map((worker) => worker.terminate()));
    },
  };
}

export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function lane() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
}
