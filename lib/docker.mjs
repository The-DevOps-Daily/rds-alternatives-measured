// Runs Postgres client tools from the official image, so the versions are
// pinned and nothing has to be installed on the host. Passwords go through
// the environment, never the command line.
import { spawn } from "node:child_process";

export const PG18 = process.env.PG18_IMAGE || "postgres:18.7-bookworm";
export const PG17 = process.env.PG17_IMAGE || "postgres:17.12-bookworm";

export function run(cmd, args, { env = {}, quiet = false } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => {
      if (code === 0) return resolve(out);
      if (!quiet) process.stderr.write(err);
      reject(new Error(`${cmd} ${args.slice(0, 6).join(" ")} exited ${code}: ${err.slice(-400)}`));
    });
  });
}

// Splits a connection URI into libpq environment variables.
export function libpqEnv(uri) {
  const u = new URL(uri);
  return {
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: u.pathname.slice(1) || "postgres",
    PGSSLMODE: u.searchParams.get("sslmode") || "require",
  };
}

// docker run with the libpq variables passed by name (-e NAME), so their
// values are read from this process's environment and not from argv.
export function pgTool(image, tool, args, { uri, mounts = [] } = {}) {
  const env = uri ? libpqEnv(uri) : {};
  const dockerArgs = ["run", "--rm", "--network", "host", ...Object.keys(env).flatMap((k) => ["-e", k]), ...mounts.flatMap((m) => ["-v", m]), image, tool, ...args];
  return run("docker", dockerArgs, { env });
}
