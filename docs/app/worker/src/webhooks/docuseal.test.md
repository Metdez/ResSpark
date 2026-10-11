# `app/worker/src/webhooks/docuseal.test.ts`

Unit tests for `docuseal.ts` (Plan 06-04). Bodies are the `test/fixtures/docuseal/webhook_form_completed.json` text, signed with `test/helpers/docuseal-sign.ts` under a fixed unit secret; the timestamp argument moves the signature inside or outside the 300-second window. No network and no database. The cases are listed in `docuseal.md` under Tests.
