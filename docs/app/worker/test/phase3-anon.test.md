# `app/worker/test/phase3-anon.test.ts`

Live proof (Plan 03-07; T-03-07, Phase 1 F-6) that the publishable key, which ships to every browser, reaches nothing that migration `0004_uploads_review.sql` added. Plan 01's `information_schema` check counts the `REVOKE`s statically; this suite proves them through PostgREST, where an attacker would try.

It lives in its own file rather than in `rls.test.ts` because Plan 04-01 owned `rls.test.ts` while this plan ran. `rls.test.ts` already lists `request_dashboard_v` in its relation walk (added by Plan 01), so the view is covered in both places.

Run: `pnpm -C app run test:live:file worker/test/phase3-anon.test.ts`. It needs `SUPABASE_URL` (or `VITE_SUPABASE_URL`) and a publishable key (`SUPABASE_PUBLISHABLE_KEY` or `VITE_SUPABASE_PUBLISHABLE_KEY`); without them the suite is skipped. It writes nothing.

## How it works

`anon` is a `supabase-js` client built from the publishable key with session persistence and token refresh off, so every call runs as PostgREST role `anon`. Every argument is the zero uuid `00000000-0000-0000-0000-000000000000` (or a throwaway scalar), so no row could match even if a call were allowed: a refusal is about the grant, not the data.

`refused(res)` asserts `data` is `null` and that `{ status, code }` equals `{ 401, '42501' }`, the same strict bar as `rls.test.ts`. Revoked privileges raise Postgres `42501`, which PostgREST maps to 401 for `anon`. A `200` with or without rows fails the test, so a leaked grant cannot pass as an empty result.

## Cases

| Case | Call |
|------|------|
| `request_dashboard_v` | `from('request_dashboard_v').select('*').limit(1)` |
| `request_status` | `rpc('request_status', { p_request_id })` |
| `request_apply_status` | `rpc('request_apply_status', { p_request_id })` |
| `upload_complete` | `rpc('upload_complete', { p_document_id, p_request_id, p_size_bytes: 1, p_sha256: 'a' x 64, p_actor_id: 'x' })` |
| `item_approve` | `rpc('item_approve', { p_item_id, p_firm_id, p_actor_id: 'x' })` |
| `item_reject` | `rpc('item_reject', { p_item_id, p_firm_id, p_note: 'n', p_actor_id: 'x' })` |
