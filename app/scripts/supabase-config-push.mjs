// Pushes supabase/config.toml (enable_signup = false) to the live project. Run: pnpm -C app auth:config-push
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PROJECT_REF, getWorkdir, runSupabase } from "./lib/supabase-cli.mjs";

const CONFIG = fileURLToPath(new URL("../../supabase/config.toml", import.meta.url));

// The CLI runs in a temp workdir (it cannot parse the repo-root env file), so the config is copied there.
mkdirSync(join(getWorkdir(), "supabase"), { recursive: true });
copyFileSync(CONFIG, join(getWorkdir(), "supabase", "config.toml"));

try {
  // --yes answers the per-resource confirmation prompt in this non-interactive run.
  console.log(runSupabase(["config", "push", "--project-ref", PROJECT_REF, "--yes"]));
} catch (error) {
  console.log(
    'USER ACTION REQUIRED: in Supabase Dashboard → Authentication → Sign In / Providers turn off "Allow new users to sign up"'
  );
  console.error(error.message);
  process.exit(1);
}
