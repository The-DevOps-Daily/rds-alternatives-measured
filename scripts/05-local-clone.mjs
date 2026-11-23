// Stage 5: what a local clone costs when it copies the data. CREATE
// DATABASE ... TEMPLATE copies every file of the source database on this
// server. It is a local template copy, not a model of a managed restore
// (those provision an instance, and some load blocks lazily).
//
//   SIZES=1000000,10000000,30000000 RUNS=3 node scripts/05-local-clone.mjs
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { connect, loadAccounts, sizeBytes } from "../lib/data.mjs";
import { run } from "../lib/docker.mjs";
import { openResults } from "../lib/record.mjs";

const SIZES = (process.env.SIZES || "1000000,10000000,30000000").split(",").map(Number);
const RUNS = Number(process.env.RUNS || 3);
const WORK = process.env.WORK || join(process.cwd(), "work");
const IMAGE = "postgres:18.7-bookworm";
const NAME = "rdsalt-clone";
const PORT = 55434;
const uri = (db) => `postgresql://postgres@127.0.0.1:${PORT}/${db}?sslmode=disable`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(WORK, { recursive: true });
await run("docker", ["rm", "-f", NAME]).catch(() => {});
await run("docker", ["run", "-d", "--name", NAME, "--network", "host", "--shm-size", "1g", "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "-v", `${join(WORK, "clone-data")}:/var/lib/postgresql`, IMAGE, "-p", String(PORT), "-c", "listen_addresses=127.0.0.1", "-c", "max_wal_size=4GB"]);
const out = openResults("05-local-clone", { sizes: SIZES, runs: RUNS, image: IMAGE });
try {
  let admin;
  for (let i = 0; ; i++) {
    try {
      admin = await connect(uri("postgres"), { timeoutMs: 1000 });
      break;
    } catch (e) {
      if (i > 240) throw e;
      await sleep(500);
    }
  }
  await admin.query("CREATE DATABASE src");
  for (const rows of SIZES) {
    const c = await connect(uri("src"));
    await loadAccounts(c, rows);
    const size = await sizeBytes(c);
    await c.end();
    out.write({ type: "loaded", rows, size });
    for (const strategy of ["wal_log", "file_copy"]) {
      for (let r = 1; r <= RUNS; r++) {
        await admin.query("CHECKPOINT");
        const t = Date.now();
        await admin.query(`CREATE DATABASE clone TEMPLATE src STRATEGY ${strategy}`);
        const ms = Date.now() - t;
        await admin.query("DROP DATABASE clone");
        const rec = { type: "clone", rows, strategy, run: r, ms, gb: +(size.database / 1e9).toFixed(2) };
        out.write(rec);
        console.log(JSON.stringify(rec));
      }
    }
  }
  await admin.end();
} finally {
  await run("docker", ["rm", "-f", NAME]).catch(() => {});
  await run("docker", ["run", "--rm", "-v", `${WORK}:/w`, "busybox", "rm", "-rf", "/w/clone-data"]).catch(() => {});
}
