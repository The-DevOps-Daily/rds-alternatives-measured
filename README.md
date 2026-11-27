# rds-alternatives-measured

Measure the two things that differ most between managed Postgres services, branching and major version upgrades, and price the same three database sizes on RDS and ten alternatives from their own price lists. Real Neon and Supabase projects, real Postgres 17 and 18 servers; nothing is simulated.

```bash
cp .env.example .env          # Neon (paid plan) and Supabase (Free org) keys, stages 1 to 3
npm install
npm run neon-branch           # stage 1: Neon branch time at two sizes (about 30 min)
npm run neon-upgrade          # stage 2: Neon 17 -> 18 by pg_dump/pg_restore (about 10 min)
npm run neon-restore          # stage 9: Neon instant restore after a DROP TABLE (about 4 min)
npm run supabase-free         # stage 3: what a Supabase Free project allows (2 min)
npm run local-upgrade         # stage 4: pg_upgrade copy/link/swap, dump-restore, logical (about 1.5 h)
npm run local-clone           # stage 5: CREATE DATABASE ... TEMPLATE at three sizes
npm run prices                # stage 6: monthly price tables from prices/prices.json
npm run summarize             # results/summary.md and summary.json
npm run verify-stamps         # checks the results came from the code as it is now
npm run teardown              # deletes anything a crashed run left behind
```

Stages 2, 4 and 5 need Docker: the Postgres client and server binaries come from the official `postgres:18.7-bookworm` and `postgres:17.12-bookworm` images, and `local/Dockerfile` adds the Postgres 17 binaries to the 18 image for `pg_upgrade`. Stage 4 needs about 25 GB of free disk at the largest size.

