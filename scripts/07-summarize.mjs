// Reads every results file and writes results/summary.json and summary.md.
// Refuses a file written by more than one version of the code.
import { existsSync, writeFileSync } from "node:fs";
import { readResults } from "../lib/record.mjs";

const med = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const stats = (xs) => ({ n: xs.length, median: med(xs), min: Math.min(...xs), max: Math.max(...xs) });
const has = (name) => existsSync(new URL(`../results/${name}.jsonl`, import.meta.url));
const load = (name) => {
  const lines = readResults(name);
  const stamps = new Set(lines.map((l) => l.stamp));
  if (stamps.size !== 1) throw new Error(`${name}.jsonl mixes ${stamps.size} code versions`);
  return lines;
};
const group = (rows, key) => rows.reduce((m, r) => ((m[key(r)] ||= []).push(r), m), {});
const summary = {};
let md = "# Summary\n";

if (has("01-neon-branch")) {
  const l = load("01-neon-branch");
  const branches = l.filter((r) => r.type === "branch");
  const sizes = Object.fromEntries(l.filter((r) => r.type === "loaded").map((r) => [r.rows, r.size.database]));
  summary.neonBranch = Object.entries(group(branches, (r) => r.rows)).map(([rows, rs]) => ({
    rows: Number(rows),
    gb: +(sizes[rows] / 1e9).toFixed(2),
    readyMs: stats(rs.map((r) => r.readyMs)),
    apiMs: stats(rs.map((r) => r.apiMs)),
    fullScanMs: stats(rs.map((r) => r.fullScanMs)),
    allDataChecksOk: rs.every((r) => r.edgeOk && r.fingerprintOk),
  }));
  md += "\n## Neon branch, create to first query on the parent's data\n\n| Rows | DB size | Runs | Median | Min | Max | Full scan median | Data checks |\n|---:|---:|---:|---:|---:|---:|---:|---|\n";
  for (const s of summary.neonBranch) md += `| ${s.rows.toLocaleString("en-US")} | ${s.gb} GB | ${s.readyMs.n} | ${(s.readyMs.median / 1000).toFixed(2)} s | ${(s.readyMs.min / 1000).toFixed(2)} s | ${(s.readyMs.max / 1000).toFixed(2)} s | ${(s.fullScanMs.median / 1000).toFixed(2)} s | ${s.allDataChecksOk ? "all passed" : "FAILED"} |\n`;
}

if (has("02-neon-major-upgrade")) {
  const l = load("02-neon-major-upgrade");
  const loaded = l.find((r) => r.type === "loaded");
  summary.neonUpgrade = Object.entries(group(l.filter((r) => r.type === "upgrade"), (r) => r.variant)).map(([variant, rs]) => ({
    variant,
    rows: loaded.rows,
    gb: +(loaded.size.database / 1e9).toFixed(2),
    dumpMs: stats(rs.map((r) => r.dumpMs)),
    restoreMs: stats(rs.map((r) => r.restoreMs)),
    freezeMs: stats(rs.map((r) => r.freezeMs)),
    analyzeMs: stats(rs.map((r) => r.analyzeMs)),
    statsAfterRestore: [...new Set(rs.map((r) => r.statsAfterRestore))],
    allDataChecksOk: rs.every((r) => r.fingerprintOk),
  }));
  md += "\n## Neon, Postgres 17 to 18 by pg_dump and pg_restore into a new project\n\n| pg_dump flags | Runs | Dump | Restore | Write freeze (median) | pg_stats rows after restore | ANALYZE |\n|---|---:|---:|---:|---:|---|---:|\n";
  for (const s of summary.neonUpgrade) md += `| ${s.variant === "default" ? "defaults" : "--statistics"} | ${s.freezeMs.n} | ${(s.dumpMs.median / 1000).toFixed(1)} s | ${(s.restoreMs.median / 1000).toFixed(1)} s | ${(s.freezeMs.median / 1000).toFixed(1)} s | ${s.statsAfterRestore.join(", ")} | ${(s.analyzeMs.median / 1000).toFixed(1)} s |\n`;
}

if (has("03-supabase-free")) {
  const l = load("03-supabase-free");
  const p = l.find((r) => r.type === "project");
  const e = l.find((r) => r.type === "upgrade-eligibility");
  const b = l.find((r) => r.type === "branch-create");
  summary.supabaseFree = { version: p.version, queryableMs: p.queryableMs, upgradeEligible: e.body.eligible, upgradeTargets: e.body.target_upgrade_versions, branchStatus: b.status, branchMessage: b.body.message };
  md += `\n## Supabase Free\n\n- New project: Postgres ${p.version}, queryable after ${(p.queryableMs / 1000).toFixed(1)} s.\n- Upgrade eligibility: eligible=${e.body.eligible}, targets=${JSON.stringify(e.body.target_upgrade_versions)}.\n- Create branch: HTTP ${b.status}, "${b.body.message}".\n`;
}

