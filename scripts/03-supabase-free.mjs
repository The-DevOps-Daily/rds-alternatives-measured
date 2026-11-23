// Stage 3: what a Supabase Free project can do for branching and major
// version upgrades, asked through the Management API. Creates one project,
// records what the API answers, loads the same data, deletes the project.
//
//   ROWS=1000000 node scripts/03-supabase-free.mjs
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { loadEnv, need, sleep } from "../lib/neon.mjs";
import { connect, edgeCheck, expectedEdge, loadAccounts, sizeBytes } from "../lib/data.mjs";
import { openResults } from "../lib/record.mjs";

loadEnv();
const API = "https://api.supabase.com/v1";
const ROWS = Number(process.env.ROWS || 1_000_000);
const REGION = process.env.SUPABASE_REGION || "eu-central-1";
const ORG = need("SUPABASE_ORG_SLUG");
// Supabase signs its server certificates with its own CA (see README).
const CA = process.env.SUPABASE_CA ? readFileSync(process.env.SUPABASE_CA, "utf8") : undefined;
const out = openResults("03-supabase-free", { rows: ROWS, region: REGION });

async function sb(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${need("SUPABASE_ACCESS_TOKEN")}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { status: res.status, json };
}

const { json: org } = await sb("GET", `/organizations/${ORG}`);
out.write({ type: "org", plan: org.plan });
if (org.plan !== "free") throw new Error(`organization ${ORG} is on ${org.plan}, this stage is about the Free plan`);

const password = randomBytes(18).toString("base64url");
const t0 = Date.now();
const created = await sb("POST", "/projects", { name: `bench-rdsalt-${Date.now()}`, organization_slug: ORG, db_pass: password, region_selection: { type: "specific", code: REGION } });
if (created.status >= 300) throw new Error(`create project: ${created.status} ${JSON.stringify(created.json)}`);
const ref = created.json.ref;
try {
  let project;
  for (;;) {
    project = (await sb("GET", `/projects/${ref}`)).json;
    if (project.status === "ACTIVE_HEALTHY" && project.database?.host) break;
    if (Date.now() - t0 > 15 * 60_000) throw new Error(`project still ${project.status} after 15 minutes`);
    await sleep(2000);
  }
  const healthyMs = Date.now() - t0;
  // The direct connection is IPv6 only on Free; the session pooler works over IPv4.
  const pooler = (await sb("GET", `/projects/${ref}/config/database/pooler`)).json;
  const session = (Array.isArray(pooler) ? pooler : [pooler]).find((p) => p.pool_mode === "session") ?? pooler[0];
  // The pooler hands out its own connection string with a password placeholder.
  const uri = session.connection_string.replace("[YOUR-PASSWORD]", encodeURIComponent(password));
  out.write({ type: "pooler", host: session.db_host, user: session.db_user, mode: session.pool_mode });
  // A new project's password can take a while to reach the pooler, and the
  // pooler blocks a client after repeated failed logins, so back off.
  let c;
  let lastErr = null;
  for (let i = 0; ; i++) {
    try {
      c = await connect(uri, { ca: CA });
      await c.query("SELECT 1");
      break;
    } catch (e) {
      lastErr = String(e.message).slice(0, 160);
      if (i > 40) throw e;
      await sleep(15_000);
    }
  }
  out.write({ type: "project", healthyMs, queryableMs: Date.now() - t0, lastConnectError: lastErr, version: project.database.version, engine: project.database.postgres_engine });

  const t = Date.now();
  await loadAccounts(c, ROWS);
  out.write({ type: "loaded", rows: ROWS, ms: Date.now() - t, size: await sizeBytes(c), edgeOk: (await edgeCheck(c, ROWS)) === expectedEdge(ROWS) });
  await c.end();

  const eligibility = await sb("GET", `/projects/${ref}/upgrade/eligibility`);
  out.write({ type: "upgrade-eligibility", status: eligibility.status, body: eligibility.json });
  const branch = await sb("POST", `/projects/${ref}/branches`, { branch_name: "preview-1" });
  out.write({ type: "branch-create", status: branch.status, body: branch.json });
  console.log(JSON.stringify({ version: project.database.version, eligible: eligibility.json?.eligible, targets: eligibility.json?.target_upgrade_versions, branch: branch.status, branchMessage: branch.json?.message }));
} finally {
  const del = await sb("DELETE", `/projects/${ref}`);
  out.write({ type: "deleted", ref, status: del.status });
}
