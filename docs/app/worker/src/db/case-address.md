# `app/worker/src/db/case-address.ts`

RPC wrapper for `public.case_confirm_address` (migration 0007).

- `AddressSource`: `'smarty' | 'manual'`.
- `AddressPayload`: a `VerifiedAddress` plus `source` and `verified`. It is sent as the RPC's `p_address` jsonb.
- `TOKENS` (private): the RPC's RAISE tokens (`link_inactive`, `item_not_found`, `item_approved`, `bad_address`). The shared list in `rpc-error.ts` only knows the 0003 tokens, so this module matches its own list the same way `db/documents.ts` does for `upload_complete`.
- `confirmAddress(env, { itemId, linkId, address })`: one `admin.rpc('case_confirm_address', …)` call. The database does the case update, the item move, the `address.confirmed` event, and the request status in one transaction. An RPC error throws `Error(<token>)`, or `Error('address_failed')` for anything unknown; the route maps tokens to HTTP codes.
