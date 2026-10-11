import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// app/.dev.vars is git-ignored and the only place a secret value may be written.
export const DEV_VARS = fileURLToPath(new URL("../../.dev.vars", import.meta.url));

export function devVarKeys() {
  if (!existsSync(DEV_VARS)) return new Set();
  const keys = readFileSync(DEV_VARS, "utf8").match(/^[A-Za-z0-9_]+(?==)/gm) ?? [];
  return new Set(keys);
}

// Appends only keys that are not already present; never rewrites an existing line.
// entries: [key, value, comment?][]. Returns the number of keys written.
export function appendMissingDevVars(entries) {
  const have = devVarKeys();
  const lines = [];
  for (const [key, value, comment] of entries) {
    if (have.has(key)) continue;
    if (comment) lines.push(`# ${comment}`);
    lines.push(`${key}=${value}`);
    have.add(key);
  }
  if (lines.length === 0) return 0;
  const content = existsSync(DEV_VARS) ? readFileSync(DEV_VARS, "utf8") : "";
  const lead = content === "" || content.endsWith("\n") ? "" : "\n";
  appendFileSync(DEV_VARS, `${lead}${lines.join("\n")}\n`, { mode: 0o600 });
  return lines.filter((l) => !l.startsWith("#")).length;
}
