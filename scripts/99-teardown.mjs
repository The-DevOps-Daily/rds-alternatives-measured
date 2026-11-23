// Deletes anything a crashed run left behind: Neon projects and Supabase
// projects whose name starts with bench-rdsalt-, and the local containers.
import { api, deleteProject, loadEnv } from "../lib/neon.mjs";
import { run } from "../lib/docker.mjs";

loadEnv();
if (process.env.NEON_API_KEY) {
  const q = process.env.NEON_ORG_ID ? `?org_id=${process.env.NEON_ORG_ID}&limit=400` : "?limit=400";
  for (const p of (await api("GET", `/projects${q}`)).projects.filter((p) => p.name.startsWith("bench-rdsalt-"))) {
    await deleteProject(p.id);
    console.log(`deleted Neon project ${p.id} (${p.name})`);
  }
}
if (process.env.SUPABASE_ACCESS_TOKEN) {
  const h = { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` };
  const projects = await (await fetch("https://api.supabase.com/v1/projects", { headers: h })).json();
  for (const p of projects.filter((p) => p.name.startsWith("bench-rdsalt-"))) {
    const r = await fetch(`https://api.supabase.com/v1/projects/${p.ref}`, { method: "DELETE", headers: h });
    console.log(`deleted Supabase project ${p.ref} (${p.name}): ${r.status}`);
  }
}
for (const name of ["rdsalt-lab", "rdsalt-clone"]) await run("docker", ["rm", "-f", name], { quiet: true }).catch(() => {});
