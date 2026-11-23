// Recomputes the code stamp of each stage script and compares it with the
// stamps in its results file, so you can tell the results came from the
// code in this repository as it is now.
import { readdirSync, readFileSync } from "node:fs";
import { codeStamp } from "../lib/record.mjs";

const results = new URL("../results/", import.meta.url);
const scripts = readdirSync(new URL("./", import.meta.url)).filter((f) => /^0[1-5]-.*\.mjs$/.test(f));
let bad = 0;
for (const f of readdirSync(results).filter((f) => f.endsWith(".jsonl")).sort()) {
  const script = scripts.find((s) => s.replace(".mjs", "") === f.replace(".jsonl", ""));
  if (!script) continue;
  const expected = codeStamp(new URL(`./${script}`, import.meta.url).pathname);
  const stamps = [...new Set(readFileSync(new URL(f, results), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).stamp))];
  const ok = stamps.length === 1 && stamps[0] === expected;
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "DIFF"} ${f}: ${stamps.join(",")} (code now ${expected})`);
}
process.exit(bad ? 1 : 0);
