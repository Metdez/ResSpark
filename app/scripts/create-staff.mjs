// Creates one staff account (D-14). Run: pnpm -C app staff:create --email <e> --name <n> [--role staff|admin]
// Authorization data goes in app_metadata only, never user_metadata. Passwords are never printed.
// shortcut: demo passwords live in git-ignored app/.dev.vars; move to a password manager + MFA in Phase 8.
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { appendMissingDevVars, devVarKeys } from "./lib/dev-vars.mjs";

const FIRM_ID = "00000000-0000-0000-0000-000000000001";

const { values } = parseArgs({
  options: { email: { type: "string" }, name: { type: "string" }, role: { type: "string", default: "staff" } },
});
const { email, name, role } = values;
if (!email || !name) throw new Error("usage: create-staff.mjs --email <email> --name <name> [--role staff|admin]");
if (role !== "staff" && role !== "admin") throw new Error("--role must be staff or admin");

const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) throw new Error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY");

const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const app_metadata = { firm_id: FIRM_ID, role };
const password = process.env.STAFF_PASSWORD || randomBytes(12).toString("base64url");

let userId;
const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata });
if (created.error?.code === "email_exists") {
  console.log(`exists ${email}`);
  // shortcut: first 1000 users only; paginate once the firm has more accounts.
  const listed = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listed.error) throw new Error(`listUsers failed: ${listed.error.message}`);
  userId = listed.data.users.find((u) => u.email === email.toLowerCase())?.id;
  if (!userId) throw new Error(`could not find existing user ${email}`);
  // keep the claims in line with the requested role on re-runs
  const updated = await admin.auth.admin.updateUserById(userId, { app_metadata });
  if (updated.error) throw new Error(`updateUserById failed: ${updated.error.message}`);
} else if (created.error) {
  throw new Error(`createUser failed: ${created.error.message}`);
} else {
  userId = created.data.user.id;
}

const profile = await admin
  .from("staff_profiles")
  .upsert({ user_id: userId, firm_id: FIRM_ID, role, display_name: name }, { onConflict: "user_id" });
if (profile.error) throw new Error(`staff_profiles upsert failed: ${profile.error.message}`);

// Only a password this run actually set is worth saving.
if (!created.error) {
  const slug = email.replace(/[@.]/g, "_");
  const isFirst = !devVarKeys().has("DEMO_STAFF_EMAIL");
  appendMissingDevVars([
    [`STAFF_PASSWORD__${slug}`, password],
    ...(isFirst ? [["DEMO_STAFF_EMAIL", email], ["DEMO_STAFF_PASSWORD", password]] : []),
  ]);
  console.log(`created ${email} (${role}) — password saved to app/.dev.vars`);
} else {
  console.log(`updated ${email} (${role}) — password unchanged`);
}
