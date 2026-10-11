import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const PROJECT_REF = "zvkphuikjpwoauqdimcf";

// The CLI cannot parse the repo-root env file and must not see a supabase/ folder,
// so it always runs from a fresh temp dir outside the repo.
// `--linked --project-ref` resolves the project from the explicit ref: no `supabase link`, no supabase/.temp.
let workdir;
export function getWorkdir() {
  workdir ??= mkdtempSync(join(tmpdir(), "resspark-supabase-"));
  return workdir;
}

const isWindows = process.platform === "win32";
// npx is a .cmd on Windows and needs a shell; the shell gets one pre-quoted command string
// (args here are flags, the ref and file paths, never raw SQL).
const quote = (arg) => (/\s/.test(arg) ? `"${arg}"` : arg);

export function runSupabase(args, { input } = {}) {
  const argv = ["npx", "-y", "supabase@2.120.0", ...args];
  const [command, commandArgs] = isWindows ? [argv.map(quote).join(" "), []] : [argv[0], argv.slice(1)];
  const result = spawnSync(command, commandArgs, {
    cwd: getWorkdir(),
    encoding: "utf8",
    input,
    shell: isWindows,
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "inherit"],
  });
  // Never echo stdout/stderr here: query results may hold client data.
  if (result.status !== 0) throw new Error(`supabase ${args[0]} ${args[1]} failed (exit ${result.status})`);
  return result.stdout;
}

const DB_QUERY = ["db", "query", "--linked", "--project-ref", PROJECT_REF, "-o", "json"];

// The CLI wraps rows in { boundary, rows, warning }.
function parseRows(stdout) {
  const parsed = JSON.parse(stdout);
  return Array.isArray(parsed) ? parsed : (parsed.rows ?? []);
}

export function queryFile(absPath) {
  return parseRows(runSupabase([...DB_QUERY, "-f", absPath]));
}

// SQL goes through a temp file, not argv: cmd.exe would mangle quotes and spaces.
let queryCount = 0;
export function query(sql) {
  const file = join(getWorkdir(), `query-${++queryCount}.sql`);
  writeFileSync(file, sql);
  return queryFile(file);
}
