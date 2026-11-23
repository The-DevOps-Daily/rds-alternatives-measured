// Stage 1: how long a Neon branch takes to be queryable, with the parent's
// data, at two database sizes. If branching copied data, the bigger size
// would take longer.
//
//   SIZES=1000000,10000000 RUNS=10 node scripts/01-neon-branch.mjs
import { api, connectionUri, createProject, deleteProject, loadEnv, waitOperations } from "../lib/neon.mjs";
import { connect, edgeCheck, expectedEdge, fingerprint, loadAccounts, sizeBytes } from "../lib/data.mjs";
import { openResults } from "../lib/record.mjs";

loadEnv();
const SIZES = (process.env.SIZES || "1000000,10000000").split(",").map(Number);
const RUNS = Number(process.env.RUNS || 10);
const REGION = process.env.NEON_REGION || "aws-eu-central-1";
const CU = Number(process.env.CU || 1);
const out = openResults("01-neon-branch", { sizes: SIZES, runs: RUNS, region: REGION, cu: CU });

const t0 = Date.now();
const created = await createProject(`bench-rdsalt-branch-${Date.now()}`, 17, REGION, CU);
const projectId = created.project.id;
const parent = created.branch;
out.write({ type: "project", projectId, ms: Date.now() - t0, pgVersion: 17 });
console.log(`project ${projectId} in ${Date.now() - t0} ms`);

try {
  const parentUri = await connectionUri(projectId, parent.id);
  for (const rows of SIZES) {
    const p = await connect(parentUri);
    const loadStart = Date.now();
    await loadAccounts(p, rows);
    const size = await sizeBytes(p);
    const parentPrint = await fingerprint(p);
    await p.end();
    out.write({ type: "loaded", rows, ms: Date.now() - loadStart, size, fingerprint: parentPrint });
    console.log(`loaded ${rows} rows (${(size.database / 1e9).toFixed(2)} GB) in ${Date.now() - loadStart} ms`);

    for (let run = 1; run <= RUNS; run++) {
      const start = Date.now();
      const r = await api("POST", `/projects/${projectId}/branches`, {
        branch: { name: `b-${rows}-${run}`, parent_id: parent.id },
        endpoints: [{ type: "read_write", autoscaling_limit_min_cu: CU, autoscaling_limit_max_cu: CU, suspend_timeout_seconds: 0 }],
      });
      const apiMs = Date.now() - start;
      await waitOperations(projectId, r.operations);
      const opsMs = Date.now() - start;
      const uri = await connectionUri(projectId, r.branch.id);
      // First query that sees the far end of the parent's data.
      let edge = null;
      let attempts = 0;
      let c;
      for (;;) {
        attempts++;
        try {
          c = await connect(uri);
          edge = await edgeCheck(c, rows);
          break;
        } catch (e) {
          if (attempts > 60) throw e;
          await new Promise((res) => setTimeout(res, 250));
        }
      }
      const readyMs = Date.now() - start;
      const fpStart = Date.now();
      const print = await fingerprint(c);
      const fullScanMs = Date.now() - fpStart;
      await c.end();
      const rec = { type: "branch", rows, run, apiMs, opsMs, readyMs, attempts, edgeOk: edge === expectedEdge(rows), fullScanMs, fingerprintOk: print === parentPrint };
      out.write(rec);
      console.log(JSON.stringify(rec));
      const d = await api("DELETE", `/projects/${projectId}/branches/${r.branch.id}`);
      await waitOperations(projectId, d.operations);
    }
  }
} finally {
  if (process.env.KEEP !== "1") {
    await deleteProject(projectId);
    out.write({ type: "deleted", projectId });
  }
}
