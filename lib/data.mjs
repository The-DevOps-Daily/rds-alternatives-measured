// The same dataset everywhere: a pgbench-style accounts table, generated on
// the server so loading does not depend on the client's network.
import pg from "pg";

export const LOAD_SQL = (from, to) => `
  INSERT INTO accounts (aid, bid, abalance, filler)
  SELECT g, (g - 1) / 100000 + 1, ((g::bigint * 7919) % 10000)::int - 5000, repeat('x', 84)
  FROM generate_series(${from}, ${to}) g`;

// TLS is verified. node-postgres ignores `ssl` options when the URL carries
// sslmode=, so it is stripped and set here instead. `ca` is for providers
// whose server certificate is signed by their own CA (Supabase).
export async function connect(uri, { timeoutMs = 10_000, ca } = {}) {
  const local = uri.includes("sslmode=disable");
  const url = new URL(uri);
  url.searchParams.delete("sslmode");
  url.searchParams.delete("channel_binding");
  const client = new pg.Client({ connectionString: url.toString(), connectionTimeoutMillis: timeoutMs, ssl: local ? false : { rejectUnauthorized: true, ...(ca ? { ca } : {}) } });
  client.on("error", () => {});
  await client.connect();
  return client;
}

// Loads rows up to `rows` (it only adds what is missing), then ANALYZE.
export async function loadAccounts(client, rows, chunk = 1_000_000) {
  await client.query(`CREATE TABLE IF NOT EXISTS accounts (aid int PRIMARY KEY, bid int NOT NULL, abalance int NOT NULL, filler char(84))`);
  const { rows: r } = await client.query(`SELECT coalesce(max(aid), 0) AS m FROM accounts`);
  for (let from = Number(r[0].m) + 1; from <= rows; from += chunk) {
    await client.query(LOAD_SQL(from, Math.min(rows, from + chunk - 1)));
  }
  await client.query(`ANALYZE accounts`);
}

// Two checks. `edge` is one index lookup at the far end of the table, the
// cheapest proof that the data is there. `full` scans the whole table.
export async function edgeCheck(client, rows) {
  const { rows: r } = await client.query(`SELECT abalance FROM accounts WHERE aid = $1`, [rows]);
  return r.length === 1 ? r[0].abalance : null;
}

export async function fingerprint(client) {
  const { rows: r } = await client.query(`SELECT count(*)::bigint AS n, sum(aid::bigint * 31 + abalance)::text AS s FROM accounts`);
  return `${r[0].n}:${r[0].s}`;
}

export const expectedEdge = (rows) => Number((BigInt(rows) * 7919n) % 10000n) - 5000;

export async function sizeBytes(client) {
  const { rows: r } = await client.query(`SELECT pg_database_size(current_database())::bigint AS b, pg_total_relation_size('accounts')::bigint AS t`);
  return { database: Number(r[0].b), accounts: Number(r[0].t) };
}

// Rows in pg_stats for the accounts table: 0 means the planner has no
// column statistics until someone runs ANALYZE.
export async function statsRows(client) {
  const { rows: r } = await client.query(`SELECT count(*)::int AS n FROM pg_stats WHERE schemaname = 'public' AND tablename = 'accounts'`);
  return r[0].n;
}
