# Switching Logics pushes from fake to live

> **USER ACTION.** Nothing in this runbook is done by a code change or by Claude. The repo ships with `LOGICS_MODE=fake` and `LOGICS_WRITE_ENABLED=false` in `app/wrangler.jsonc`; flipping them is a deliberate human step, after Andrew (ValorTax / Logics admin) confirms the scopes and the test cases (Phase 5 D-10, Pitfall C1).

## What fake mode does today

- Pushes go to a built-in fake Logics client. It returns synthetic `CaseDocumentID`s and `ActivityID`s after a short delay. Ledger rows are stamped `mode='fake'` and show a `Simulated` badge, and the admin banner reads `SANDBOX · Logics writes simulated`.
- The environment guard (`LOGICS_WRITE_ENABLED` plus the `LOGICS_TEST_CASE_IDS` allowlist) applies only in **live** mode. Fake mode writes nothing real, so it is skipped there.
- The firm toggle **Write enabled** (Settings → Integrations → Push settings) applies in **both** modes. While it is off, every push is refused with `Logics writes are turned off for this firm in Settings`.

Demo step: a ValorTax admin opens Settings → Integrations and turns on **Write enabled** under Push settings, then saves.

## What Andrew must provide first

1. A Logics API key with POST rights: `case.write` (CaseDocument upload) and `activity.write` (case activity note), plus `case.read`. Create it under Logics Dashboard → Security → API Key. Generate the Secret Token under Settings → Integrations.
2. Two or three **fake test cases** in Logics, which are not real clients. Note their CaseIDs.
3. The `FileCategoryID` to file documents under, if ValorTax wants one. Leave it empty to use the Logics default.
4. Confirmation in writing to ValorTax that only those test cases are used until the pilot is signed off.

Pitfall C1 rules: use a read-only key in development and the write key only in production. Use fake test cases only. Tell ValorTax in writing. Never paste a key or token into the repo, a doc, a log, or a plan summary. They go only into the Settings page, which stores them encrypted in `firm_integrations`.

## Steps, in order

| # | Step | What it proves |
|---|------|----------------|
| 1 | Andrew issues the write-scoped key and the test CaseIDs (above). | The tenant allows writes and there are safe cases to write to. |
| 2 | A ValorTax admin pastes the API key and Secret Token in ResSpark Settings → Integrations → IRS Logics and clicks **Save credentials**. | The credentials are stored encrypted, and only the key hint is shown. |
| 3 | Set `"LOGICS_TEST_CASE_IDS": "<id1>,<id2>"` in `app/wrangler.jsonc` `vars` and deploy (`pnpm -C app run deploy`). Click **Test connection**. It must say `Connected`, and the Push settings card should read `Activity types seen in Logics: …`. | The key authenticates. The activity listing works on a test case, and you see which `ActivityType` strings exist. If it says `Logics returned 403 for the activity listing`, the key lacks activity scopes. Stop and go back to Andrew. |
| 4 | In Push settings, set **File category ID (optional)** (or leave it empty), pick an **Activity type** from the listed ones, turn on **Write enabled**, and click **Save**. | The firm settings are in place (D-08). |
| 5 | Set `"LOGICS_WRITE_ENABLED": "true"` in `app/wrangler.jsonc` `vars`. | The environment guard will allow writes to the allowlisted CaseIDs only. |
| 6 | Set `"LOGICS_MODE": "live"` last, in the same file. | Pushes and lookups now go to the real tenant. |
| 7 | Deploy with `pnpm -C app run deploy`, then run `node app/scripts/smoke.mjs <url>`. It must print `ok /api/config (logics_mode=live)`. | The deployed Worker is in the mode you think it is. |
| 8 | Manual proof: on a request linked to a **test** CaseID, approve `examples/01_marcus_delgado_CNC/01_IRS_Account_Transcript.pdf` and push it. Watch the chip go `Queued → Sending → Sent` with no `Simulated` badge. In the Logics UI, open the test case and check the document and the activity note. | A real document and activity reached Logics. |
| 9 | Record the `CaseDocumentID` and `ActivityID` from the ledger row in `.planning/phases/05-push-to-logics/05-05-SUMMARY.md`. | The proof is written down. |

Rows queued in fake mode are never sent live. The consumer fails them with `mode_changed`, so staff re-send after the switch.

## Rollback

Set `"LOGICS_MODE": "fake"` (and `"LOGICS_WRITE_ENABLED": "false"`) and deploy. This takes effect at once for new pushes. Rows that were already `sent` stay in the ledger as the delivery record. Anything still queued from live mode fails with `mode_changed` instead of being sent.

## Open questions that block step 8

- **A2:** whether the `ActivityType` input accepts the strings that Logics lists (step 3 shows them; pick one from the list).
- **A3:** whether the Activity endpoint takes a JSON body as the docs suggest.
- **Write scopes:** whether the key Andrew issues really carries `case.write` and `activity.write`. Test connection proves only the read path and the activity listing.
