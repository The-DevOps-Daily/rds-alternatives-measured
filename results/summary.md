# Summary

## Neon branch, create to first query on the parent's data

| Rows | DB size | Runs | Median | Min | Max | Full scan median | Data checks |
|---:|---:|---:|---:|---:|---:|---:|---|
| 1,000,000 | 0.16 GB | 10 | 2.70 s | 2.63 s | 3.39 s | 1.45 s | all passed |
| 10,000,000 | 1.58 GB | 10 | 2.72 s | 2.62 s | 3.46 s | 12.31 s | all passed |

## Neon, Postgres 17 to 18 by pg_dump and pg_restore into a new project

| pg_dump flags | Runs | Dump | Dump size | Restore | Dump + restore (median) | pg_stats rows after restore | ANALYZE |
|---|---:|---:|---:|---:|---:|---|---:|
| defaults | 3 | 46.8 s | 275 MiB | 11.7 s | 58.4 s | 0 | 0.2 s |
| --statistics | 3 | 45.7 s | 275 MiB | 11.7 s | 57.6 s | 4 | 0.2 s |

## Supabase Free

- New project: Postgres 17.12.0.000, queryable after 7.2 s.
- Upgrade eligibility: eligible=false, targets=[].
- Create branch: HTTP 402, "Branching is supported only on the Pro plan or above".

## Local, Postgres 17 to 18 (4 CPUs)

Medians. pg_upgrade rows: "stop to answer" is from stopping the old server to the first answered connection on the new one; "pg_upgrade alone" is the command. Dump-restore rows: dump plus restore, the time writes would have to stop (no writer ran). Logical: initial copy while writes continue, then the gap between the last write on the old server and the first on the new.

| Rows | DB size | Method | Runs | Stop to answer | pg_upgrade alone | Dump + restore | Logical copy / gap | pg_stats rows after | ANALYZE |
|---:|---:|---|---:|---:|---:|---:|---|---|---:|
| 1,000,000 | 0.16 GB | copy | 3 | 3.5 s | 3.1 s |  |  | 4 | 0.3 s |
| 1,000,000 | 0.16 GB | link | 3 | 3.5 s | 3.0 s |  |  | 4 | 0.3 s |
| 1,000,000 | 0.16 GB | swap | 3 | 3.2 s | 2.7 s |  |  | 4 | 0.3 s |
| 1,000,000 | 0.16 GB | dump-restore | 3 |  |  | 7.3 s |  | 0 | 0.2 s |
| 1,000,000 | 0.16 GB | dump-restore-stats | 3 |  |  | 7.4 s |  | 4 | 0.2 s |
| 10,000,000 | 1.58 GB | copy | 3 | 6.7 s | 5.5 s |  |  | 4 | 1.4 s |
| 10,000,000 | 1.58 GB | link | 3 | 3.6 s | 2.7 s |  |  | 4 | 0.4 s |
| 10,000,000 | 1.58 GB | swap | 3 | 3.4 s | 2.7 s |  |  | 4 | 0.4 s |
| 10,000,000 | 1.58 GB | dump-restore | 3 |  |  | 66.8 s |  | 0 | 0.5 s |
| 10,000,000 | 1.58 GB | dump-restore-stats | 3 |  |  | 71.8 s |  | 4 | 0.4 s |
| 10,000,000 | 1.58 GB | logical | 3 |  |  |  | 40.2 s / 102 ms | 0 | 0.5 s |
| 30,000,000 | 4.71 GB | copy | 3 | 15.8 s | 15.4 s |  |  | 4 | 1.7 s |
| 30,000,000 | 4.71 GB | link | 3 | 3.4 s | 2.9 s |  |  | 4 | 1.5 s |
| 30,000,000 | 4.71 GB | swap | 3 | 3.1 s | 2.7 s |  |  | 4 | 1.6 s |
| 30,000,000 | 4.71 GB | dump-restore | 3 |  |  | 214.2 s |  | 0 | 2.0 s |
| 30,000,000 | 4.71 GB | dump-restore-stats | 3 |  |  | 217.6 s |  | 4 | 1.8 s |

## Local, CREATE DATABASE ... TEMPLATE (a clone that copies the files)

| Rows | DB size | Strategy | Runs | Median |
|---:|---:|---|---:|---:|
| 1,000,000 | 0.16 GB | wal_log | 3 | 0.60 s |
| 1,000,000 | 0.16 GB | file_copy | 3 | 0.21 s |
| 10,000,000 | 1.58 GB | wal_log | 3 | 7.37 s |
| 10,000,000 | 1.58 GB | file_copy | 3 | 2.37 s |
| 30,000,000 | 4.71 GB | wal_log | 3 | 23.23 s |
| 30,000,000 | 4.71 GB | file_copy | 3 | 11.42 s |
