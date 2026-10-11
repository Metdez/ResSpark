# `app/worker/src/db/case-address.ts`

RPC wrapper for `public.case_confirm_address` (migration 0007).

- `AddressSource`: `'smarty' | 'manual'`.
- `AddressPayload`: a `VerifiedAddress` plus `source` and `verified`. It is sent as the RPC's `p_address` jsonb.
- `TOKENS` (private): the RPC's RAISE tokens (`link_inactive`, `item_not_found`, `item_approved`, `bad_address`). The shared list in `rpc-error.ts` only knows the 0003 tokens, so this module matches its own list the same way `db/documents.ts` does for `upload_complete`.
- `confirmAddress(env, { itemId, linkId, address })`: one `admin.rpc('case_confirm_address', …)` call. The database does the case update, the item move, the `address.confirmed` event, and the request status in one transaction. An RPC error throws `Error(<token>)`, or `Error('address_failed')` for anything unknown; the route maps tokens to HTTP codes.
- `CaseAddressView` (Plan 06-03): the staff read model — `line1, line2, city, state_code, zip5, zip4, county_name, county_fips, rdi, dpv, verified, source, confirmed_at`.
- `getCaseAddress(env, caseId)`: selects the 13 address columns of `cases` by id and maps the `address_*` column names to the view keys explicitly (`address_rdi` → `rdi`, `address_dpv` → `dpv`, `address_verified` → `verified`, `address_source` → `source`, `address_confirmed_at` → `confirmed_at`). Returns `null` while `address_confirmed_at` (or `address_line1`) is null, so an unconfirmed case reads as "no address yet". A query error throws `Error('address_lookup_failed')`. It does no firm check itself: its only caller, `GET /api/admin/requests/:id/review`, reaches it after the firm-scoped `getFirmRequest` (T-06-13).
