# rds-alternatives-measured

Measure the two things that differ most between managed Postgres services, branching and major version upgrades, and price the same three database sizes on RDS and ten alternatives from their own price lists. Real Neon and Supabase projects, real Postgres 17 and 18 servers; nothing is simulated.

```bash
cp .env.example .env          # Neon and Supabase keys, only for stages 1 to 3
npm install
npm run neon-branch           # stage 1: Neon branch time at two sizes (about 30 min)
npm run neon-upgrade          # stage 2: Neon 17 -> 18 by pg_dump/pg_restore (about 20 min)
npm run supabase-free         # stage 3: what a Supabase Free project allows (2 min)
npm run local-upgrade         # stage 4: pg_upgrade copy/link/swap, dump-restore, logical (about 1 h)
npm run local-clone           # stage 5: CREATE DATABASE ... TEMPLATE at three sizes
npm run prices                # stage 6: monthly price tables from prices/prices.json
npm run summarize             # results/summary.md and summary.json
npm run verify-stamps         # checks the results came from the code as it is now
npm run teardown              # deletes anything a crashed run left behind
```

Stages 2, 4 and 5 need Docker: the Postgres client and server binaries come from the official `postgres:18.7-bookworm` and `postgres:17.12-bookworm` images, and `local/Dockerfile` adds the Postgres 17 binaries to the 18 image for `pg_upgrade`. Stage 4 needs about 25 GB of free disk at the largest size.

Every stage creates its cloud resources with a `bench-rdsalt-` name and deletes them at the end. `deleteProject` refuses to delete a Neon project without that prefix.

## What each script does

| Script | What it measures |
|---|---|
| `01-neon-branch.mjs` | Creates a Postgres 17 project, loads a pgbench-style `accounts` table (1M rows, then 10M), and creates 10 branches at each size. A run ends at the first query that reads the last row of the parent's table through the branch's own compute. Then it scans the whole table on the branch and compares a checksum with the parent's. |
| `02-neon-major-upgrade.mjs` | Neon has no in-place major upgrade; its docs say to create a project on the new version and move the data. This does that with `pg_dump -Fd -j4` and `pg_restore -j4`, three times with pg_dump's defaults and three times with `--statistics`, and records the dump and restore times, the data checksum, and how many `pg_stats` rows the restored table has before anyone runs `ANALYZE`. |
| `03-supabase-free.mjs` | Creates a project in a Free organization and asks the Management API for its Postgres version, its upgrade eligibility, and a preview branch. Records the answers as they came back. |
| `04-local-upgrade.mjs` | Postgres 17.12 to 18.7 on one machine, at 1M, 10M and 30M rows, three runs each: `pg_upgrade` in copy, link and swap mode (stop, upgrade, start, timed from a client that opens a new connection every 250 ms), `pg_dump`/`pg_restore` into a new server, and logical replication into a new server followed by a cut-over while a writer inserts every 50 ms. It starts with the data checksum trap (below). |
| `05-local-clone.mjs` | `CREATE DATABASE ... TEMPLATE` with the `wal_log` and `file_copy` strategies: a clone that copies every file, as a restore into a new instance does. |
| `06-prices.mjs` | Builds each monthly price from the quoted items in `prices/prices.json` and the plan choices in `prices/plans.mjs`. |
| `07-summarize.mjs` | Reads `results/*.jsonl` and writes the tables. It refuses a results file written by more than one version of the code. |
| `08-verify-stamps.mjs` | Recomputes each script's code stamp and compares it with its results file. |

Every results line carries a stamp: a hash of `lib/`, the script and the lockfile. Only one process can write a results file at a time.

## Results

From our runs on 2026-11-23 (full tables in `results/summary.md` and `results/06-prices.md`; the write-up is on [DevOps Daily](https://devops-daily.com/posts/rds-alternatives-postgres-measured)):

- **Neon branch**, request to the first query on the parent's data: median 2.73 s at 0.16 GB and 2.76 s at 1.58 GB, 10 runs each, all checksums matched. Ten times the data, the same time.
- **Neon, 17 to 18 by dump and restore** of 1.58 GB: writes stopped for a median 34.1 s. With pg_dump's defaults the restored table had no planner statistics; with `--statistics` it had them.
- **Supabase Free**: new project on Postgres 17.12, upgrade eligibility `false` with no targets, and branch creation refused with HTTP 402 ("Branching is supported only on the Pro plan or above").
- **Local, 17.12 to 18.7**, median client lockout at 0.16 / 1.58 / 4.71 GB: `pg_upgrade --link` 3.1 / 4.1 / 3.4 s, `--swap` 3.2 / 3.9 / 3.2 s, `--copy` 3.5 / 7.8 / 17.9 s. Dump and restore stopped writes for 4.7 / 47.4 / 143.6 s. Logical replication copied 1.58 GB in 39.5 s and the cut-over stopped writes for 51 ms, no rows lost. `pg_upgrade` kept the statistics in every run; dump-restore and logical replication did not.
- **Local clone** with `CREATE DATABASE ... STRATEGY file_copy`: 0.28 / 2.99 / 12.36 s. It grows with the data.
- **Prices** with a standby: M (2 vCPU / 8 GB / 200 GB) $270 to $319 on Cloud SQL, RDS ($292), Crunchy Bridge, DigitalOcean and Azure; L (8 vCPU / 32 GB / 1 TB) $1,149 to $1,275 on the same five (RDS $1,214). The cheaper rows have no standby.

## The prices

`prices/prices.json` holds every price used, each with the URL it was read from and a one-line quote, all verified on 2026-11-23: list prices, US East, on demand, in USD. `prices/plans.mjs` says which plan stands in for each size and why. Where a provider has no plan of the reference size, the note says what is different. Prices change; check the URL before you rely on a number.

Reference sizes: S is about 2 vCPU / 4 GB with 50 GB and one node; M is about 2 vCPU / 8 GB with 200 GB and a standby that takes over on its own; L is about 8 vCPU / 32 GB with 1 TB and a standby. Where a provider sells no standby, its M and L rows are one node and say so.

`research/mechanics.json` has what each provider's documentation says about branching, major version upgrades and end of support, with a URL and a one-line quote for each claim, fetched on the same day.

## Limits

- Only Neon and Supabase were run as managed services, because they have free or already-paid plans we could use. RDS, Aurora, Cloud SQL, Azure, DigitalOcean, Crunchy Bridge, Aiven, PlanetScale and Xata are described from their documentation and priced from their price lists; their branch and upgrade times were not measured.
- The local upgrade times are `pg_upgrade` itself on a 4 vCPU droplet with local SSD. A managed in-place upgrade wraps it in snapshots, checks and a restart, so its downtime is longer; the providers' own estimates are quoted in the post.
- The logical replication cut-over is our script on one machine. Its write gap shows the order of magnitude when the subscriber is caught up, not what a blue/green switchover on a managed service takes.
- New servers in stage 4 run with autovacuum off, so the `pg_stats` count shows what the upgrade carried over rather than what autovacuum analyzed later.

## The data checksum trap

Postgres 18 `initdb` enables data checksums by default; Postgres 17 did not. `pg_upgrade --check` from a default 17 cluster to a default 18 cluster stops with:

```text
old cluster does not use data checksums but the new one does
```

Stage 4 records this, then creates the new cluster with `--no-data-checksums`. Managed services handle it for you; a self-managed upgrade has to.

## License

MIT
