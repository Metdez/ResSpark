import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  COUNTY_OVERRIDES,
  CT_OLD_COUNTIES,
  CT_OLD_NOTE,
  PFC_RULES,
  pfcDefault,
  TRUV_ROWS,
  USPS_EXTRA,
} from "./lib/433a-mapping-rules.mjs";
import { query } from "./lib/supabase-cli.mjs";

// Generates supabase/migrations/0009_433a_seed.sql from public source files and the live IRS tables.
// Usage: node app/scripts/build-433a-seed.mjs --gazetteer <2025_Gaz_counties_national.txt>
//          --pfc <pfc-taxonomy-all.csv> [--out <file>]

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1]) throw new Error(`${name} needs a value.`);
  return args[index + 1];
};
const gazetteerPath = flag("--gazetteer");
const pfcPath = flag("--pfc");
if (!gazetteerPath || !pfcPath) throw new Error("--gazetteer <path> and --pfc <path> are required.");
const outPath = resolve(flag("--out", resolve(scriptDirectory, "../../supabase/migrations/0009_433a_seed.sql")));

const sqlText = (value) =>
  value == null ? "NULL" : typeof value === "number" ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const byKey = (key) => (left, right) => (left[key] < right[key] ? -1 : left[key] > right[key] ? 1 : 0);
const byFips = byKey("fips");
const fail = (title, lines) => {
  console.error(`${title}\n${lines.map((line) => `  ${line}`).join("\n")}`);
  process.exit(1);
};

// --- Live reference tables ---------------------------------------------------
const aliases = new Map(query("SELECT alias, canonical_state FROM public.state_aliases").map((r) => [r.alias, r.canonical_state]));
const suffixes = query("SELECT suffix FROM public.county_suffixes")
  .map((r) => r.suffix)
  .sort((left, right) => right.length - left.length);
const financialColumns = new Set(
  query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'case_financial_data'",
  ).map((r) => r.column_name),
);
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

// --- Plaid category map ------------------------------------------------------
// RFC 4180: quoted fields, doubled quotes, CRLF or LF.
function readCsv(path) {
  const text = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char !== '"') cell += char;
      else if (text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell !== "" || row.length > 0) rows.push([...row, cell]);
  return rows;
}

const ruleFor = (name, primary) =>
  PFC_RULES.find((rule) => (rule.match.endsWith("*") ? name.startsWith(rule.match.slice(0, -1)) : name === rule.match)) ??
  pfcDefault(primary);

function buildPfc(path) {
  const [header, ...rows] = readCsv(path);
  const at = (name) => {
    const index = header.findIndex((column) => column.trim() === name);
    if (index < 0) throw new Error(`PFC CSV has no ${name} column.`);
    return index;
  };
  const [v2Primary, v2Detailed, v1Primary, v1Detailed] = ["PFCv2 Primary", "PFCv2 Detailed", "PFCv1 Primary", "PFCv1 Detailed"].map(at);
  const names = new Map();
  const collect = (version, primaryIndex, detailedIndex) => {
    for (const row of rows) {
      const name = (row[detailedIndex] ?? "").trim();
      // Skips the free-text note row and blank v1 cells.
      if (!/^[A-Z0-9_]+$/.test(name) || names.has(name)) continue;
      names.set(name, { name, primary: (row[primaryIndex] ?? "").trim(), version });
    }
  };
  collect("v2", v2Primary, v2Detailed);
  const v2Count = names.size;
  collect("v1", v1Primary, v1Detailed);
  const v1Count = names.size - v2Count;
  if (v2Count !== 127 || v1Count !== 3) {
    fail("Plaid's taxonomy changed; review PFC_RULES.", [`v2 detailed: ${v2Count} (expected 127)`, `v1-only: ${v1Count} (expected 3)`]);
  }
  const mapped = [...names.values()].map((entry) => {
    const { treatment, canonical_column, form_line, reliability, note } = ruleFor(entry.name, entry.primary);
    return { ...entry, treatment, canonical_column, form_line, reliability, note };
  });
  const problems = mapped
    .filter((row) => !/^[A-Z0-9_]+$/.test(row.primary) || (["income", "expense"].includes(row.treatment) && !row.canonical_column))
    .map((row) => `${row.name}: bad primary or income/expense row without a column`);
  if (problems.length > 0) fail("PFC rows failed checks:", problems);
  return { rows: mapped.sort(byKey("name")), v2Count, v1Count };
}

const pfc = buildPfc(pfcPath);
const unknownColumns = [...pfc.rows, ...TRUV_ROWS]
  .map((row) => row.canonical_column)
  .filter((column) => column && !financialColumns.has(column));
if (unknownColumns.length > 0) fail("Columns not in case_financial_data:", [...new Set(unknownColumns)]);

// --- Emit ----------------------------------------------------------------------
const listOrNone = (lines) => (lines.length > 0 ? lines : ["--   (none)"]);
const valuesBlock = (rows, toTuple) => rows.map((row) => `    (${toTuple(row).map(sqlText).join(", ")})`).join(",\n");

const sql = [
  "-- Generated by app/scripts/build-433a-seed.mjs. Do not edit; re-run the script.",
  `-- Inputs: ${basename(gazetteerPath)}, ${basename(pfcPath)}; rules in app/scripts/lib/433a-mapping-rules.mjs;`,
  "--   live state_aliases, county_suffixes, housing_utilities_standards.",
  "-- Re-apply: DELETE FROM public.app_migrations WHERE name = '0009_433a_seed'; then node app/scripts/db-migrate.mjs.",
  "BEGIN;",
  "",
  `-- plaid_category_map: ${pfc.v2Count} PFC v2 detailed + ${pfc.v1Count} v1-only names (FORM-07, D-08).`,
  "INSERT INTO public.plaid_category_map (pfc_detailed, pfc_primary, taxonomy_version, treatment, canonical_column,",
  "    form_line, reliability, note) VALUES",
  valuesBlock(pfc.rows, (r) => [r.name, r.primary, r.version, r.treatment, r.canonical_column, r.form_line, r.reliability, r.note]),
  "ON CONFLICT (pfc_detailed) DO UPDATE SET pfc_primary = EXCLUDED.pfc_primary, taxonomy_version = EXCLUDED.taxonomy_version,",
  "    treatment = EXCLUDED.treatment, canonical_column = EXCLUDED.canonical_column, form_line = EXCLUDED.form_line,",
  "    reliability = EXCLUDED.reliability, note = EXCLUDED.note;",
  "",
  "-- truv_deduction_map: pay-stub deduction category + ILIKE name pattern, lowest priority wins (FORM-07, D-08).",
  "INSERT INTO public.truv_deduction_map (truv_category, name_pattern, priority, treatment, canonical_column, form_line,",
  "    reliability, note) VALUES",
  valuesBlock(TRUV_ROWS, (r) => [r.truv_category, r.name_pattern, r.priority, r.treatment, r.canonical_column, r.form_line, r.reliability, r.note]),
  "ON CONFLICT (truv_category, name_pattern) DO UPDATE SET priority = EXCLUDED.priority, treatment = EXCLUDED.treatment,",
  "    canonical_column = EXCLUDED.canonical_column, form_line = EXCLUDED.form_line, reliability = EXCLUDED.reliability,",
  "    note = EXCLUDED.note;",
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
console.log(`plaid: ${pfc.rows.length} rows (v2 ${pfc.v2Count}, v1 ${pfc.v1Count}); truv: ${TRUV_ROWS.length} rows`);
console.log(`wrote ${outPath}`);
