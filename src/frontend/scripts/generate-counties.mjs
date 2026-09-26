import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const sqlPath = resolve(scriptDirectory, "../../schemas/lookup_standards.seed.sql");
const outputPath = resolve(scriptDirectory, "../src/counties.generated.ts");
const sql = readFileSync(sqlPath, "utf8");
const start = sql.indexOf("INSERT INTO housing_utilities_standards");
const end = sql.indexOf("INSERT INTO msa_county_standards", start);

if (start < 0 || end < 0) throw new Error("Housing standards section was not found.");

const counties = new Map();
const rowPattern = /\(\d+,\s*'((?:''|[^'])*)',\s*'((?:''|[^'])*)',\s*'[^']*',\s*1,\s*[\d.]+\)/g;

for (const match of sql.slice(start, end).matchAll(rowPattern)) {
  const state = match[1].replaceAll("''", "'");
  const county = match[2].replaceAll("''", "'");
  if (!counties.has(state)) counties.set(state, new Set());
  counties.get(state).add(county);
}

const sorted = Object.fromEntries(
  [...counties.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([state, values]) => [state, [...values].sort((left, right) => left.localeCompare(right))]),
);

writeFileSync(
  outputPath,
  `// Generated from src/schemas/lookup_standards.seed.sql by npm run generate:counties.\n` +
    `export const countiesByState: Record<string, readonly string[]> = ${JSON.stringify(sorted, null, 2)};\n`,
);
