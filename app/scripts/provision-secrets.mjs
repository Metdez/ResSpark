// Provisions the Worker secrets for `resspark` (D-07, PLAT-03). Run: pnpm -C app secrets:provision
// NEVER console.log a variable holding a value from this script. Values travel only on
// wrangler's stdin and into the git-ignored app/.dev.vars; printed lines are fixed strings.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { appendMissingDevVars } from "./lib/dev-vars.mjs";
import { PROJECT_REF, runSupabase } from "./lib/supabase-cli.mjs";

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const USER_ACTION =
  "USER ACTION REQUIRED: create a secret key in Supabase Dashboard → Settings → API Keys, then run: pnpm -C app secrets:provision   (or manually: pnpm -C app wrangler secret put SUPABASE_URL; pnpm -C app wrangler secret put SUPABASE_SECRET_KEY; pnpm -C app wrangler secret put CLIENT_LINK_HMAC_KEY)";

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

const written = appendMissingDevVars([
  ["SUPABASE_URL", supabaseUrl],
  ["SUPABASE_SECRET_KEY", secretKey],
  ["CLIENT_LINK_HMAC_KEY", hmacKey, hmacComment],
  ["SUPABASE_PUBLISHABLE_KEY", publishableKey],
]);
console.log(`wrote app/.dev.vars (${written} keys)`);
