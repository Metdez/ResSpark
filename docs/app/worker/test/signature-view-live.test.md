# `app/worker/test/signature-view-live.test.ts`

Live test (test firm only; skipped without `SUPABASE_URL`, `SUPABASE_SECRET_KEY`,
`CLIENT_LINK_HMAC_KEY`) for `db/signature-view.ts`. Runs in `pnpm -C app test:live`, or alone with
`pnpm -C app run test:live:file worker/test/signature-view-live.test.ts`.

## Setup

- `seedPortalItems({ kinds: ['signature'] })` gives an opened request with one `engagement_letter` item.
- A second `signature` item with `config.template = 'form_8821'` is inserted directly.
- The env forces `DOCUSEAL_API_KEY = ''`, so `configured` is false unless a test passes a keyed env.
- Connections are inserted with `link_ref = 'viewSlugNeverShown'` so the last case can prove the slug never
  reaches the view. `afterAll` runs the fixture cleanup (connections, then the request).

## Cases

1. No connection: exactly `{ item_id, template_key: 'engagement_letter', configured: false, connection: null }`.
2. One connection walks `waiting`, then `viewed` (after `esign.viewed`), `signing` (after `esign.started`)
   and `signed` (after `connection_set_status(..., 'done')`, with a `completed_at`). `env` is `test`.
3. The second item's connection set to `error { code: 'declined' }` reads `declined` with
   `env: 'production'`, and the first item stays `signed` (latest connection and events are per item).
4. `configured`: the firm mapping is set to `engagement_letter: 1001` and restored in a `finally`. With a
   DocuSeal key the mapped item is configured and the unmapped 8821 item is not; without a key neither is.
   Same set-and-restore pattern as `esign-start.test.ts`.
5. The JSON of all views contains none of `link_ref`, `external_id`, `embed_src`, or the slug value.
