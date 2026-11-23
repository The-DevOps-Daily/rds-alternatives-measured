// Stage 4: the four ways managed services do a major version upgrade, on
// one machine with the same data, Postgres 17 to 18:
//   copy, link, swap   pg_upgrade modes (what "in-place upgrade" runs underneath)
//   dump-restore       pg_dump and pg_restore into a new server
//   logical            logical replication into a new server, then a cut-over
//                      (what blue/green deployments do)
// For each it records how long clients could not connect (or write), whether
// the data came across, and whether the planner statistics did.
//
//   SIZES=1000000,10000000,30000000 RUNS=3 node scripts/04-local-upgrade.mjs
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { connect, fingerprint, loadAccounts, sizeBytes, statsRows } from "../lib/data.mjs";
import { run } from "../lib/docker.mjs";
import { startProbe } from "../lib/probe.mjs";
import { openResults } from "../lib/record.mjs";

const SIZES = (process.env.SIZES || "1000000,10000000,30000000").split(",").map(Number);
const RUNS = Number(process.env.RUNS || 3);
const METHODS = (process.env.METHODS || "copy,link,swap,dump-restore,logical").split(",");
const LOGICAL_SIZES = (process.env.LOGICAL_SIZES || "10000000").split(",").map(Number);
const JOBS = Number(process.env.JOBS || 4);
const WORK = process.env.WORK || join(process.cwd(), "work");
const IMAGE = "rdsalt-lab:18-with-17";
const NAME = "rdsalt-lab";
const OLD_PORT = 55432;
const NEW_PORT = 55433;
const BIN17 = "/usr/lib/postgresql/17/bin";
const BIN18 = "/usr/lib/postgresql/18/bin";
const uri = (port, db = "postgres") => `postgresql://postgres@127.0.0.1:${port}/${db}?sslmode=disable`;
// Autovacuum is off on the new server so that the statistics count read
// right after the upgrade shows what the upgrade carried over, not what
// autovacuum analyzed in the meantime. In production it is on, and it
// analyzes the tables some time later.
const NEW_OPTS = "-c autovacuum=off";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Every server command runs inside one long-lived container as the postgres user.
const sh = (script, user = "postgres") => run("docker", ["exec", "-u", user, NAME, "bash", "-ec", script]);
const initdb = (bin, dir, extra = "") => sh(`${bin}/initdb -D ${dir} -U postgres --auth=trust ${extra} >/dev/null`);
const start = (bin, dir, port, extra = "") => sh(`${bin}/pg_ctl -D ${dir} -l ${dir}.log -w -t 600 -o "-p ${port} -c listen_addresses=127.0.0.1 -c max_wal_size=4GB ${extra}" start >/dev/null`);
const stop = (bin, dir) => sh(`${bin}/pg_ctl -D ${dir} -w -t 600 -m fast stop >/dev/null`);

await run("docker", ["build", "-q", "-t", IMAGE, new URL("../local", import.meta.url).pathname]);
const versions = await run("docker", ["run", "--rm", IMAGE, "bash", "-c", `${BIN17}/postgres --version; ${BIN18}/postgres --version`]);
const out = openResults("04-local-upgrade", { sizes: SIZES, runs: RUNS, methods: METHODS, jobs: JOBS, versions: versions.trim().split("\n"), cpus: (await run("nproc", [])).trim() });

mkdirSync(WORK, { recursive: true });
await run("docker", ["rm", "-f", NAME]).catch(() => {});
await run("docker", ["run", "-d", "--name", NAME, "--network", "host", "--shm-size", "1g", "-v", `${WORK}:/w`, "--entrypoint", "sleep", IMAGE, "infinity"]);
await sh("chown postgres /w", "root");

// A server is up when a new connection gets an answer.
async function waitUp(port) {
  for (let i = 0; i < 2400; i++) {
    try {
      const c = await connect(uri(port), { timeoutMs: 1000 });
      await c.end();
      return;
    } catch {
      await sleep(250);
    }
  }
  throw new Error(`port ${port} never came up`);
}

