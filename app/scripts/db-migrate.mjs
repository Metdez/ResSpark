import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { query, queryFile } from "./lib/supabase-cli.mjs";

// Applies supabase/migrations/*.sql in name order through the Management API
// and records each one in public.app_migrations (D-10).
// Usage: node app/scripts/db-migrate.mjs [--dry-run | --status | --query "<sql>"]

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(scriptDirectory, "../../supabase/migrations");
const args = process.argv.slice(2);

const queryIndex = args.indexOf("--query");
if (queryIndex >= 0) {
  const sql = args[queryIndex + 1];
  if (!sql) throw new Error('--query needs an SQL string: --query "select 1"');
  console.log(JSON.stringify(query(sql), null, 2));
  process.exit(0);
}

query(`CREATE TABLE IF NOT EXISTS public.app_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public.app_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_migrations FROM anon, authenticated;`);

const applied = new Set(query("SELECT name FROM public.app_migrations ORDER BY name").map((row) => row.name));

if (args.includes("--status")) {
  for (const name of applied) console.log(name);
  process.exit(0);
}

const files = readdirSync(MIGRATIONS_DIR)
  .filter((file) => /^\d{4}_.*\.sql$/.test(file)) // only NNNN_ files; timestamped Supabase CLI migrations from main are not ours to apply
  .sort();
const pending = files.filter((file) => !applied.has(file.slice(0, -4)));

if (args.includes("--dry-run")) {
  console.log(`${pending.length} pending:`);
  for (const file of pending) console.log(file.slice(0, -4));
  process.exit(0);
}

let count = 0;
for (const file of pending) {
  const name = file.slice(0, -4);
  try {
    queryFile(join(MIGRATIONS_DIR, file));
    query(`INSERT INTO public.app_migrations (name) VALUES ('${name.replaceAll("'", "''")}')`);
  } catch (error) {
    console.error(`FAIL ${name}: ${error.message}`);
    process.exit(1);
  }
  console.log(`applied ${name}`);
  count += 1;
}

console.log(`applied ${count}, skipped ${files.length - pending.length}`);
if (count === 0) console.log("0 pending");
