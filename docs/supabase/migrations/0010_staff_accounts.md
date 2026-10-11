# `supabase/migrations/0010_staff_accounts.sql`

Adds what public firm sign-up and staff invites need. It is additive only: one new table and three new functions. Applied to the live project with `node app/scripts/db-migrate.mjs`.

## Data rules (header comment)

- Only the Worker (`service_role`) reads or writes. `anon` and `authenticated` get nothing (D-12).
- Auth users are created by the Worker through the Auth admin API. These functions write only the firm, the staff profile, the invite and the audit event, each in one transaction.
- Invite tokens are stored as SHA-256 hex only. The raw token never reaches the database.

## `public.staff_invites`

| Column | Meaning |
|---|---|
| `id` | Invite id (UUID). |
| `firm_id` | Firm the invitee joins. `ON DELETE CASCADE` with the firm. |
| `email` | Invited address. A check keeps it lowercase and 3–254 characters. |
| `role` | `staff` or `admin`, copied into the new user's `app_metadata` and `staff_profiles.role`. |
| `token_hash` | SHA-256 hex of the link token. Unique, and checked to be 64 hex characters. |
| `invited_by` | Admin who sent it. `ON DELETE SET NULL`. |
| `created_at` / `expires_at` | Issue time and expiry (the Worker uses 7 days). |
| `accepted_at` / `accepted_by` | Set once by `staff_invite_accept`. |
| `revoked_at` | Set by an admin's revoke, or by `staff_invite_create` when the same address is re-invited. |

Indexes:
- `staff_invites_firm_id_idx` serves the Team page list.
- `staff_invites_open_email_idx` is a partial unique index on `(firm_id, email)` where the invite is neither accepted nor revoked, so each address has at most one open invite per firm.

## Functions

All three are `SECURITY INVOKER` with `search_path = ''`. They run with the caller's rights, and the only caller allowed to execute them is `service_role`.

- **`firm_create_with_admin(p_user_id, p_firm_name, p_display_name) → UUID`**: inserts the firm, inserts the first `staff_profiles` row with role `admin`, and logs `firm.created`. Returns the new firm id.
- **`staff_invite_create(p_firm_id, p_email, p_role, p_token_hash, p_invited_by, p_ttl_days) → (id, expires_at)`**: revokes any open invite for the same address in the firm, inserts the new invite, and logs `staff.invited` with the invite id and role. The email is not put in the event.
- **`staff_invite_accept(p_token_hash, p_user_id, p_display_name) → (firm_id, role)`**:
  - Locks the open, unexpired invite with `FOR UPDATE`, so two accepts cannot both win.
  - Raises `invite_invalid` if none matches.
  - Otherwise inserts the staff profile, marks the invite accepted, and logs `staff.invite_accepted`.

## Grants

- RLS is on for `staff_invites`, and all table rights are revoked from `anon` and `authenticated`.
- `EXECUTE` on the three functions is revoked from `PUBLIC`, `anon` and `authenticated`, then granted to `service_role`. Postgres grants `EXECUTE` to `PUBLIC` by default, which is why the revoke is needed.

## Verified

- After applying, `has_table_privilege` and `has_function_privilege` report no access for `anon` or `authenticated`, and `service_role` can execute.
- `app/worker/test/rls.test.ts` includes `staff_invites`.
- `app/worker/test/accounts-live.test.ts` runs all three functions against the live project.

## Known limit

A firm row cannot be deleted once its `firm.created` event exists: `events` is append-only and references `firms`. A failed sign-up whose firm row was written before the metadata step failed leaves that row behind (see `app/worker/src/accounts/service.ts`).