try {
  // The trap first: Postgres 18 initdb turns data checksums on by default,
  // Postgres 17 did not, and pg_upgrade refuses the mismatch.
  rmSync(join(WORK, "trap"), { recursive: true, force: true });
  await sh(`mkdir -p /w/trap && cd /w/trap && ${BIN17}/initdb -D old -U postgres >/dev/null && ${BIN18}/initdb -D new -U postgres >/dev/null`);
  const trap = await sh(`cd /w/trap && ${BIN18}/pg_upgrade -b ${BIN17} -B ${BIN18} -d old -D new --check 2>&1 || true`);
  out.write({ type: "checksum-trap", output: trap.split("\n").filter((l) => /checksum/i.test(l)).slice(0, 3) });
  await sh("rm -rf /w/trap");

  for (const rows of SIZES) {
    // One loaded Postgres 17 cluster per size; each run starts from a copy of it.
    const base = `/w/base-${rows}`;
    if (!existsSync(join(WORK, `base-${rows}`, "PG_VERSION"))) {
      await initdb(BIN17, base);
      await start(BIN17, base, OLD_PORT, "-c wal_level=logical");
      const c = await connect(uri(OLD_PORT));
      const t = Date.now();
      await loadAccounts(c, rows);
      await c.query("CREATE TABLE events (id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), note text)");
      out.write({ type: "loaded", rows, ms: Date.now() - t, size: await sizeBytes(c), statsRows: await statsRows(c) });
      await c.end();
      await stop(BIN17, base);
    }

    for (const method of METHODS) {
      if (method === "logical" && !LOGICAL_SIZES.includes(rows)) continue;
      for (let r = 1; r <= RUNS; r++) {
        const dir = `/w/run`;
        await sh(`rm -rf ${dir} ${dir}.log && mkdir -p ${dir} && cp -a ${base} ${dir}/old`);
        await start(BIN17, `${dir}/old`, OLD_PORT, "-c wal_level=logical");
        const c0 = await connect(uri(OLD_PORT));
        const before = await fingerprint(c0);
        await c0.end();
        let rec;
        if (["copy", "link", "swap"].includes(method)) rec = await pgUpgrade(method, dir, rows);
        else if (method === "dump-restore") rec = await dumpRestore(dir);
        else rec = await logical(dir);
        const c1 = await connect(uri(rec.port));
        rec.fingerprintOk = (await fingerprint(c1)) === before;
        const { rows: v } = await c1.query("SHOW server_version");
        rec.version = v[0].server_version;
        rec.statsRows = await statsRows(c1);
        const a = Date.now();
        await c1.query("ANALYZE accounts");
        rec.analyzeMs = Date.now() - a;
        await c1.end();
        delete rec.port;
        out.write({ type: "upgrade", rows, method, run: r, ...rec });
        console.log(JSON.stringify({ rows, method, run: r, ...rec, probe: undefined }));
        await sh(`for d in ${dir}/old ${dir}/new; do [ -f $d/postmaster.pid ] && ${BIN18}/pg_ctl -D $d -m immediate stop >/dev/null 2>&1 || ${BIN17}/pg_ctl -D $d -m immediate stop >/dev/null 2>&1 || true; done; rm -rf ${dir}`);
      }
    }
    if (process.env.KEEP_BASE !== "1") await sh(`rm -rf ${base} ${base}.log`);
  }
} finally {
  await run("docker", ["rm", "-f", NAME]).catch(() => {});
}

// In-place: stop the old server, pg_upgrade, start the new one on the same port.
async function pgUpgrade(mode, dir, rows) {
  await initdb(BIN18, `${dir}/new`, "--no-data-checksums");
  const probe = startProbe(uri(OLD_PORT), { intervalMs: 250 });
  await sleep(1000);
  const t0 = Date.now();
  await stop(BIN17, `${dir}/old`);
  const t1 = Date.now();
  await sh(`cd ${dir} && ${BIN18}/pg_upgrade -b ${BIN17} -B ${BIN18} -d old -D new -j ${JOBS} --${mode} >/dev/null`);
  const t2 = Date.now();
  await start(BIN18, `${dir}/new`, OLD_PORT, NEW_OPTS);
  await waitUp(OLD_PORT);
  const t3 = Date.now();
  await sleep(1000);
  const p = await probe.stop();
  const du = await sh(`du -sm ${dir} | cut -f1`);
  return { port: OLD_PORT, stopMs: t1 - t0, upgradeMs: t2 - t1, startMs: t3 - t2, downMs: t3 - t0, probe: p.outages, diskMb: Number(du.trim()), rollback: mode === "copy" ? "old cluster untouched" : "old cluster not usable once the new one has started" };
}

