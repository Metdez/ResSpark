# `app/worker/src/db/connections-ops.test.ts`

Unit tests for `projectSummary`, the pure half of the staff read model. They use canned rows and a fixed `now` of 2026-10-11, so the six target months run from Sep 2026 back to Apr 2026 and the three-month pay window starts 2026-07-01. The queries that feed `projectSummary` are covered live in `app/worker/test/connections-ops-live.test.ts`.

| Test | Proves |
|------|--------|
| six months, newest first | Stored cells keep their status and `document_id`. Months with no stored row come back as `missing` with `document_id: null`. |
| outside the window | A stored month older than the window is ignored. |
| account order | Accounts are sorted by `mask` ascending, then `id`, with null masks last. |
| update status | `HISTORICAL_UPDATE_COMPLETE` maps to `historical`, `INITIAL_UPDATE_COMPLETE` to `initial`, and `NOT_READY` to `not_ready`. A value already in lowercase form passes through. An absent value maps to `null`. |
| capabilities, no leaks | `capabilities` comes from `PROVIDER_CAPABILITIES`. The serialised summary never contains `return_nonce`, `sync_cursor`, `link_ref`, or `external_id`. |
| error | Only `code` and a string `message` are kept. Any extra vendor fields are dropped. |
| employers | Each employer gets its documents from the payroll storage group whose name ends in `-<employer_id>`, with counts of `pay_stub`, `w2`, and `income_report`. A Truv connection has `capabilities: null`. An employer with no documents gets zero counts, and employers without a stored report have `recent_pay: []`. |
| recent pay | From a stored report with two employments: a stub dated 2026-06-30 is dropped and one dated 2026-07-01 is kept (the window is inclusive of its first day); rows come newest first across employments; `'2000.00'` parses to `2000`, while `null` and `'n/a'` become `null`; a stub's `document_id` is the `pay_stub` file in the employer's own storage group whose name is `paystub-<pay_date>[-<check>].pdf` (`paystub-2026-09-15-1001.pdf` for check 1001), so an identically named file in another employer's group is ignored and a stub with no stored file gets `null`. The second employer, with no report, has `[]`. |
