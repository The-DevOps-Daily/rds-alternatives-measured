// Stage 9: Neon instant restore (point in time). Load the table, note the
// server's clock, drop the table, then restore the branch to the moment
// before the drop through the API. A run ends at the first query that reads
// the last row of the original table through the branch's usual connection
// string. Then the whole table is checked against the fingerprint taken
// before the drop.
//
//   ROWS=10000000 RUNS=5 node scripts/09-neon-restore.mjs
import { api, connectionUri, createProject, deleteProject, loadEnv, sleep, waitOperations } from "../lib/neon.mjs";
import { connect, edgeCheck, expectedEdge, fingerprint, loadAccounts, sizeBytes } from "../lib/data.mjs";
import { openResults } from "../lib/record.mjs";

loadEnv();
const ROWS = Number(process.env.ROWS || 10_000_000);
const RUNS = Number(process.env.RUNS || 5);
const REGION = process.env.NEON_REGION || "aws-eu-central-1";
const CU = Number(process.env.CU || 1);
const out = openResults("09-neon-restore", { rows: ROWS, runs: RUNS, region: REGION, cu: CU });

const t0 = Date.now();
const created = await createProject(`bench-rdsalt-restore-${Date.now()}`, 17, REGION, CU);
const projectId = created.project.id;
const branch = created.branch;
out.write({ type: "project", projectId, ms: Date.now() - t0, pgVersion: 17, historyRetentionSeconds: created.project.history_retention_seconds });
console.log(`project ${projectId} in ${Date.now() - t0} ms`);

try {
  // The connection string an application already has. Instant restore keeps
  // the branch and its compute, so the same string is used after the restore.
  const uri = await connectionUri(projectId, branch.id);
  let c = await connect(uri);
  const loadStart = Date.now();
  await loadAccounts(c, ROWS);
  const size = await sizeBytes(c);
  const original = await fingerprint(c);
  await c.end();
  out.write({ type: "loaded", rows: ROWS, ms: Date.now() - loadStart, size, fingerprint: original });
  console.log(`loaded ${ROWS} rows (${(size.database / 1e9).toFixed(2)} GB) in ${Date.now() - loadStart} ms`);

  for (let run = 1; run <= RUNS; run++) {
    // The restore target is the server's own clock, so client clock skew
    // does not matter. Two seconds pass before the destructive change.
    c = await connect(uri);
    const { rows: ts } = await c.query(`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS t`);
    const target = ts[0].t;
    await sleep(2000);
    await c.query(`DROP TABLE accounts`);
    const { rows: gone } = await c.query(`SELECT to_regclass('accounts') IS NULL AS gone`);
    await c.end();
    if (!gone[0].gone) throw new Error("the table is still there after DROP TABLE");

    const backupName = `before-restore-${run}`;
    const start = Date.now();
    const r = await api("POST", `/projects/${projectId}/branches/${branch.id}/restore`, {
      source_branch_id: branch.id,
      source_timestamp: target,
      preserve_under_name: backupName,
    });
    const apiMs = Date.now() - start;
    await waitOperations(projectId, r.operations);
    const opsMs = Date.now() - start;
    // First query that sees the far end of the original table. Until the
    // compute is back, connecting fails; a query that runs but cannot see
    // the table counts as a failed attempt too.
    let edge = null;
    let attempts = 0;
    const errors = [];
    for (;;) {
      attempts++;
      let probe;
      try {
        probe = await connect(uri);
        edge = await edgeCheck(probe, ROWS);
        c = probe;
        break;
      } catch (e) {
        if (errors.length < 5) errors.push(e.code || e.message.slice(0, 80));
        await probe?.end().catch(() => {});
        if (attempts > 240) throw e;
        await sleep(250);
      }
    }
    const readyMs = Date.now() - start;
    const fpStart = Date.now();
    const print = await fingerprint(c);
    const fullScanMs = Date.now() - fpStart;
    await c.end();
    const sameUri = (await connectionUri(projectId, branch.id)) === uri;
    const rec = { type: "restore", run, target, apiMs, opsMs, readyMs, attempts, errors, operations: r.operations.map((o) => o.action), edgeOk: edge === expectedEdge(ROWS), fullScanMs, fingerprintOk: print === original, sameUri };
    out.write(rec);
    console.log(JSON.stringify(rec));

    // The restore keeps the state before it as a backup branch. Delete it so
    // the next run starts from one branch again.
    const { branches } = await api("GET", `/projects/${projectId}/branches`);
    for (const b of branches.filter((b) => b.name === backupName)) {
      try {
        const d = await api("DELETE", `/projects/${projectId}/branches/${b.id}`);
        await waitOperations(projectId, d.operations);
      } catch (e) {
        out.write({ type: "backup-kept", run, branchId: b.id, reason: e.message.slice(0, 200) });
      }
    }
  }
} finally {
  if (process.env.KEEP !== "1") {
    await deleteProject(projectId);
    out.write({ type: "deleted", projectId });
  }
}
