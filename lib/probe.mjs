// Availability probe: a new connection and one query every `intervalMs`.
// A new connection each time, because a cutover breaks new connections
// first and a held connection can hide it.
import { connect } from "./data.mjs";

export function startProbe(uri, { intervalMs = 250, timeoutMs = 2_000, ca, query = "SELECT 1", onSample }) {
  let stop = false;
  const samples = [];
  const done = (async () => {
    while (!stop) {
      const started = Date.now();
      let ok = false;
      let err = null;
      try {
        const c = await connect(uri, { timeoutMs, ca });
        try {
          await Promise.race([c.query(query), new Promise((_, rej) => setTimeout(() => rej(new Error("query timeout")), timeoutMs))]);
          ok = true;
        } finally {
          c.end().catch(() => {});
        }
      } catch (e) {
        err = String(e.code || e.message).slice(0, 120);
      }
      const s = { at: started, ms: Date.now() - started, ok, err };
      samples.push(s);
      onSample?.(s);
      const wait = intervalMs - (Date.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
  })();
  return {
    samples,
    async stop() {
      stop = true;
      await done;
      return summarize(samples);
    },
  };
}

// The outage is the span from the first failed sample to the next
// successful one. Several separate outages are reported separately.
export function summarize(samples) {
  const outages = [];
  let cur = null;
  for (const s of samples) {
    if (!s.ok && !cur) cur = { from: s.at, failed: 0, errors: {} };
    if (!s.ok) {
      cur.failed++;
      cur.errors[s.err] = (cur.errors[s.err] || 0) + 1;
    }
    if (s.ok && cur) {
      outages.push({ ...cur, to: s.at, ms: s.at - cur.from });
      cur = null;
    }
  }
  if (cur) outages.push({ ...cur, to: null, ms: null, open: true });
  return { samples: samples.length, failed: samples.filter((s) => !s.ok).length, outages };
}