// A new server; writes must stop for the whole dump and restore.
async function dumpRestore(dir) {
  await initdb(BIN18, `${dir}/new`);
  await start(BIN18, `${dir}/new`, NEW_PORT, NEW_OPTS);
  const t0 = Date.now();
  await sh(`${BIN18}/pg_dump -h 127.0.0.1 -p ${OLD_PORT} -U postgres -Fd -j ${JOBS} -f ${dir}/dump postgres`);
  const t1 = Date.now();
  await sh(`${BIN18}/pg_restore -h 127.0.0.1 -p ${NEW_PORT} -U postgres -j ${JOBS} -d postgres ${dir}/dump`);
  const t2 = Date.now();
  return { port: NEW_PORT, dumpMs: t1 - t0, restoreMs: t2 - t1, writeFreezeMs: t2 - t0 };
}

// Logical replication into a new server while a writer keeps inserting,
// then a cut-over: stop the writer, wait for the subscriber to catch up,
// move the sequence, point the writer at the new server.
async function logical(dir) {
  await initdb(BIN18, `${dir}/new`);
  await start(BIN18, `${dir}/new`, NEW_PORT, NEW_OPTS);
  await sh(`${BIN18}/pg_dump -h 127.0.0.1 -p ${OLD_PORT} -U postgres --schema-only postgres | ${BIN18}/psql -q -h 127.0.0.1 -p ${NEW_PORT} -U postgres -d postgres >/dev/null`);
  const oldc = await connect(uri(OLD_PORT));
  const newc = await connect(uri(NEW_PORT));
  await oldc.query("CREATE PUBLICATION up FOR ALL TABLES");

  // The writer: one insert every 50 ms to whichever server is current.
  let target = oldc;
  let busy = null;
  let writes = 0;
  let writerOn = true;
  let firstOnNew = null;
  const writer = (async () => {
    while (writerOn) {
      const t = target;
      if (t) {
        busy = t.query("INSERT INTO events (note) VALUES ('w')").then(() => {
          writes++;
          if (t === newc && !firstOnNew) firstOnNew = Date.now();
        }, () => {});
        await busy;
        busy = null;
      }
      await sleep(50);
    }
  })();

  const t0 = Date.now();
  await newc.query(`CREATE SUBSCRIPTION up CONNECTION 'host=127.0.0.1 port=${OLD_PORT} user=postgres dbname=postgres' PUBLICATION up`);
  for (;;) {
    const { rows } = await newc.query("SELECT count(*) FILTER (WHERE srsubstate <> 'r')::int AS pending FROM pg_subscription_rel");
    if (rows[0].pending === 0) break;
    await sleep(250);
  }
  const syncMs = Date.now() - t0;
  await sleep(3000);

  // Cut-over. Caught up means the new server has the last row written on
  // the old one: replication status views report positions only every few
  // seconds, the data itself does not lag behind like that.
  const c0 = Date.now();
  target = null;
  if (busy) await busy;
  const { rows: l } = await oldc.query("SELECT last_value AS seq FROM events_id_seq");
  for (;;) {
    const { rows } = await newc.query("SELECT coalesce(max(id), 0) >= $1 AS caught FROM events", [l[0].seq]);
    if (rows[0].caught) break;
    await sleep(10);
  }
  await newc.query("SELECT setval('events_id_seq', $1)", [l[0].seq]);
  target = newc;
  while (!firstOnNew) await sleep(5);
  const gapMs = firstOnNew - c0;
  writerOn = false;
  await writer;
  const { rows: cnt } = await newc.query("SELECT count(*)::int AS n FROM events");
  await newc.query("ALTER SUBSCRIPTION up DISABLE");
  await newc.query("ALTER SUBSCRIPTION up SET (slot_name = NONE)");
  await newc.query("DROP SUBSCRIPTION up");
  await oldc.query("SELECT pg_drop_replication_slot('up')").catch(() => {});
  await oldc.end();
  await newc.end();
  return { port: NEW_PORT, initialSyncMs: syncMs, writeGapMs: gapMs, writes, eventsOnNew: cnt[0].n, eventsLost: writes - cnt[0].n };
}
