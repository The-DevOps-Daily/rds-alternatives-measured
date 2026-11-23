// Stage 6: the monthly list price of each reference size on each provider,
// built only from the quoted items in prices/prices.json. Writes
// results/06-prices.json and results/06-prices.md.
import { readFileSync, writeFileSync } from "node:fs";
import { plans } from "../prices/plans.mjs";

const prices = JSON.parse(readFileSync(new URL("../prices/prices.json", import.meta.url), "utf8"));
const rows = [];
for (const [provider, sizes] of Object.entries(plans)) {
  for (const [size, p] of Object.entries(sizes)) {
    let usd = 0;
    for (const [key, qty] of p.lines) {
      const item = prices.items[key];
      if (!item) throw new Error(`${provider} ${size}: no price item ${key}`);
      if (typeof item.value !== "number") throw new Error(`${key} is not a number`);
      usd += item.value * qty;
    }
    rows.push({ size, provider, name: prices.providers[provider], plan: p.plan, ha: p.ha, monthlyUsd: Math.round(usd * 100) / 100, note: p.note ?? "" });
  }
}
const bySize = Object.fromEntries(["S", "M", "L"].map((s) => [s, rows.filter((r) => r.size === s).sort((a, b) => a.monthlyUsd - b.monthlyUsd)]));
for (const s of ["M", "L"]) {
  const rds = bySize[s].find((r) => r.provider === "rds").monthlyUsd;
  for (const r of bySize[s]) r.vsRds = Math.round((r.monthlyUsd / rds) * 100) / 100;
}
writeFileSync(new URL("../results/06-prices.json", import.meta.url), JSON.stringify({ verifiedOn: prices.verifiedOn, hours: 730, bySize }, null, 1) + "\n");

const fmt = (n) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
let md = `# Monthly list prices, verified ${prices.verifiedOn}\n\n730 hours, US East, on demand, no egress, backups inside the free allowance.\n`;
for (const [s, label] of [["S", "S: about 2 vCPU / 4 GB, 50 GB, one node"], ["M", "M: about 2 vCPU / 8 GB, 200 GB, HA standby"], ["L", "L: about 8 vCPU / 32 GB, 1 TB, HA standby"]]) {
  md += `\n## ${label}\n\n| Provider | Plan | Standby | Monthly | Note |\n|---|---|---|---:|---|\n`;
  for (const r of bySize[s]) md += `| ${r.provider} | ${r.plan} | ${r.ha ? "yes" : "no"} | ${fmt(r.monthlyUsd)} | ${r.note} |\n`;
}
writeFileSync(new URL("../results/06-prices.md", import.meta.url), md);
console.log(md);
