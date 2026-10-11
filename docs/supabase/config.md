# `supabase/config.toml`

A minimal Supabase CLI config, tracked in git so auth settings are reviewable. `supabase config push` pushes only the properties this file declares. Everything else on the project (10 other remote properties at the time of the first push) is left unchanged.

| Lines | What it does |
|-------|--------------|
| 1-2 | Why the file is minimal, and the push command `pnpm -C app auth:config-push` (`app/scripts/supabase-config-push.mjs`). |
| 3 | `project_id = "zvkphuikjpwoauqdimcf"`: the ResSpark project. |
| 5-7 | `[auth] enable_signup = false`: public self-registration is off (D-14, T-01-22). Staff accounts exist only when `app/scripts/create-staff.mjs` creates them through the admin API. `signInWithPassword` keeps working (RESEARCH A-5, proven by `app/worker/test/signup-disabled.test.ts`). |

## First push (Plan 05, 2026-10-11)

```
auth.enable_signup [update]
  local:  false
  remote: true
"message":"1 property pushed to zvkphuikjpwoauqdimcf."
```

## Notes

- Preview changes with `supabase config diff --project-ref zvkphuikjpwoauqdimcf`. Run it from a temp dir, the same way `lib/supabase-cli.mjs` does.
- Fallback if a push ever fails: in the Supabase Dashboard, go to Authentication → Sign In / Providers and turn off "Allow new users to sign up".
