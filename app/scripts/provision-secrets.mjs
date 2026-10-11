// Provisions the Worker secrets for `resspark` (D-07, PLAT-03). Run: pnpm -C app secrets:provision
// Vendor keys (D-15): pnpm -C app secrets:provider plaid|truv prompts for them with echo off.
// NEVER console.log a variable holding a value from this script, including a prompted value.
// Values travel only on wrangler's stdin and into the git-ignored app/.dev.vars; printed lines
// are fixed strings naming the secret, never its value.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { appendMissingDevVars } from "./lib/dev-vars.mjs";
import { PROJECT_REF, runSupabase } from "./lib/supabase-cli.mjs";

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const USER_ACTION =
  "USER ACTION REQUIRED: create a secret key in Supabase Dashboard → Settings → API Keys, then run: pnpm -C app secrets:provision   (or manually: pnpm -C app wrangler secret put SUPABASE_URL; pnpm -C app wrangler secret put SUPABASE_SECRET_KEY; pnpm -C app wrangler secret put CLIENT_LINK_HMAC_KEY; pnpm -C app wrangler secret put INTEGRATION_ENC_KEY; pnpm -C app wrangler secret put TOKEN_ENC_KEY_1)";
const PROVIDERS = { plaid: ["PLAID_CLIENT_ID", "PLAID_SECRET"], truv: ["TRUV_CLIENT_ID", "TRUV_SECRET"] };

function requireEnv(name) {
  if (!process.env[name]) throw new Error(`Missing ${name}`);
  return process.env[name];
}

// stdout is captured and never echoed; the value, when any, goes in on stdin only.
function wrangler(args, input) {
  const result = spawnSync(`npx wrangler ${args.join(" ")}`, {
    shell: true,
    cwd: APP_DIR,
    encoding: "utf8",
    input,
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "inherit"],
  });
  if (result.status !== 0) throw new Error(`wrangler ${args.join(" ")} failed (exit ${result.status})`);
  return result.stdout;
}

// One value per name: a muted TTY prompt (typed characters go to a sink, the prompt to stderr),
// or one line each from piped stdin.
async function readValues(names) {
  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8").split(/\r?\n/);
  }
  const sink = new Writable({ write: (_chunk, _encoding, done) => done() });
  const rl = createInterface({ input: process.stdin, output: sink, terminal: true });
  const values = [];
  for (const name of names) {
    process.stderr.write(`${name}: `);
    values.push(await rl.question(""));
    process.stderr.write("\n");
  }
  rl.close();
  return values;
}

// --provider <plaid|truv>: vendor keys only; never regenerates, never prints, never uses argv.
const providerFlag = process.argv.indexOf("--provider");
if (providerFlag >= 0) {
  const names = PROVIDERS[process.argv[providerFlag + 1]];
  if (!names) {
    console.error("usage: pnpm -C app secrets:provider <plaid|truv>");
    process.exit(1);
  }
  const values = await readValues(names);
  const local = [];
  names.forEach((name, i) => {
    const entered = (values[i] ?? "").trim();
    if (!entered) return console.log(`skipped ${name}`);
    wrangler(["secret", "put", name], entered);
    console.log(`set ${name}`);
    local.push([name, entered]);
  });
  console.log(`wrote app/.dev.vars (${appendMissingDevVars(local)} keys)`);
  process.exit(0);
}

const supabaseUrl = requireEnv("VITE_SUPABASE_URL");
const publishableKey = requireEnv("VITE_SUPABASE_PUBLISHABLE_KEY");

// --reveal: without it the CLI masks secret keys.
const apiKeys = JSON.parse(
  runSupabase(["projects", "api-keys", "--project-ref", PROJECT_REF, "--reveal", "--output", "json"])
);
const secretEntry =
  apiKeys.find((k) => k.api_key?.startsWith("sb_secret_")) ?? apiKeys.find((k) => k.type === "secret");
const secretKey = secretEntry?.api_key;
if (!secretKey || !/^sb_secret_[A-Za-z0-9_-]+$/.test(secretKey)) {
  console.log(USER_ACTION);
  process.exit(1);
}

const listed = wrangler(["secret", "list", "--format", "json"]);
const existing = new Set(JSON.parse(listed.slice(listed.indexOf("["))).map((s) => s.name));

wrangler(["secret", "put", "SUPABASE_URL"], supabaseUrl);
console.log("set SUPABASE_URL");
wrangler(["secret", "put", "SUPABASE_SECRET_KEY"], secretKey);
console.log("set SUPABASE_SECRET_KEY");

// Rotating this key invalidates every client link already minted, so an existing one is kept.
const hmacKey = randomBytes(32).toString("hex");
let hmacComment;
if (existing.has("CLIENT_LINK_HMAC_KEY")) {
  console.log("kept CLIENT_LINK_HMAC_KEY");
  hmacComment = "local only: production keeps its own CLIENT_LINK_HMAC_KEY";
} else {
  wrangler(["secret", "put", "CLIENT_LINK_HMAC_KEY"], hmacKey);
  console.log("set CLIENT_LINK_HMAC_KEY");
}

// Rotating this key orphans every firm_integrations ciphertext (D-01), so an existing one is kept.
const encKey = randomBytes(32).toString("hex");
let encComment;
if (existing.has("INTEGRATION_ENC_KEY")) {
  console.log("kept INTEGRATION_ENC_KEY");
  encComment = "local only: production keeps its own INTEGRATION_ENC_KEY";
} else {
  wrangler(["secret", "put", "INTEGRATION_ENC_KEY"], encKey);
  console.log("set INTEGRATION_ENC_KEY");
}

// Rotating this key orphans every connection_secrets ciphertext (D-15), so an existing one is kept.
const tokenKey = randomBytes(32).toString("hex");
let tokenComment;
if (existing.has("TOKEN_ENC_KEY_1")) {
  console.log("kept TOKEN_ENC_KEY_1");
  tokenComment = "local only: production keeps its own TOKEN_ENC_KEY_1";
} else {
  wrangler(["secret", "put", "TOKEN_ENC_KEY_1"], tokenKey);
  console.log("set TOKEN_ENC_KEY_1");
}

const written = appendMissingDevVars([
  ["SUPABASE_URL", supabaseUrl],
  ["SUPABASE_SECRET_KEY", secretKey],
  ["CLIENT_LINK_HMAC_KEY", hmacKey, hmacComment],
  ["INTEGRATION_ENC_KEY", encKey, encComment],
  ["TOKEN_ENC_KEY_1", tokenKey, tokenComment],
  ["SUPABASE_PUBLISHABLE_KEY", publishableKey],
]);
console.log(`wrote app/.dev.vars (${written} keys)`);
