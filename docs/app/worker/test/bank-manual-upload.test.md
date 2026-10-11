# app/worker/test/bank-manual-upload.test.ts

Live, unmocked proof for the Phase 4 gap closure (PAY-03, BANK-03): a client can upload a file to a `bank_connect` item, and that file can fill one statement month as `manual`. Before the fix, the mint route answered 409 `item_not_upload` for every connect item, and the sheet tests mocked `UploadSheet`, so nothing caught it. Real Supabase (test firm), real Storage, the real `app`; nothing is stubbed. Skips with a warning unless `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `CLIENT_LINK_HMAC_KEY` and a publishable key (`SUPABASE_PUBLISHABLE_KEY` or `VITE_SUPABASE_PUBLISHABLE_KEY`) are set.

Run with `pnpm -C app run test:live:file worker/test/bank-manual-upload.test.ts`.

## Constants

| Name | Meaning |
|------|---------|
| `PDF` | `fixtures/files/tiny.pdf`, the bytes uploaded to Storage (starts with `%PDF-`, so the magic-byte check passes). |
| `MONTH` | The newest month in the 6-month window, from `targetMonths(new Date(), 6)`, so `isInWindow` always accepts it. |

## Setup (`beforeAll`)

1. `seedConnectionFixture(env, { kind: 'bank' })`: an opened request under the test firm with one required `bank_connect` item and a client link.
2. `insertConnection`: a Plaid bank connection on that item (no token; the manual route never calls Plaid).
3. One `bank_accounts` row (`acc_manual_0407`, mask `0000`) on that connection.
4. Reads the link's `version`, mints a link token with `mintLinkToken`, and opens `/c/<token>` to get the `rs_client` cookie, the same way the client does.

`post(path, body)` sends JSON with the cookie and `X-Requested-With: ResSpark`.

## Tests

1. **Upload on the connect item.** `POST /api/c/items/:itemId/uploads` → 201; the PDF is PUT to the signed URL → 200; `POST /api/c/uploads/:id/complete` with the SHA-256 → 200 with `document_status: 'ready'` and `item_status: 'submitted'`.
2. **Month attribution.** `POST /api/c/connections/:id/statements/manual` with the document, account and `MONTH` → 200 `{ status: 'manual' }`; the `bank_statement_months` row reads `{ status: 'manual', document_id }`.

## Cleanup (`afterAll`)

`documents.request_item_id` is `ON DELETE SET NULL`, so the item's Storage objects and `documents` rows are removed first. Then `fx.cleanup()` deletes the connection (accounts and month cells cascade) and the request (items, link and session cascade). The test case, the test firm and the append-only `events` stay; cases are never deleted.
