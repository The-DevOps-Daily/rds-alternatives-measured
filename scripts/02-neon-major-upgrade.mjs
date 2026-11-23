// Stage 2: a major version upgrade on Neon, done the way its docs describe
// for moving data to a newer Postgres version: a new project on the new
// version, then pg_dump and pg_restore. Times each step, checks the data
// and checks whether the planner statistics came across.
//
//   ROWS=10000000 node scripts/02-neon-major-upgrade.mjs
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { connectionUri, createProject, deleteProject, loadEnv } from "../lib/neon.mjs";
import { connect, fingerprint, loadAccounts, sizeBytes, statsRows } from "../lib/data.mjs";
import { PG18, pgTool } from "../lib/docker.mjs";
import { openResults } from "../lib/record.mjs";

loadEnv();
const ROWS = Number(process.env.ROWS || 10_000_000);
const JOBS = Number(process.env.JOBS || 4);
const RUNS = Number(process.env.RUNS || 3);
const REGION = process.env.NEON_REGION || "aws-eu-central-1";
const CU = Number(process.env.CU || 2);
const WORK = process.env.WORK || join(process.cwd(), "work");
const out = openResults("02-neon-major-upgrade", { rows: ROWS, runs: RUNS, jobs: JOBS, region: REGION, cu: CU, image: PG18 });

const projects = [];
try {
  let t = Date.now();
  const src = await createProject(`bench-rdsalt-pg17-${Date.now()}`, 17, REGION, CU);
  projects.push(src.project.id);
  out.write({ type: "project", role: "source", pgVersion: 17, ms: Date.now() - t });
  const srcUri = await connectionUri(src.project.id, src.branch.id);
  const s = await connect(srcUri);
  t = Date.now();
  await loadAccounts(s, ROWS);
  const srcPrint = await fingerprint(s);
  const srcSize = await sizeBytes(s);
  const srcStats = await statsRows(s);
  await s.end();
  out.write({ type: "loaded", rows: ROWS, ms: Date.now() - t, size: srcSize, statsRows: srcStats });

  // Dump everything first, then delete the source project before creating
  // the target, so the test needs only one free project slot. Two variants:
  // pg_dump's defaults, and pg_dump --statistics (new in Postgres 18), which
  // also copies the planner statistics.
  const variants = [{ name: "default", flags: [] }, { name: "statistics", flags: ["--statistics"] }];
  const dumps = [];
  for (const variant of variants) {
    for (let run = 1; run <= RUNS; run++) {
      const dir = join(WORK, `dump-${variant.name}-${run}-${Date.now()}`);
      mkdirSync(dir, { recursive: true });
      t = Date.now();
      await pgTool(PG18, "pg_dump", ["-Fd", "-j", String(JOBS), "--no-owner", "--no-privileges", ...variant.flags, "-f", "/dump/db"], { uri: srcUri, mounts: [`${dir}:/dump`] });
      dumps.push({ variant: variant.name, run, dir, dumpMs: Date.now() - t });
    }
  }
  await deleteProject(src.project.id);
  projects.shift();
  out.write({ type: "deleted", projectId: src.project.id });

  t = Date.now();
  const dst = await createProject(`bench-rdsalt-pg18-${Date.now()}`, 18, REGION, CU);
  projects.push(dst.project.id);
  out.write({ type: "project", role: "target", pgVersion: 18, ms: Date.now() - t });
  const dstUri = await connectionUri(dst.project.id, dst.branch.id);
  const admin = await connect(dstUri);
  try {
    for (const { variant, run, dir, dumpMs } of dumps) {
      const db = `up_${variant}_${run}`;
      await admin.query(`CREATE DATABASE ${db}`);
      const dbUri = Object.assign(new URL(dstUri), { pathname: `/${db}` }).toString();
      try {
        // Writes to the source must stop for a consistent copy: dump plus
        // restore is the write freeze of a dump-and-restore upgrade.
        t = Date.now();
        await pgTool(PG18, "pg_restore", ["-j", String(JOBS), "--no-owner", "--no-privileges", "-d", db, "/dump/db"], { uri: dbUri, mounts: [`${dir}:/dump`] });
        const restoreMs = Date.now() - t;
        const d = await connect(dbUri);
        const statsAfterRestore = await statsRows(d);
        t = Date.now();
        await d.query("ANALYZE accounts");
        const analyzeMs = Date.now() - t;
        const dstPrint = await fingerprint(d);
        const { rows: v } = await d.query("SHOW server_version");
        await d.end();
        const rec = { type: "upgrade", method: "pg_dump/pg_restore", variant, run, dumpMs, restoreMs, analyzeMs, freezeMs: dumpMs + restoreMs, statsAfterRestore, fingerprintOk: dstPrint === srcPrint, targetVersion: v[0].server_version };
        out.write(rec);
        console.log(JSON.stringify(rec));
      } finally {
        rmSync(dir, { recursive: true, force: true });
        await admin.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
      }
    }
  } finally {
    await admin.end();
    for (const { dir } of dumps) rmSync(dir, { recursive: true, force: true });
  }
} finally {
  for (const id of projects) {
    await deleteProject(id).catch((e) => console.error(e.message));
    out.write({ type: "deleted", projectId: id });
  }
}
