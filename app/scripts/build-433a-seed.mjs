import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { COUNTY_OVERRIDES, CT_OLD_COUNTIES, CT_OLD_NOTE, USPS_EXTRA } from "./lib/433a-mapping-rules.mjs";
import { query } from "./lib/supabase-cli.mjs";

// Generates supabase/migrations/0009_433a_seed.sql from public source files and the live IRS tables.
// Usage: node app/scripts/build-433a-seed.mjs --gazetteer <2025_Gaz_counties_national.txt> [--out <file>]

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1]) throw new Error(`${name} needs a value.`);
  return args[index + 1];
};
const gazetteerPath = flag("--gazetteer");
if (!gazetteerPath) throw new Error("--gazetteer <path> is required.");
const outPath = resolve(flag("--out", resolve(scriptDirectory, "../../supabase/migrations/0009_433a_seed.sql")));

const sqlText = (value) => (value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`);
const byFips = (left, right) => (left.fips < right.fips ? -1 : left.fips > right.fips ? 1 : 0);
const fail = (title, lines) => {
  console.error(`${title}\n${lines.map((line) => `  ${line}`).join("\n")}`);
  process.exit(1);
};

// --- Live reference tables ---------------------------------------------------
const aliases = new Map(query("SELECT alias, canonical_state FROM public.state_aliases").map((r) => [r.alias, r.canonical_state]));
const suffixes = query("SELECT suffix FROM public.county_suffixes")
  .map((r) => r.suffix)
  .sort((left, right) => right.length - left.length);
const housing = query(
  "SELECT DISTINCT state, county, normalized_county FROM public.housing_utilities_standards ORDER BY state, county",
);

// Same rules as public.normalize_county_name: lowercase, trim, strip the longest matching suffix, trim.
const normalize = (name) => {
  const county = name.trim().toLowerCase();
  const suffix = suffixes.find((candidate) => county.endsWith(candidate));
  return suffix ? county.slice(0, county.length - suffix.length).trim() : county;
};

const housingStates = new Set(housing.map((row) => row.state));
const housingByKey = new Map();
for (const row of housing) {
  const key = `${row.state}|${row.normalized_county}`;
  if (!housingByKey.has(key)) housingByKey.set(key, row);
}

// --- County map --------------------------------------------------------------
function readGazetteer(path) {
  const [header, ...lines] = readFileSync(path, "utf8").split(/\r?\n/).filter((line) => line.trim() !== "");
  const columns = header.split("|").map((name) => name.trim());
  const at = (name) => {
    const index = columns.indexOf(name);
    if (index < 0) throw new Error(`Gazetteer header has no ${name} column.`);
    return index;
  };
  const [usps, geoid, name] = [at("USPS"), at("GEOID"), at("NAME")];
  return lines.map((line) => {
    const cells = line.split("|");
    return { usps: cells[usps].trim(), fips: cells[geoid].trim(), name: cells[name].trim() };
  });
}

function buildCounties(gazetteer) {
  const rows = [];
  const failures = [];
  const skipped = [];
  const used = new Set();
  let matched = 0;
  let overridden = 0;
  for (const entry of gazetteer) {
    if (!/^\d{5}$/.test(entry.fips)) failures.push(`bad GEOID ${JSON.stringify(entry.fips)}`);
    const state = aliases.get(entry.usps.toLowerCase()) ?? USPS_EXTRA[entry.usps];
    if (!state || !housingStates.has(state)) {
      skipped.push(entry);
      continue;
    }
    let hit = housingByKey.get(`${state}|${normalize(entry.name)}`);
    if (hit) matched += 1;
    else if (COUNTY_OVERRIDES[entry.fips]) {
      hit = housingByKey.get(`${state}|${normalize(COUNTY_OVERRIDES[entry.fips])}`);
      if (!hit || hit.county !== COUNTY_OVERRIDES[entry.fips]) {
        failures.push(`${entry.fips} override "${COUNTY_OVERRIDES[entry.fips]}" is not a ${state} housing county`);
        continue;
      }
      overridden += 1;
    } else {
      failures.push(`${entry.fips} ${entry.name}, ${state}: no IRS housing county`);
      continue;
    }
    used.add(`${hit.state}|${hit.county}`);
    rows.push({ fips: entry.fips, state, county: hit.county, normalized: hit.normalized_county, note: null });
  }
  for (const [fips, name] of Object.entries(CT_OLD_COUNTIES)) {
    if (rows.some((row) => row.fips === fips)) failures.push(`${fips} ${name} is in the Gazetteer; expected old CT county`);
    rows.push({ fips, state: "Connecticut", county: null, normalized: null, note: CT_OLD_NOTE });
  }
  if (failures.length > 0) fail(`${failures.length} Gazetteer counties do not resolve to IRS housing:`, failures);
  const unused = housing.filter((row) => !used.has(`${row.state}|${row.county}`));
  return { rows: rows.sort(byFips), skipped: skipped.sort(byFips), unused, matched, overridden };
}

const counties = buildCounties(readGazetteer(gazetteerPath));

// --- Emit ----------------------------------------------------------------------
const listOrNone = (lines) => (lines.length > 0 ? lines : ["--   (none)"]);
const valuesBlock = (rows, toTuple) => rows.map((row) => `    (${toTuple(row).map(sqlText).join(", ")})`).join(",\n");

const sql = [
  "-- Generated by app/scripts/build-433a-seed.mjs. Do not edit; re-run the script.",
  `-- Inputs: ${basename(gazetteerPath)}; live state_aliases, county_suffixes, housing_utilities_standards.`,
  "-- Re-apply: DELETE FROM public.app_migrations WHERE name = '0009_433a_seed'; then node app/scripts/db-migrate.mjs.",
  "BEGIN;",
  "",
  "-- county_fips_map: Census FIPS -> the IRS housing table's own county text (ADDR-02, D-12).",
  "INSERT INTO public.county_fips_map (county_fips, state, county, normalized_county, note) VALUES",
  valuesBlock(counties.rows, (row) => [row.fips, row.state, row.county, row.normalized, row.note]),
  "ON CONFLICT (county_fips) DO UPDATE SET state = EXCLUDED.state, county = EXCLUDED.county,",
  "    normalized_county = EXCLUDED.normalized_county, note = EXCLUDED.note;",
  "",
  "-- Gazetteer rows skipped (no IRS housing state):",
  ...listOrNone(counties.skipped.map((row) => `--   ${row.fips} ${row.name} (${row.usps})`)),
  "-- IRS housing rows no FIPS points at:",
  ...listOrNone(counties.unused.map((row) => `--   ${row.county}, ${row.state}`)),
  "",
  "COMMIT;",
  "",
].join("\n");

writeFileSync(outPath, sql);
const ctOld = Object.keys(CT_OLD_COUNTIES).length;
console.log(
  `counties: ${counties.rows.length} rows (matched ${counties.matched}, overridden ${counties.overridden}, ` +
    `CT old ${ctOld}), skipped ${counties.skipped.length}, IRS rows without FIPS ${counties.unused.length}`,
);
console.log(`wrote ${outPath}`);
