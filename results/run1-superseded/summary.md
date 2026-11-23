# Summary

## Neon branch, create to first query on the parent's data

| Rows | DB size | Runs | Median | Min | Max | Full scan median | Data checks |
|---:|---:|---:|---:|---:|---:|---:|---|
| 1,000,000 | 0.16 GB | 10 | 2.73 s | 2.64 s | 3.45 s | 0.78 s | all passed |
| 10,000,000 | 1.58 GB | 10 | 2.76 s | 2.23 s | 3.51 s | 5.73 s | all passed |

## Neon, Postgres 17 to 18 by pg_dump and pg_restore into a new project

| pg_dump flags | Runs | Dump | Restore | Write freeze (median) | pg_stats rows after restore | ANALYZE |
|---|---:|---:|---:|---:|---|---:|
| defaults | 3 | 16.9 s | 16.9 s | 34.1 s | 0 | 0.2 s |
| --statistics | 3 | 16.7 s | 11.9 s | 29.1 s | 4 | 0.2 s |

## Supabase Free

- New project: Postgres 17.12.0.000, queryable after 6.6 s.
- Upgrade eligibility: eligible=false, targets=[].
- Create branch: HTTP 402, "Branching is supported only on the Pro plan or above".

## Local, Postgres 17 to 18 (4 CPUs)

| Rows | DB size | Method | Runs | Clients locked out (median) | Probe outage (median) | Writes stopped (median) | pg_stats rows after | ANALYZE |
|---:|---:|---|---:|---:|---:|---:|---|---:|
| 1,000,000 | 0.16 GB | copy | 3 | 3.5 s | 3.3 s | 3.5 s | 4 | 0.2 s |
| 1,000,000 | 0.16 GB | link | 3 | 3.1 s | 3.0 s | 3.1 s | 4 | 0.2 s |
| 1,000,000 | 0.16 GB | swap | 3 | 3.2 s | 3.0 s | 3.2 s | 4 | 0.2 s |
| 1,000,000 | 0.16 GB | dump-restore | 3 | 0 s (old server stays up) |  | 4.7 s | 0 | 0.2 s |
| 10,000,000 | 1.58 GB | copy | 3 | 7.8 s | 7.5 s | 7.8 s | 4 | 1.2 s |
| 10,000,000 | 1.58 GB | link | 3 | 4.1 s | 3.8 s | 4.1 s | 4 | 0.4 s |
| 10,000,000 | 1.58 GB | swap | 3 | 3.9 s | 3.8 s | 3.9 s | 4 | 0.4 s |
| 10,000,000 | 1.58 GB | dump-restore | 3 | 0 s (old server stays up) |  | 47.4 s | 0 | 0.4 s |
| 10,000,000 | 1.58 GB | logical | 3 | 0 s |  | 51 ms (after 39.5 s initial sync) | 0 | 0.4 s |
| 30,000,000 | 4.71 GB | copy | 3 | 17.9 s | 17.8 s | 17.9 s | 4 | 0.9 s |
| 30,000,000 | 4.71 GB | link | 3 | 3.4 s | 3.3 s | 3.4 s | 4 | 1.1 s |
| 30,000,000 | 4.71 GB | swap | 3 | 3.2 s | 3.0 s | 3.2 s | 4 | 0.9 s |
| 30,000,000 | 4.71 GB | dump-restore | 3 | 0 s (old server stays up) |  | 143.6 s | 0 | 1.2 s |

## Local, CREATE DATABASE ... TEMPLATE (a clone that copies the files)

| Rows | DB size | Strategy | Runs | Median |
|---:|---:|---|---:|---:|
| 1,000,000 | 0.16 GB | wal_log | 3 | 0.66 s |
| 1,000,000 | 0.16 GB | file_copy | 3 | 0.28 s |
| 10,000,000 | 1.58 GB | wal_log | 3 | 8.65 s |
| 10,000,000 | 1.58 GB | file_copy | 3 | 2.99 s |
| 30,000,000 | 4.71 GB | wal_log | 3 | 28.63 s |
| 30,000,000 | 4.71 GB | file_copy | 3 | 12.36 s |
