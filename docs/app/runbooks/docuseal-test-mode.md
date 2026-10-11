# DocuSeal Test Mode setup

How to turn on embedded e-signing for the demo with DocuSeal's free Test Mode (Phase 6, D-08, D-10, D-21). Nothing here needs a code change. Until these steps are done, the signing page reads `Your agent will send this form another way.` and the staff card shows `E-sign not set up`, which is the honest fallback.

## 1. Account and Test Mode

1. Create an account at docuseal.com on the **US cloud** (the Worker calls `https://api.docuseal.com`; the EU cloud would need `DOCUSEAL_API_URL` changed).
2. In the DocuSeal Console, switch the **Test Mode** toggle on. Test Mode is a separate, isolated account with its own API keys, templates, and webhooks. Anything created while the toggle is off belongs to production.

## 2. API key

1. With Test Mode on, open **API** and create (or copy) the test API key.
2. From the repo root run `pnpm -C app secrets:provider docuseal`. Paste the key at the `DOCUSEAL_API_KEY` prompt (no echo). The value goes to the Worker secret and the git-ignored `app/.dev.vars` only.

## 3. Webhook and HMAC secret

DocuSeal does not document whether the webhook page has its own Test Mode switch (RESEARCH Open Question 7). Create the webhook **while the Console is in Test Mode**, so it belongs to the test account that owns the submissions.

1. **Webhooks** → add `https://resspark.zh-a16.workers.dev/api/webhooks/docuseal`.
2. Subscribe to `form.viewed`, `form.started`, `form.completed`, and `form.declined`.
3. Open **Security** and turn on **HMAC** signing. Copy the secret (`whsec_…`).
4. Run `pnpm -C app secrets:provider docuseal` again, leave the API key prompt empty, and paste the secret at the `DOCUSEAL_WEBHOOK_SECRET` prompt.
5. Check: `node app/scripts/smoke.mjs https://resspark.zh-a16.workers.dev` still prints `ok webhooks docuseal 401`, because an unsigned post must always be refused.

The Worker checks `X-Docuseal-Signature` (`<unix ts>.<hex HMAC-SHA256(secret, "<ts>.<raw body>")>`) with a ±300 s window, then re-reads the submission from the API. It never trusts the webhook body for the status.

## 4. Demo template

1. With Test Mode on, open **Templates** and create `Engagement letter (demo)` from any synthetic one-page PDF.
2. Give it exactly **one** signer role (the Worker refuses multi-signer templates with `template_not_single_signer`).
3. Add the fields `Full name`, `Case ID`, `Address` (optional), `Signature`, and `Date`. ResSpark prefills `Full name`, `Case ID`, and `Address` read-only by field name, so the names must match exactly.
4. In ResSpark, sign in as an admin and open **Settings → Integrations → E-sign templates**. Pick `Engagement letter (demo)` for **Engagement letter** and click `Save templates`.

## 5. Notifications

ResSpark sends `send_email: false` and `send_sms: false` on every submission and turns off the embed's send-copy button. DocuSeal's account-level notification settings may still email signers (RESEARCH A7). Open **Settings → Notifications** and turn off every signer email, for the Test Mode account.

## 6. Does Test Mode fire webhooks? (RESEARCH A2)

DocuSeal does not say. After the first real signing:

1. In the Supabase SQL editor run `select event_key, status, received_at from webhook_events where provider = 'docuseal' order by received_at desc limit 10;`.
2. Rows with `form.viewed:…`, `form.started:…`, and `form.completed:…` keys mean Test Mode fires webhooks. Write the answer in the Phase 6 SUMMARY or the UAT notes.
3. No rows means it does not. Signing still completes: the portal's `onComplete` asks the Worker to reconcile at once, and the 15-minute cron reconciles every pending signature. Staff then see `Signed` within seconds (onComplete) or within 15 minutes (cron) instead of instantly.

## 7. Document URL lifetime

DocuSeal's signed-document and audit-log URLs expire **40 minutes** after they are issued and then return 404. ResSpark stores only the submission id and downloads both PDFs (with sha256) in the same reconcile job, so a late retry re-reads the submission for fresh URLs. If a signed PDF is missing after an outage longer than that, press `Refresh` on the signature card.

## 8. Demo caveats

- The embed shows DocuSeal's **"Developer Sandbox. Upgrade to start using in Production."** banner in Test Mode, with an external link. Tell the audience not to tap it. It goes away with a production key.
- Test Mode documents are free and unlimited and carry no legal weight. The staff card shows a `Test` badge for them.

## 9. Switch to production (later, after counsel and Andrew sign off)

1. Andrew accepts DocuSeal production pricing (about $0.20 per completed document plus at least one Pro seat).
2. Counsel approves the real engagement letter and which forms may be e-signed (engagement letter, Form 2848, Form 8821; Form 433-A is never offered).
3. Turn Test Mode off. Create the production API key, a production webhook with the same four events and a new HMAC secret, and enter both with `pnpm -C app secrets:provider docuseal`.
4. Upload the real templates (production templates must be shared with Test Mode to appear there, and edits in Test Mode reflect in production) and map them again under Settings → Integrations → E-sign templates.
5. Set `"DOCUSEAL_ENV": "production"` in `app/wrangler.jsonc` so new signatures are not badged `Test`, and redeploy.
6. Turn off signer notification emails on the production account too.
7. Re-run `pnpm -C app smoke:esign https://resspark.zh-a16.workers.dev` and the [phone check](esign-phone-check.md).