if (has("04-local-upgrade")) {
  const l = load("04-local-upgrade");
  const start = l.find((r) => r.type === "start");
  const sizes = Object.fromEntries(l.filter((r) => r.type === "loaded").map((r) => [r.rows, r.size.database]));
  const ups = l.filter((r) => r.type === "upgrade");
  summary.localUpgrade = {
    versions: start.versions,
    cpus: start.cpus,
    checksumTrap: l.find((r) => r.type === "checksum-trap")?.output,
    results: Object.entries(group(ups, (r) => `${r.rows}|${r.method}`)).map(([k, rs]) => {
      const [rows, method] = k.split("|");
      const o = { rows: Number(rows), gb: +(sizes[rows] / 1e9).toFixed(2), method, runs: rs.length, statsRows: [...new Set(rs.map((r) => r.statsRows))], analyzeMs: stats(rs.map((r) => r.analyzeMs)), allDataChecksOk: rs.every((r) => r.fingerprintOk) };
      if (rs[0].downMs !== undefined) {
        o.downMs = stats(rs.map((r) => r.downMs));
        o.upgradeMs = stats(rs.map((r) => r.upgradeMs));
        o.probeOutageMs = stats(rs.map((r) => Math.max(0, ...r.probe.map((p) => p.ms ?? 0))));
      }
      if (rs[0].writeFreezeMs !== undefined) o.writeFreezeMs = stats(rs.map((r) => r.writeFreezeMs));
      if (rs[0].initialSyncMs !== undefined) {
        o.initialSyncMs = stats(rs.map((r) => r.initialSyncMs));
        o.writeGapMs = stats(rs.map((r) => r.writeGapMs));
        o.eventsLost = rs.map((r) => r.eventsLost);
      }
      return o;
    }),
  };
  md += `\n## Local, Postgres 17 to 18 (${start.cpus} CPUs)\n\n| Rows | DB size | Method | Runs | Clients locked out (median) | Probe outage (median) | Writes stopped (median) | pg_stats rows after | ANALYZE |\n|---:|---:|---|---:|---:|---:|---:|---|---:|\n`;
  for (const r of summary.localUpgrade.results) {
    const down = r.downMs ? `${(r.downMs.median / 1000).toFixed(1)} s` : r.writeGapMs ? `0 s` : "0 s (old server stays up)";
    const probe = r.probeOutageMs ? `${(r.probeOutageMs.median / 1000).toFixed(1)} s` : "";
    const writes = r.downMs ? down : r.writeFreezeMs ? `${(r.writeFreezeMs.median / 1000).toFixed(1)} s` : `${r.writeGapMs.median} ms (after ${(r.initialSyncMs.median / 1000).toFixed(1)} s initial sync)`;
    md += `| ${r.rows.toLocaleString("en-US")} | ${r.gb} GB | ${r.method} | ${r.runs} | ${down} | ${probe} | ${writes} | ${r.statsRows.join(", ")} | ${(r.analyzeMs.median / 1000).toFixed(1)} s |\n`;
  }
}

if (has("05-local-clone")) {
  const l = load("05-local-clone");
  summary.localClone = Object.entries(group(l.filter((r) => r.type === "clone"), (r) => `${r.rows}|${r.strategy}`)).map(([k, rs]) => ({ rows: Number(k.split("|")[0]), strategy: k.split("|")[1], gb: rs[0].gb, ms: stats(rs.map((r) => r.ms)) }));
  md += "\n## Local, CREATE DATABASE ... TEMPLATE (a clone that copies the files)\n\n| Rows | DB size | Strategy | Runs | Median |\n|---:|---:|---|---:|---:|\n";
  for (const r of summary.localClone) md += `| ${r.rows.toLocaleString("en-US")} | ${r.gb} GB | ${r.strategy} | ${r.ms.n} | ${(r.ms.median / 1000).toFixed(2)} s |\n`;
}

writeFileSync(new URL("../results/summary.json", import.meta.url), JSON.stringify(summary, null, 1) + "\n");
writeFileSync(new URL("../results/summary.md", import.meta.url), md);
console.log(md);
