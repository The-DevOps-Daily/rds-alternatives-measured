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

// The official image has no CA bundle, so the host's bundle (or the file in
// PG_CA_FILE, for a provider with its own CA) is mounted read-only and used
// as the root certificate.
const CA_FILE = process.env.PG_CA_FILE || "/etc/ssl/certs/ca-certificates.crt";
const CA_IN_CONTAINER = "/etc/pg-root-ca.crt";
const LOCAL = new Set(["127.0.0.1", "localhost", "::1"]);

// Splits a connection URI into libpq environment variables. A remote server
// gets sslmode=verify-full, so the certificate and the host name are
// checked. A weaker sslmode in the URI (Neon's say "require", which encrypts
// without checking) is raised to verify-full; verify-ca, verify-full and an
// explicit disable are kept. channel_binding is passed through.
export function libpqEnv(uri) {
  const u = new URL(uri);
  const local = LOCAL.has(u.hostname.replace(/^\[|\]$/g, ""));
  const asked = u.searchParams.get("sslmode");
  const sslmode = asked && ["verify-ca", "verify-full", "disable"].includes(asked) ? asked : local ? asked || "prefer" : "verify-full";
  const env = {
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: u.pathname.slice(1) || "postgres",
    PGSSLMODE: sslmode,
  };
  if (sslmode.startsWith("verify")) env.PGSSLROOTCERT = CA_IN_CONTAINER;
  const cb = u.searchParams.get("channel_binding");
  if (cb) env.PGCHANNELBINDING = cb;
  return env;
}

// docker run with the libpq variables passed by name (-e NAME), so their
// values are read from this process's environment and not from argv.
export function pgTool(image, tool, args, { uri, mounts = [] } = {}) {
  const env = uri ? libpqEnv(uri) : {};
  const ca = env.PGSSLROOTCERT ? [`${CA_FILE}:${CA_IN_CONTAINER}:ro`] : [];
  const dockerArgs = ["run", "--rm", "--network", "host", ...Object.keys(env).flatMap((k) => ["-e", k]), ...[...ca, ...mounts].flatMap((m) => ["-v", m]), image, tool, ...args];
  return run("docker", dockerArgs, { env });
}
