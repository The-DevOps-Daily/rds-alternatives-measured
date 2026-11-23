# Monthly list prices, verified 2026-11-23

730 hours, US East, on demand, no egress, backups inside the free allowance.

## S: about 2 vCPU / 4 GB, 50 GB, one node

| Provider | Plan | Standby | Monthly | Note |
|---|---|---|---:|---|
| planetscale | PS-40, single node (1/2 vCPU, 4 GB) | no | $34.25 | 8 GB of RAM per vCPU, so no 2 vCPU / 4 GB plan. |
| xata | medium (up to 2 vCPU, 4 GB) | no | $49.04 |  |
| rds | db.t4g.medium, Single-AZ, gp3 | no | $53.20 | Burstable: sustained CPU above baseline adds $0.075 per vCPU-hour. |
| azure | Burstable B2s, Premium SSD | no | $57.00 | Premium SSD comes in fixed sizes: 50 GB bills as 64 GiB. Burstable servers cannot have HA. |
| digitalocean | Basic 2 vCPU / 4 GB (shared CPU), 60 GiB minimum disk | no | $60.90 | 60 GiB is the smallest disk on this plan. |
| crunchy | Crunchy Bridge Standard-4 (1 core, 4 GB) | no | $75.00 | No 2 core / 4 GB plan. |
| supabase | Pro + Medium compute (shared CPU, 4 GB) | no | $80.26 |  |
| aurora | db.t4g.medium, one instance, I/O-Optimized | no | $80.60 | Aurora Standard is cheaper per hour but adds $0.20 per million I/O requests. |
| cloudsql | Enterprise, 2 vCPU / 4 GB, zonal, SSD | no | $89.24 |  |
| neon | Launch, 1 CU always on (1 vCPU / 4 GB) | no | $94.88 | A CU is 1 vCPU and 4 GB, so 2 vCPU / 4 GB does not exist. Scale to zero lowers this; always-on is the worst case. |
| aiven | startup-4 (2 CPU, 4 GB, 80 GB included) | no | $99.28 |  |

## M: about 2 vCPU / 8 GB, 200 GB, HA standby

| Provider | Plan | Standby | Monthly | Note |
|---|---|---|---:|---|
| xata | large (2 vCPU, 8 GB), one node | no | $126.08 | No HA option in the pricing. |
| supabase | Pro + Large (2 dedicated vCPU, 8 GB), one node | no | $149.74 | No generally available HA standby; a read replica does not take over on its own. |
| neon | Launch, 2 CU always on, one compute | no | $224.76 | No standby compute: storage is replicated, and a failed compute is restarted. |
| cloudsql | Enterprise, 2 vCPU / 8 GB, regional HA, SSD | yes | $270.36 |  |
| rds | db.m7g.large, Multi-AZ (one standby), gp3 | yes | $292.01 |  |
| crunchy | Crunchy Bridge Standard-8 (2 cores, 8 GB) with HA | yes | $300.00 | HA doubles the cluster price; whether it doubles storage is not stated. |
| digitalocean | Advanced, General Purpose 2 vCPU / 8 GB + one standby | yes | $306.00 | The Standard 2/8 plan tops out at 150 GiB. |
| azure | General Purpose D2ds_v5, zone-redundant HA | yes | $318.76 | HA bills compute and storage twice; 200 GB bills as a 256 GiB disk. |
| planetscale | PS-160 HA (2 vCPU, 16 GB; primary + 2 replicas) | yes | $361.00 | Storage is billed on all three nodes. |
| aiven | business-8 (2 CPU, 8 GB, 175 GB included, one standby) | yes | $470.30 |  |
| aurora | db.r7g.large writer + replica in another AZ, I/O-Optimized | yes | $569.14 | No 8 GB class: r7g.large has 16 GB. |

## L: about 8 vCPU / 32 GB, 1 TB, HA standby

| Provider | Plan | Standby | Monthly | Note |
|---|---|---|---:|---|
| supabase | Pro + 2XL (8 dedicated vCPU, 32 GB), one node | no | $549.26 | No generally available HA standby. |
| xata | 2xlarge (8 vCPU, 32 GB), one node | no | $560.32 | No HA option in the pricing. |
| neon | Launch, 8 CU always on, one compute | no | $969.04 | No standby compute. Scale plan: $0.222 per CU-hour. |
| cloudsql | Enterprise, 8 vCPU / 32 GB, regional HA, SSD | yes | $1,149.42 |  |
| rds | db.m7g.2xlarge, Multi-AZ (one standby), gp3 | yes | $1,214.04 |  |
| crunchy | Crunchy Bridge Standard-32 (8 cores, 32 GB) with HA | yes | $1,220.00 |  |
| digitalocean | Advanced, General Purpose 8 vCPU / 32 GB + one standby | yes | $1,270.00 |  |
| azure | General Purpose D8ds_v5, zone-redundant HA | yes | $1,275.04 | 1 TB bills as a 1 TiB disk. |
| planetscale | PS-640 HA (8 vCPU, 64 GB; primary + 2 replicas) | yes | $1,510.00 | PS-320 HA (4 vCPU, 32 GB) would be $945 with storage. |
| aiven | business-32 (4 CPU, 30 GB, 700 GB included, one standby) | yes | $1,640.28 | No 8 CPU / 32 GB plan: this one has half the CPUs. business-64 (8 CPU, 61 GB) is $2,500. |
| aurora | db.r7g.2xlarge writer + replica in another AZ, I/O-Optimized | yes | $2,323.02 | 64 GB RAM, twice the reference size. |
