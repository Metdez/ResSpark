import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { query } from "./lib/supabase-cli.mjs";

// D-13: diffs the question ids in src/questions.py against public.question_definitions.
// Read-only unless --apply is passed and ids are missing; never writes src/questions.py.
// Usage: node app/scripts/reconcile-questions.mjs [--apply]   (exit 0 = no diff, 2 = diff)

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(scriptDirectory, "../../src/questions.py"), "utf8");

const ids = [...source.matchAll(/"id":\s*"([a-z0-9_]+)"/g)].map((match) => match[1]);
const entries = [
  ...source.matchAll(/"id":\s*"([a-z0-9_]+)",\s*"prompt":\s*"([^"]*)",\s*"type":\s*(bool|int|float|str)\b/g),
].map(([, id, prompt, type]) => ({ id, prompt, type }));
// Every id must parse as a full entry, or --apply could insert a partial set.
if (entries.length !== ids.length) {
  throw new Error(`questions.py: ${ids.length} ids but ${entries.length} parsable entries`);
}

const sqlText = (value) => `'${value.replaceAll("'", "''")}'`;

function report() {
  const dbIds = query("SELECT question_id FROM public.question_definitions ORDER BY question_id").map(
    (row) => row.question_id,
  );
  const code = new Set(ids);
  const db = new Set(dbIds);
  return {
    code_ids: code.size,
    db_ids: db.size,
    missing_in_db: [...code].filter((id) => !db.has(id)).sort(),
    extra_in_db: [...db].filter((id) => !code.has(id)).sort(),
  };
}

let result = report();
if (result.missing_in_db.length > 0) {
  const missing = entries.filter((entry) => result.missing_in_db.includes(entry.id));
  const insert =
    "INSERT INTO public.question_definitions (question_id, prompt, value_type, canonical_column) VALUES\n" +
    missing.map((e) => `(${sqlText(e.id)}, ${sqlText(e.prompt)}, ${sqlText(e.type)}, ${sqlText(e.id)})`).join(",\n") +
    "\nON CONFLICT (question_id) DO NOTHING;";
  if (process.argv.includes("--apply")) {
    query(insert);
    result = report();
  } else {
    console.log(insert);
  }
}

console.log(JSON.stringify(result, null, 2));
process.exit(result.missing_in_db.length === 0 && result.extra_in_db.length === 0 ? 0 : 2);
