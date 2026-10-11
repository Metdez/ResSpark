# Phase 8 — API Coverage Decision Matrix

> Produced by gsd-planner. This phase adds external API calls for the first time: Teller (mTLS REST, Connect, webhooks), Resend sends with idempotency, and OpenRouter chat completions. It also adds removal calls to Plaid and Truv. Default is `INTEGRATE`; every `OPT-OUT` gives a one-line reason. Scope: every vendor endpoint named in 08-CONTEXT/08-RESEARCH plus the platform surfaces this phase adds.

| capability | decision | reason |
|------------|----------|--------|
| Teller: `GET /accounts` (mTLS via `TELLER_CERT`, Basic auth with the token as user) | INTEGRATE | Plan 08 `teller/transactions.ts` → `bank_accounts` (D-09); spike in Plan 02 |
| Teller: `GET /accounts/{id}/transactions?start_date&end_date` (180 days, retry once) | INTEGRATE | Plan 08 → `bank_transactions` with the spike-proven sign flip; pending re-ids cleaned up (D-09, RESEARCH Pitfall 8) |
| Teller: `count`/`from_id` paging | OPT-OUT | the date window is primary; paging is only a fallback for a repeated first-call timeout (RESEARCH refinement 1) |
| Teller: `DELETE /accounts` | INTEGRATE | Plan 08 `removeConnection`; daily removal (Plan 10) and retention purge (Plan 06) end billing (D-09, D-17) |
| Teller: statements / account details / balances / identity endpoints | OPT-OUT | transactions only (REM-03, `statementPdfs: false`); statements fall back to manual upload |
| Teller Connect: `cdn.teller.io/connect/connect.js` `TellerConnect.setup({ applicationId, environment, products: ['transactions'], nonce })` | INTEGRATE | Plan 10 bank step; server-minted nonce from Plan 08 start (D-11) |
| Teller Connect: enrollment signature (Ed25519 over `nonce.accessToken.userId.enrollmentId.environment`) | INTEGRATE | Plan 08 `teller-complete` with the server's `TELLER_ENV`; one variant frozen by the Plan 02 spike (D-11) |
| Teller webhooks: `enrollment.disconnected`, `transactions.processed`, `webhook.test` (`Teller-Signature` HMAC, 180 s window) | INTEGRATE | Plan 10 adapter on `/api/webhooks/teller`; payloads stripped to ids (D-12) |
| Teller webhooks: `account.number_verification.processed` | OPT-OUT | recorded and ignored; no account-number verification flow |
| Cloudflare: `mtls_certificates` binding + `wrangler mtls-certificate upload` | INTEGRATE | Plan 02 upload, Plan 08 binding (`remote: true`) |
| Resend: `POST https://api.resend.com/emails` with `Idempotency-Key: reminder-{request_id}-{n}` and `reply_to` | INTEGRATE | Plan 01 `sendEmail` / `send-reminder.ts` (D-03, D-04) |
| Resend: batch send, scheduled send, audiences/broadcasts | OPT-OUT | one claimed reminder per job; scheduling lives in `reminders_due`; no marketing email |
| OpenRouter: `POST https://openrouter.ai/api/v1/chat/completions` with `provider { zdr, data_collection: 'deny', allow_fallbacks: false, require_parameters: true }`, strict `json_schema`, `temperature 0`, no `user` | INTEGRATE | Plan 07 `ai/openrouter.ts`, redacted text only, off by default (D-20, RESEARCH refinement 3) |
| OpenRouter: `GET /api/v1/endpoints/zdr` | OPT-OUT | checked by hand at deploy (USER ACTION 7); the request-level `zdr` + `require_parameters` already fail closed |
| OpenRouter: vision/image input, streaming, tools | OPT-OUT | no OCR or vision (D-18); one small structured answer |
| Plaid: `POST /item/remove` | INTEGRATE | Plan 06 retention purge through `bankProvider(...).removeConnection` (Phase 4 already uses it for daily removal) (D-17) |
| Plaid: production access, DTM use case, OAuth registration | INTEGRATE (operator) | Dashboard steps in `docs/compliance/production-checklist.md` (Plan 03); no API call (PROD-01) |
| Truv: `DELETE /v1/links/{link_id}/` | INTEGRATE | Plan 06 `truv/links.ts` for every employer link at purge (D-17) |
| Truv: deleting links at 30 days | OPT-OUT | deferred in 08-CONTEXT |
| Supabase Auth MFA: `mfa.enroll`, `challengeAndVerify`, `getAuthenticatorAssuranceLevel`, `listFactors`, `unenroll`; REST `/auth/v1/factors` | INTEGRATE | Plan 09 SPA screens, demo enrollment script, smoke (D-13, D-14) |
| Supabase Auth admin: `auth.admin.mfa.listFactors`, `deleteFactor`, `getUserById` | INTEGRATE | Plan 09 reset script; Plan 11 evidence staff list; Plan 01 reminder Reply-To |
| Supabase Auth: phone/SMS MFA, WebAuthn/passkeys | OPT-OUT | TOTP only; passkeys deferred in 08-CONTEXT |
| Supabase Storage: `storage.from('case-documents').remove(paths)` (≤ 100 per call) | INTEGRATE | Plan 06 purge; objects never deleted with SQL (D-17) |
| DocuSeal: deleting/archiving submissions at purge | OPT-OUT | not in D-17; the vendor-side copy is a counsel item in the production checklist |
| Own SMS reminders / Logics note per reminder | OPT-OUT | deferred in 08-CONTEXT (TCPA; email only) |
