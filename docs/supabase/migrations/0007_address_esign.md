# `supabase/migrations/0007_address_esign.sql`

Phase 6 groundwork, applied with `node app/scripts/db-migrate.mjs` and recorded in `public.app_migrations`. Additive only: no new table, no dropped column. The deployed Worker keeps working because it never reads the new columns and the widened CHECKs only accept more values. Wrapped in `BEGIN; … COMMIT;`; every statement is re-runnable.

## 1. `cases` address columns (D-02)

Thirteen columns, all nullable except `address_verified`. NULL means unknown; the RPC turns `''` into NULL so a blank is never stored.

| Column | Type / CHECK | Source |
|---|---|---|
| `address_line1`, `address_line2` | text | US Street `delivery_line_1/2`, or the typed street and unit |
| `city` | text | `components.city_name` or typed |
| `state_code` | `^[A-Z]{2}$` | `components.state_abbreviation` or the picked state |
| `zip5` / `zip4` | `^\d{5}$` / `^\d{4}$` | `components.zipcode` / `plus4_code` |
| `county_name` | text | `metadata.county_name` (Smarty only) |
| `county_fips` | `^\d{5}$` | `metadata.county_fips` (Smarty only); Phase 7 uses it for the county standards |
| `address_rdi` | `Residential` / `Commercial` | `metadata.rdi` |
| `address_dpv` | `Y` `N` `S` `D` | `analysis.dpv_match_code` |
| `address_verified` | boolean NOT NULL DEFAULT false | `dpv = 'Y'` for Smarty; always false for manual |
| `address_source` | `smarty` / `manual` | how the address was confirmed |
| `address_confirmed_at` | timestamptz | set by the RPC |

## 2. Widened Phase 4 CHECKs

The constraint names were read from `pg_constraint` before the file was written. They are the Postgres default names for the 0005 inline CHECKs:

| Constraint | Before | After |
|---|---|---|
| `connections_provider_check` | `plaid, truv, teller` | adds `docuseal` |
| `connections_kind_check` | `bank, payroll` | adds `signature` |
| `consents_kind_check` | `bank_data, payroll_data` | adds `esign` |

Each is `DROP CONSTRAINT IF EXISTS` then `ADD CONSTRAINT` with the same name, so each column still has exactly one CHECK. `connections_status_check` is untouched.

## 3. `public.case_confirm_address(p_item_id uuid, p_link_id uuid, p_address jsonb) RETURNS jsonb`

plpgsql, `SECURITY INVOKER`, `SET search_path = ''`. The Worker (`service_role`) calls it from `db/case-address.ts`. Steps:

1. Read the link. Missing, revoked, or expired raises `link_inactive`.
2. Lock the request `FOR UPDATE`, then the item `FOR UPDATE`. This is the same order as `upload_complete`, so concurrent calls serialize instead of deadlocking. The item must belong to the link's request and have `kind = 'address'`, else `item_not_found`.
3. An `approved` item raises `item_approved` (approved addresses are frozen).
4. `source` must be `smarty` or `manual`. A `manual` payload with `verified = true` or any county name, FIPS, RDI, or DPV raises `bad_address` (D-06).
5. Update the case (found through `requests.case_id`) with every `p_address` key through `NULLIF(…, '')`, plus `address_verified`, `address_source`, and `address_confirmed_at = now()`.
6. Move the item to `submitted` and clear `rejection_note` only from `pending`, `in_progress`, or `rejected`. A `submitted` item stays `submitted`, so the client can re-confirm.
7. `log_event(firm, case, request, 'client', p_link_id::text, 'address.confirmed', { source, verified, county_fips, rdi })`. No street, unit, city, or ZIP text ever reaches `events`. The actor convention matches `request_open`.
8. Return `{ item_status, request_status }`; `request_status` comes from `public.request_apply_status`.

`p_address` keys: `source, verified, line1, line2, city, state_code, zip5, zip4, county_name, county_fips, rdi, dpv`.

### RAISE tokens

| Token | Meaning | Worker response |
|---|---|---|
| `link_inactive` | link missing, revoked, or expired | 401 `no_session` |
| `item_not_found` | not this link's address item | 404 `not_found` |
| `item_approved` | staff already approved the address | 409 `item_approved` |
| `bad_address` | unknown source, or a manual address carrying county or verification facts | 400 `bad_request` |

## 4. Grants

`REVOKE EXECUTE … FROM PUBLIC, anon, authenticated`, then `GRANT EXECUTE … TO service_role`. Revoking PUBLIC also removes the Worker's implicit grant (see 0002), so the explicit grant is required. The publishable key cannot call the function.
