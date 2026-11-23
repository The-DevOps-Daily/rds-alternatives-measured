// Which plan stands in for each reference size on each provider, and how its
// monthly bill is built from the items in prices.json. A line is
// [item key, quantity]: hourly items get 730 hours, per-GB items get GB.
//
// Reference sizes:
//   S  about 2 vCPU / 4 GB,   50 GB storage, one node
//   M  about 2 vCPU / 8 GB,  200 GB storage, with a high-availability standby
//   L  about 8 vCPU / 32 GB,  1 TB storage, with a high-availability standby
// `ha` says whether the plan really has a standby that takes over on its
// own. Where a provider sells none, the row is one node and says so.
export const HOURS = 730;

export const plans = {
  rds: {
    S: { plan: "db.t4g.medium, Single-AZ, gp3", ha: false, lines: [["rds.db.t4g.medium.singleAZ.hourly", HOURS], ["rds.gp3.singleAZ.gbMonth", 50]], note: "Burstable: sustained CPU above baseline adds $0.075 per vCPU-hour." },
    M: { plan: "db.m7g.large, Multi-AZ (one standby), gp3", ha: true, lines: [["rds.db.m7g.large.multiAZ.hourly", HOURS], ["rds.gp3.multiAZ.gbMonth", 200]] },
    L: { plan: "db.m7g.2xlarge, Multi-AZ (one standby), gp3", ha: true, lines: [["rds.db.m7g.2xlarge.multiAZ.hourly", HOURS], ["rds.gp3.multiAZ.gbMonth", 1000]] },
  },
  aurora: {
    S: { plan: "db.t4g.medium, one instance, I/O-Optimized", ha: false, lines: [["aurora.db.t4g.medium.ioOptimized.hourly", HOURS], ["aurora.storage.ioOptimized.gbMonth", 50]], note: "Aurora Standard is cheaper per hour but adds $0.20 per million I/O requests." },
    M: { plan: "db.r7g.large writer + replica in another AZ, I/O-Optimized", ha: true, lines: [["aurora.db.r7g.large.ioOptimized.hourly", 2 * HOURS], ["aurora.storage.ioOptimized.gbMonth", 200]], note: "No 8 GB class: r7g.large has 16 GB." },
    L: { plan: "db.r7g.2xlarge writer + replica in another AZ, I/O-Optimized", ha: true, lines: [["aurora.db.r7g.2xlarge.ioOptimized.hourly", 2 * HOURS], ["aurora.storage.ioOptimized.gbMonth", 1000]], note: "64 GB RAM, twice the reference size." },
  },
  cloudsql: {
    S: { plan: "Enterprise, 2 vCPU / 4 GB, zonal, SSD", ha: false, lines: [["cloudsql.enterprise.vcpuHour", 2 * HOURS], ["cloudsql.enterprise.memGibHour", 4 * HOURS], ["cloudsql.ssd.gbMonth", 50]] },
    M: { plan: "Enterprise, 2 vCPU / 8 GB, regional HA, SSD", ha: true, lines: [["cloudsql.enterprise.ha.vcpuHour", 2 * HOURS], ["cloudsql.enterprise.ha.memGibHour", 8 * HOURS], ["cloudsql.ssd.ha.gbMonth", 200]] },
    L: { plan: "Enterprise, 8 vCPU / 32 GB, regional HA, SSD", ha: true, lines: [["cloudsql.enterprise.ha.vcpuHour", 8 * HOURS], ["cloudsql.enterprise.ha.memGibHour", 32 * HOURS], ["cloudsql.ssd.ha.gbMonth", 1000]] },
  },
  azure: {
    S: { plan: "Burstable B2s, Premium SSD", ha: false, lines: [["azure.B2s.hourly", HOURS], ["azure.storage.premiumSSD.gbMonth", 64]], note: "Premium SSD comes in fixed sizes: 50 GB bills as 64 GiB. Burstable servers cannot have HA." },
    M: { plan: "General Purpose D2ds_v5, zone-redundant HA", ha: true, lines: [["azure.D2ds_v5.hourly", 2 * HOURS], ["azure.storage.premiumSSD.gbMonth", 2 * 256]], note: "HA bills compute and storage twice; 200 GB bills as a 256 GiB disk." },
    L: { plan: "General Purpose D8ds_v5, zone-redundant HA", ha: true, lines: [["azure.D8ds_v5.hourly", 2 * HOURS], ["azure.storage.premiumSSD.gbMonth", 2 * 1024]], note: "1 TB bills as a 1 TiB disk." },
  },
  digitalocean: {
    S: { plan: "Basic 2 vCPU / 4 GB (shared CPU), 60 GiB minimum disk", ha: false, lines: [["digitalocean.standard.basic.regular.2-4.monthly", 1], ["digitalocean.storage.standard.gibMonth", 60]], note: "60 GiB is the smallest disk on this plan." },
    M: { plan: "Advanced, General Purpose 2 vCPU / 8 GB + one standby", ha: true, lines: [["digitalocean.advanced.generalPurpose.2-8.monthly", 2], ["digitalocean.storage.advanced.gibMonth", 2 * 200]], note: "The Standard 2/8 plan tops out at 150 GiB." },
    L: { plan: "Advanced, General Purpose 8 vCPU / 32 GB + one standby", ha: true, lines: [["digitalocean.advanced.generalPurpose.8-32.monthly", 2], ["digitalocean.storage.advanced.gibMonth", 2 * 1000]] },
  },
  supabase: {
    S: { plan: "Pro + Medium compute (shared CPU, 4 GB)", ha: false, lines: [["supabase.pro.base.monthly", 1], ["supabase.compute.medium", HOURS], ["supabase.pro.computeCredit.monthly", -1], ["supabase.disk.extra.gbMonth", 50 - 8]] },
    M: { plan: "Pro + Large (2 dedicated vCPU, 8 GB), one node", ha: false, lines: [["supabase.pro.base.monthly", 1], ["supabase.compute.large", HOURS], ["supabase.pro.computeCredit.monthly", -1], ["supabase.disk.extra.gbMonth", 200 - 8]], note: "No generally available HA standby; a read replica does not take over on its own." },
    L: { plan: "Pro + 2XL (8 dedicated vCPU, 32 GB), one node", ha: false, lines: [["supabase.pro.base.monthly", 1], ["supabase.compute.2xl", HOURS], ["supabase.pro.computeCredit.monthly", -1], ["supabase.disk.extra.gbMonth", 1000 - 8]], note: "No generally available HA standby." },
  },
  neon: {
    S: { plan: "Launch, 1 CU always on (1 vCPU / 4 GB)", ha: false, lines: [["neon.launch.cuHour", HOURS], ["neon.storage.gbMonth", 50]], note: "A CU is 1 vCPU and 4 GB, so 2 vCPU / 4 GB does not exist. Scale to zero lowers this; always-on is the worst case." },
    M: { plan: "Launch, 2 CU always on, one compute", ha: false, lines: [["neon.launch.cuHour", 2 * HOURS], ["neon.storage.gbMonth", 200]], note: "No standby compute: storage is replicated, and a failed compute is restarted." },
    L: { plan: "Launch, 8 CU always on, one compute", ha: false, lines: [["neon.launch.cuHour", 8 * HOURS], ["neon.storage.gbMonth", 1000]], note: "No standby compute. Scale plan: $0.222 per CU-hour." },
  },
  crunchy: {
    S: { plan: "Crunchy Bridge Standard-4 (1 core, 4 GB)", ha: false, lines: [["crunchy.bridge.aws.standard-4.monthly", 1], ["crunchy.bridge.storage.gbMonth", 50]], note: "No 2 core / 4 GB plan." },
    M: { plan: "Crunchy Bridge Standard-8 (2 cores, 8 GB) with HA", ha: true, lines: [["crunchy.bridge.aws.standard-8.monthly", 2], ["crunchy.bridge.storage.gbMonth", 200]], note: "HA doubles the cluster price; whether it doubles storage is not stated." },
    L: { plan: "Crunchy Bridge Standard-32 (8 cores, 32 GB) with HA", ha: true, lines: [["crunchy.bridge.aws.standard-32.monthly", 2], ["crunchy.bridge.storage.gbMonth", 1000]] },
  },
  aiven: {
    S: { plan: "startup-4 (2 CPU, 4 GB, 80 GB included)", ha: false, lines: [["aiven.startup-4.hourly", HOURS]] },
    M: { plan: "business-8 (2 CPU, 8 GB, 175 GB included, one standby)", ha: true, lines: [["aiven.business-8.hourly", HOURS], ["aiven.extraDisk.business.gbHour", 25 * HOURS]] },
    L: { plan: "business-32 (4 CPU, 30 GB, 700 GB included, one standby)", ha: true, lines: [["aiven.business-32.hourly", HOURS], ["aiven.extraDisk.business.gbHour", 300 * HOURS]], note: "No 8 CPU / 32 GB plan: this one has half the CPUs. business-64 (8 CPU, 61 GB) is $2,500." },
  },
  planetscale: {
    S: { plan: "PS-40, single node (1/2 vCPU, 4 GB)", ha: false, lines: [["planetscale.PS-40-ARM.single.monthly", 1], ["planetscale.storage.ebs.gbMonth", 50]], note: "8 GB of RAM per vCPU, so no 2 vCPU / 4 GB plan." },
    M: { plan: "PS-160 HA (2 vCPU, 16 GB; primary + 2 replicas)", ha: true, lines: [["planetscale.PS-160-ARM.ha.monthly", 1], ["planetscale.storage.ebs.gbMonth", 3 * 200]], note: "Storage is billed on all three nodes." },
    L: { plan: "PS-640 HA (8 vCPU, 64 GB; primary + 2 replicas)", ha: true, lines: [["planetscale.PS-640-ARM.ha.monthly", 1], ["planetscale.storage.ebs.gbMonth", 3 * 1000]], note: "PS-320 HA (4 vCPU, 32 GB) would be $945 with storage." },
  },
  xata: {
    S: { plan: "medium (up to 2 vCPU, 4 GB)", ha: false, lines: [["xata.medium.hourly", HOURS], ["xata.storage.gbMonth", 50]] },
    M: { plan: "large (2 vCPU, 8 GB), one node", ha: false, lines: [["xata.large.hourly", HOURS], ["xata.storage.gbMonth", 200]], note: "No HA option in the pricing." },
    L: { plan: "2xlarge (8 vCPU, 32 GB), one node", ha: false, lines: [["xata.2xlarge.hourly", HOURS], ["xata.storage.gbMonth", 1000]], note: "No HA option in the pricing." },
  },
};
