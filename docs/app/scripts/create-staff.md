# `app/scripts/create-staff.mjs`

Creates one staff account through the Supabase Auth admin API, following the D-14 account model. Authorization claims (`firm_id`, `role`) go in `app_metadata` only. `user_metadata` is user-editable, so it is never used (T-01-21). The script then upserts the matching `staff_profiles` row.

```
pnpm -C app staff:create --email zack@resspark.test --name "Zack" --role admin
pnpm -C app staff:create --email andrew@resspark.test --name "Andrew (case manager)" --role staff
```

The `staff:create` script wraps it in `dotenv -e .dev.vars`, so `SUPABASE_URL` and `SUPABASE_SECRET_KEY` come from `app/.dev.vars`. Run `secrets:provision` first so that file exists.

| Lines | What it does |
|-------|--------------|
| 1-3 | Header. The `shortcut:` line names the accepted risk T-01-24: demo passwords sit in git-ignored `app/.dev.vars` until Phase 8 brings a password manager and MFA. |
| 4-7 | `@supabase/supabase-js`, `node:crypto`, `node:util` `parseArgs`, and the `.dev.vars` helper. |
| 9 | `FIRM_ID`: the ValorTax firm seeded by migration 0002. |
| 11-16 | Parses `--email`, `--name`, and `--role` (default `staff`). It rejects a missing email or name, and any role other than `staff` or `admin`. |
| 18-19 | Fails fast if the Supabase URL or secret key is missing. |
| 21-23 | Admin client with `persistSession: false, autoRefreshToken: false`. It is a script, so there is no session to keep. |
| 24-25 | `app_metadata = { firm_id, role }`. The password is `STAFF_PASSWORD` if set, otherwise `randomBytes(12)` as base64url (16 characters). |
| 27-43 | `auth.admin.createUser({ email, password, email_confirm: true, app_metadata })`. `email_confirm: true` sends no mail, and `.test` is a reserved TLD. On `email_exists` it prints `exists <email>`, finds the id with `listUsers` (first 1,000 users, marked `shortcut:`), and re-applies `app_metadata` with `updateUserById`, so a re-run keeps the claims in line with `--role`. Any other error throws. |
| 45-48 | Upserts `staff_profiles { user_id, firm_id, role, display_name }` with `onConflict: "user_id"`. The secret key runs as `service_role`, which bypasses RLS. |
| 50-61 | Only when this run created the user (and so knows the password), it appends `STAFF_PASSWORD__<email with @ and . as _>` to `.dev.vars`. For the first user ever written, it also appends `DEMO_STAFF_EMAIL` and `DEMO_STAFF_PASSWORD`, which the live tests use to sign in. It prints `created <email> (<role>) — password saved to app/.dev.vars` or `updated <email> (<role>) — password unchanged`. It never prints a password. |

## Seeded accounts (Plan 05)

| Email | Display name | Role |
|-------|--------------|------|
| `zack@resspark.test` | Zack | admin |
| `andrew@resspark.test` | Andrew (case manager) | staff |

Read the passwords from `app/.dev.vars`. They are never committed.