TLS is verified everywhere. The Node.js client checks the server certificate against the system CAs, and `pg_dump`/`pg_restore` run with `sslmode=verify-full` against the host's CA bundle, mounted read-only into the container (the official image has none). Neon's connection strings say `sslmode=require`, which encrypts without checking the certificate, so the scripts raise it to `verify-full`. Supabase signs its server certificates with its own CA: stage 3 reads it from `SUPABASE_CA` (the file in `local/` is Supabase's published `prod-ca-2021.crt`). For a provider with its own CA in the Docker-based stages, set `PG_CA_FILE` to its CA file.

The Neon stages need a paid plan as written: they turn scale to zero off (`suspend_timeout_seconds: 0`), which the Free plan does not allow, and the 10M-row table is bigger than the Free plan's 1 GB per project.

The dataset is one pgbench-style `accounts` table with a primary key: an integer key, two integer columns and an 84-character filler of md5 hex, generated on the server. Real schemas have many tables and indexes, and `pg_upgrade` time grows with the number of objects, so read the upgrade times as illustrative measurements for this host and a one-table schema.

Every stage creates its cloud resources with a `bench-rdsalt-` name and deletes them at the end. `deleteProject` refuses to delete a Neon project without that prefix.

## What each script does

| Script | What it measures |
|---|---|
| `01-neon-branch.mjs` | Creates a Postgres 17 project, loads a pgbench-style `accounts` table (1M rows, then 10M), and creates 10 branches at each size. A run ends at the first query that reads the last row of the parent's table through the branch's own compute. Then it scans the whole table on the branch and compares the row count and a sum of per-row hashes over every column with the parent's. |
| `02-neon-major-upgrade.mjs` | Neon has no in-place major upgrade; its docs say to create a project on the new version and move the data. This does that with `pg_dump -Fd -j4` and `pg_restore -j4`, three times each with pg_dump's defaults and with `--statistics`, alternating, and records the dump and restore times, the dump size, the data check, and how many `pg_stats` rows the restored table has before anyone runs `ANALYZE`. |
| `03-supabase-free.mjs` | Creates a project in a Free organization and asks the Management API for its Postgres version, its upgrade eligibility, and a preview branch. Records the answers as they came back. |
| `04-local-upgrade.mjs` | Postgres 17.12 to 18.7 on one machine, at 1M, 10M and 30M rows, three runs each: `pg_upgrade` in copy, link and swap mode (stop, upgrade, start, timed from a client that opens a new connection every 250 ms), `pg_dump`/`pg_restore` into a new server with and without `--statistics`, and logical replication into a new server followed by a cut-over while one writer inserts a row every 50 ms (the cut-over waits for a marker row to arrive, and failed inserts are counted). It starts with the data checksum trap (below). |
| `05-local-clone.mjs` | `CREATE DATABASE ... TEMPLATE` with the `wal_log` and `file_copy` strategies: a local clone that copies every file. It is not a model of a managed restore, which provisions an instance and may load blocks lazily. |
| `09-neon-restore.mjs` | Creates a Postgres 17 project, loads the 10M-row table, then five times: reads the server's clock, waits 2 s, runs `DROP TABLE accounts`, and restores the branch to that timestamp with Neon's instant restore API (`POST /projects/{id}/branches/{id}/restore`, the branch restored to its own history, with a backup branch). A run ends at the first query that reads the last row of the original table through the connection string the branch had before the restore. Then it checks the row count and per-row hash sum against the values taken before the first drop, and deletes the backup branch. |
| `06-prices.mjs` | Builds each monthly price from the quoted items in `prices/prices.json` and the plan choices in `prices/plans.mjs`. |
| `07-summarize.mjs` | Reads `results/*.jsonl` and writes the tables. It refuses a results file written by more than one version of the code. |
| `08-verify-stamps.mjs` | Recomputes each script's code stamp and compares it with its results file. |

Every results line carries a stamp: a hash of `lib/`, the script and the lockfile. Only one process can write a results file at a time.

## Results

From our runs on 2026-11-23, every stage one after the other on a 4 vCPU DigitalOcean droplet in FRA1 (full tables in `results/summary.md` and `results/06-prices.md`; the write-up is on [DevOps Daily](https://devops-daily.com/posts/rds-alternatives-postgres-measured)):

- **Neon branch**, request to the first query on the parent's data: median 2.70 s at 0.16 GB and 2.72 s at 1.58 GB, 10 runs each, every branch matched the parent's row count and per-row hash sum. Ten times the data, the same time.
- **Neon, 17 to 18 by dump and restore** of 1.58 GB (about 275 MiB on disk): dump plus restore took a median 58.4 s with pg_dump's defaults and 57.6 s with `--statistics`. With the defaults the restored table had no planner statistics; with `--statistics` it had them.
- **Neon instant restore** (run on 2026-11-27 from a 2 vCPU droplet in AMS3, because FRA1 had no droplet sizes available that day), 1.58 GB, `DROP TABLE` then restore to a timestamp 2 s before it: request to the first query that sees the original data took a median 9.71 s (8.42 to 15.32 s, 5 runs; the first run, right after the load, was the slowest). Neon's operations took a median 8.61 s of it. Every run matched the original row count and per-row hash sum, and the connection string did not change.
- **Supabase Free**: new project on Postgres 17.12, upgrade eligibility `false` with no targets, and branch creation refused with HTTP 402 ("Branching is supported only on the Pro plan or above").
- **Local, 17.12 to 18.7**, median from stopping the old server to the first answered connection on the new one, at 0.16 / 1.58 / 4.71 GB: `pg_upgrade --link` 3.5 / 3.6 / 3.4 s, `--swap` 3.2 / 3.4 / 3.1 s, `--copy` 3.5 / 6.7 / 15.8 s. Dump plus restore: 7.3 / 66.8 / 214.2 s. Logical replication copied 1.58 GB in 40.2 s while writes continued, and the cut-over gap was a median 102 ms with no acknowledged row lost. `pg_upgrade` and `pg_dump --statistics` kept the statistics in every run; default dump-restore and logical replication did not.
- **Local clone** with `CREATE DATABASE ... STRATEGY file_copy`: 0.21 / 2.37 / 11.42 s. It grows with the data.
- **Prices** (compute and storage) with a standby: M (2 vCPU / 8 GB / 200 GB) $266 to $319 on Cloud SQL, RDS ($289), Crunchy Bridge, DigitalOcean and Azure; L (8 vCPU / 32 GB / 1 TB) $1,126 to $1,275 on the same five (RDS $1,198), or up to $320 and $1,320 if Crunchy Bridge bills HA storage twice. Xata with one replica is $196 and $841, on an assumed replica price. Supabase is cheaper with one node and no standby. Neon is cheaper with one compute and no standby compute; its storage is replicated across availability zones, and a failed compute is restarted or moved.

`results/run1-superseded/` holds a first full run we threw away: its `pg_dump`/`pg_restore` connections used `sslmode=require` (no certificate check), its data check summed only two columns, and its filler was one repeated character, which compresses far better than real data. Every stage was run again after the fixes.

## The prices

`prices/prices.json` holds every price used, each with the URL it was read from and a one-line quote, all verified on 2026-11-23: list prices, US East, on demand, in USD. `prices/plans.mjs` says which plan stands in for each size and why. Where a provider has no plan of the reference size, the note says what is different. Prices change; check the URL before you rely on a number.

Reference sizes: S is about 2 vCPU / 4 GB with 50 GB and one node; M is about 2 vCPU / 8 GB with 200 GB and a standby that takes over on its own; L is about 8 vCPU / 32 GB with 1 TB and a standby. Where a provider sells no standby, its M and L rows are one node and say so.

`research/mechanics.json` has what each provider's documentation says about branching, major version upgrades and end of support, with a URL and a one-line quote for each claim, fetched on the same day.

## Limits

- Only Neon and Supabase were run as managed services, because they have free or already-paid plans we could use. RDS, Aurora, Cloud SQL, Azure, DigitalOcean, Crunchy Bridge, Aiven, PlanetScale and Xata are described from their documentation and priced from their price lists; their branch and upgrade times were not measured.
- The local upgrade numbers are for one 4 vCPU droplet with local SSD. `downMs` runs from stopping the old server to the first answered connection on the new one; `upgradeMs` is the `pg_upgrade` command alone; `probe` is what a client opening a new connection every 250 ms saw. A managed in-place upgrade wraps the same step in snapshots, checks and a restart; the providers' own estimates are quoted in the post.
- The `rollback` text recorded in stage 4 results says swap mode leaves the old cluster usable until the new one starts. That is wrong: swap mode changes the old cluster once it starts moving files. Link mode is the one that holds until the new server starts.
- The logical replication cut-over is our script on one machine, one writer and one table. Its write gap shows the order of magnitude when the subscriber is caught up, not what a blue/green switchover on a managed service takes.
- The Neon dump runs on the client and compresses there. Client-side compression may affect dump time; we did not isolate the bottleneck.
- The Neon restore was timed at one size (1.58 GB), five runs, from AMS3 rather than FRA1, so it says nothing about how restore time changes with size. No RDS point-in-time restore was timed; RDS restores into a new DB instance.
- The dataset is one table with one index. Upgrade times grow with the number of objects in a real schema.
- New servers in stage 4 run with autovacuum off, so the `pg_stats` count shows what the upgrade carried over rather than what autovacuum analyzed later.

## The data checksum trap

Postgres 18 `initdb` enables data checksums by default; Postgres 17 did not. `pg_upgrade --check` from a default 17 cluster to a default 18 cluster stops with:

```text
old cluster does not use data checksums but the new one does
```

Stage 4 records this, then creates the new cluster with `--no-data-checksums`. Managed services handle it for you; a self-managed upgrade has to.

## License

MIT
