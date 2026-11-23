# Monthly list prices, verified 2026-11-23

730 hours, US East, on demand, no egress, backups inside the free allowance.

## S: about 2 vCPU / 4 GB, 50 GB, one node

| Provider | Plan | Standby | Monthly | Note |
|---|---|---|---:|---|
| xata | medium (up to 2 vCPU, 4 GB) | no | $49.04 |  |
| rds | db.t4g.medium, Single-AZ, gp3 | no | $52.86 | Burstable: sustained CPU above baseline adds $0.075 per vCPU-hour. |
| azure | Burstable B2s, Premium SSD | no | $57.00 | Premium SSD comes in fixed sizes: 50 GB (46.6 GiB) bills as 64 GiB. Burstable servers cannot have HA. |
| aurora-standard | db.t4g.medium, one instance, Aurora Standard, before I/O | no | $58.29 | Plus $0.20 per million I/O requests, not included. |
| digitalocean | Basic 2 vCPU / 4 GB (shared CPU), 60 GiB minimum disk | no | $60.90 | 60 GiB is the smallest disk on this plan. |
| crunchy | Crunchy Bridge Hobby-4 (4 GB, burstable) | no | $75.00 | Crunchy's docs list Hobby-4 with 2 burstable cores, its pricing page with 1. With 2 dedicated cores (Standard-8, 8 GB) it is $145. |
| supabase | Pro + Medium compute (shared CPU, 4 GB) | no | $80.26 |  |
| aurora | db.t4g.medium, one instance, I/O-Optimized | no | $80.60 | Aurora Standard is cheaper per hour but adds $0.20 per million I/O requests. |
| cloudsql | Enterprise, 2 vCPU / 4 GB, zonal, SSD | no | $88.73 |  |
| aiven | startup-4 (2 CPU, 4 GB, 80 GB included) | no | $99.28 |  |
| planetscale | PS-160, single node (2 vCPU, 16 GB) | no | $101.00 | 8 GB of RAM per vCPU, so 2 vCPU means 16 GB. PS-40 (1/2 vCPU, 4 GB) would be $33. |
| neon | Launch, 2 CU always on (2 vCPU / 8 GB) | no | $172.26 | A CU is 1 vCPU and 4 GB, so 2 vCPU means 8 GB. Always on is the worst case; scale to zero lowers it. Launch has no uptime SLA. Restore history ($0.20 per GB-month of changes) not included. |

## M: about 2 vCPU / 8 GB, 200 GB, HA standby

| Provider | Plan | Standby | Monthly | Note |
|---|---|---|---:|---|
| supabase | Pro + Large (2 dedicated vCPU, 8 GB), one node | no | $149.74 | No generally available HA standby; a read replica does not take over on its own. |
| xata | large (2 vCPU, 8 GB) + one replica | yes | $196.16 | Replicas give automatic failover, but their price is not published: we assumed one costs the same as the primary instance, storage counted once. |
| neon | Launch, 2 CU always on, one compute | no | $224.76 | No standby compute: storage is replicated, and a failed compute is restarted. Launch has no uptime SLA; on Scale this is $394. Restore history not included. |
| cloudsql | Enterprise, 2 vCPU / 8 GB, regional HA, SSD | yes | $265.94 |  |
| rds | db.m7g.large, Multi-AZ (one standby), gp3 | yes | $289.02 |  |
| crunchy | Crunchy Bridge Standard-8 (2 cores, 8 GB) with HA | yes | $300.00 | HA doubles the cluster price; whether it doubles storage is not stated. Counted once; $320 if doubled. |
| digitalocean | Advanced, General Purpose 2 vCPU / 8 GB + one standby | yes | $303.70 | New Standard clusters cannot have more than 4 GiB of RAM or a standby (new accounts since 15 Oct 2026, all accounts from 30 Nov 2026). |
| azure | General Purpose D2ds_v5, zone-redundant HA | yes | $318.76 | HA bills compute and storage twice; 200 GB (186.3 GiB) bills as a 256 GiB disk. |
| planetscale | PS-160 HA (2 vCPU, 16 GB; primary + 2 replicas) | yes | $357.25 | Storage is billed on all three nodes, less 10 GB each. |
| aurora-standard | db.r7g.large writer + replica, Aurora Standard, before I/O | yes | $422.96 | Plus $0.20 per million I/O requests: I/O-Optimized is cheaper above about 731 million a month. |
| aiven | business-8 (2 CPU, 8 GB, 175 GiB + 20 GiB, one standby) | yes | $465.30 | Disk grows in 10 GiB steps: 200 GB is 186.3 GiB, so 175 + 20 GiB. |
| aurora | db.r7g.large writer + replica in another AZ, I/O-Optimized | yes | $569.14 | No 8 GB class: r7g.large has 16 GB. |

## L: about 8 vCPU / 32 GB, 1 TB, HA standby

| Provider | Plan | Standby | Monthly | Note |
|---|---|---|---:|---|
| supabase | Pro + 2XL (8 dedicated vCPU, 32 GB), one node | no | $549.26 | No generally available HA standby. |
| xata | 2xlarge (8 vCPU, 32 GB) + one replica | yes | $840.64 | Replica price assumed equal to the primary instance, storage counted once. |
| neon | Launch, 8 CU always on, one compute | no | $969.04 | No standby compute. Launch has no uptime SLA; on Scale ($0.222 per CU-hour) this is $1,646. Restore history not included. |
| cloudsql | Enterprise, 8 vCPU / 32 GB, regional HA, SSD | yes | $1,126.30 |  |
| rds | db.m7g.2xlarge, Multi-AZ (one standby), gp3 | yes | $1,198.40 |  |
| crunchy | Crunchy Bridge Standard-32 (8 cores, 32 GB) with HA | yes | $1,220.00 | Storage counted once; $1,320 if HA doubles it. |
| digitalocean | Advanced, General Purpose 8 vCPU / 32 GB + one standby | yes | $1,256.20 |  |
| azure | General Purpose D8ds_v5, zone-redundant HA | yes | $1,275.04 | 1 TB (931.3 GiB) bills as a 1 TiB disk. |
| planetscale | PS-640 HA (8 vCPU, 64 GB; primary + 2 replicas) | yes | $1,506.25 | PS-320 HA (4 vCPU, 32 GB) would be about $941 with storage. |
| aurora-standard | db.r7g.2xlarge writer + replica, Aurora Standard, before I/O | yes | $1,714.76 | Plus $0.20 per million I/O requests: I/O-Optimized is cheaper above about 3 billion a month. |
| aurora | db.r7g.2xlarge writer + replica in another AZ, I/O-Optimized | yes | $2,323.02 | 64 GB RAM, twice the reference size. |
| aiven | business-64 (8 CPU, 61 GB, 1,000 GB included, one standby) | yes | $2,500.25 | No 8 CPU / 32 GB plan. business-32 (4 CPU, 30 GB, 700 GiB) plus 240 GiB would be about $1,580. |
