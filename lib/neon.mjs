// Small Neon API client: only the calls the scripts need.
import { readFileSync } from "node:fs";

const API = "https://console.neon.tech/api/v2";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Reads .env next to package.json, without a dependency.
export function loadEnv() {
  try {
    for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // no .env: use the environment as it is
  }
}

export function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (see .env.example)`);
  return v;
}

export async function api(method, path, body) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(API + path, {
      method,
      headers: { Authorization: `Bearer ${need("NEON_API_KEY")}`, "Content-Type": "application/json", Accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60_000),
    }).catch((e) => ({ ok: false, status: 0, text: async () => e.message }));
    if (res.ok) return res.status === 204 ? {} : res.json();
    const text = await res.text();
    // 423: another operation is running on the project. 429 and 5xx: try again.
    if ((res.status === 0 || res.status === 423 || res.status === 429 || res.status >= 500) && attempt < 10) {
      await sleep(1000 * attempt);
      continue;
    }
    throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  }
}

export async function waitOperations(projectId, operations = []) {
  for (const op of operations) {
    for (let i = 0; ; i++) {
      const { operation } = await api("GET", `/projects/${projectId}/operations/${op.id}`);
      if (operation.status === "finished") break;
      if (["failed", "error", "cancelled"].includes(operation.status)) throw new Error(`operation ${op.id} ${operation.status}`);
      if (i > 3600) throw new Error(`operation ${op.id} still ${operation.status} after 30 minutes`);
      await sleep(500);
    }
  }
}

// pooled=false must be explicit: without it the API returns the pooled string.
export async function connectionUri(projectId, branchId, database = "neondb") {
  const q = new URLSearchParams({ branch_id: branchId, database_name: database, role_name: "neondb_owner", pooled: "false" });
  return (await api("GET", `/projects/${projectId}/connection_uri?${q}`)).uri;
}

export async function createProject(name, pgVersion, region, cu) {
  const project = { name, pg_version: pgVersion, region_id: region, default_endpoint_settings: { autoscaling_limit_min_cu: cu, autoscaling_limit_max_cu: cu, suspend_timeout_seconds: 0 } };
  if (process.env.NEON_ORG_ID) project.org_id = process.env.NEON_ORG_ID;
  const r = await api("POST", "/projects", { project });
  await waitOperations(r.project.id, r.operations);
  return r;
}

export async function deleteProject(id, expectPrefix = "bench-rdsalt-") {
  const { project } = await api("GET", `/projects/${id}`);
  if (!project.name.startsWith(expectPrefix)) throw new Error(`refusing to delete ${id} (${project.name}): not a ${expectPrefix} project`);
  await api("DELETE", `/projects/${id}`);
}
