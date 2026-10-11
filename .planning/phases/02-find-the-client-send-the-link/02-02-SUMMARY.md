---
phase: 02-find-the-client-send-the-link
plan: 02
subsystem: api
tags: [logics, lookup, fixtures, zod, aes-gcm, web-crypto, ssrf-guard, vitest]

requires:
  - phase: 01-foundation-staff-sign-in
    provides: Worker scaffold, worker-node and web Vitest projects, write-guard folder style, size gate
provides:
  - Logics read client (Basic auth, header parameters, 3 s timeout, retry once on network only)
  - Defensive Logics row mapper that never copies DOB or money fields
  - Fixture Logics client (four example.com cases) for LOGICS_MODE=fake
  - lookupCases / detectLookupType / fetchCaseSummary with phone normalization, (###)###-#### retry, dedupe, stable order
  - Shared contact validation (checkContact, suggestDomain, contactSchema, masks) for SPA and Worker
  - AES-GCM credential sealing (encryptSecret / decryptSecret / keyHint)
  - validateLogicsBaseUrl SSRF guard and resolveLogicsClient / liveClientFromRow
affects: [02-03, 02-04, 02-05, 02-06, phase-05-logics-writes, phase-08-deliverability]

actuals:
  tokens: 16700
  tasks: 3
  commits: 6
plan_head_before: 1cb9505fda1bace7637cead9c12f40274a90658c
plan_head_after: e464bafa31fac5992532951e0daa8a5eec9617e0

tech-stack:
  added: []
  patterns:
    - "Logics access only through the LogicsClient interface; fixture and live clients are interchangeable"
    - "Explicit field-list mapping from external rows (never spread raw API data)"
    - "Errors as kind tokens only (LogicsError.kind, decrypt_failed, invalid_base_url) with no request data in messages"
    - "Shared SPA+Worker module under app/src/lib imported by relative path from the Worker"

key-files:
  created:
    - app/src/lib/contact.ts
    - app/src/lib/contact.test.ts
    - app/worker/src/integrations/logics/client.ts
    - app/worker/src/integrations/logics/client.test.ts
    - app/worker/src/integrations/logics/mapper.ts
    - app/worker/src/integrations/logics/mapper.test.ts
    - app/worker/src/integrations/logics/fixtures.ts
    - app/worker/src/integrations/logics/lookup.ts
    - app/worker/src/integrations/logics/lookup.test.ts
    - app/worker/src/integrations/logics/config.ts
    - app/worker/src/integrations/logics/config.test.ts
    - app/worker/src/integrations/credential-crypto.ts
    - app/worker/src/integrations/credential-crypto.test.ts
    - docs/app/src/lib/contact.md
    - docs/app/worker/src/integrations/logics/client.md
    - docs/app/worker/src/integrations/logics/mapper.md
    - docs/app/worker/src/integrations/logics/fixtures.md
    - docs/app/worker/src/integrations/logics/lookup.md
    - docs/app/worker/src/integrations/logics/config.md
    - docs/app/worker/src/integrations/credential-crypto.md
  modified: []

key-decisions:
  - "Typo-domain matching counts one adjacent swap as a single edit (OSA distance), because the required gmial/hotmial cases are transpositions that plain Levenshtein scores as 2"
  - "checkContact offers a domain suggestion even next to a syntax error, so a@gmailcom gets a@gmail.com; keep-as-is must not be offered while email_error is set"
  - "LOGICS_MODE=fake always wins over stored credentials (C1 demo safety); live needs both ciphertexts plus last_test_ok === true"
  - "liveClientFromRow re-validates base_url against APP_ENV and maps decrypt failure (rotated key) to not_configured"
  - "config.ts uses a local LogicsEnv type until Plan 03 adds LOGICS_MODE / INTEGRATION_ENC_KEY to wrangler.jsonc and regenerates Env"
  - "caseInfo treats 404, Success:false, or null data as no case (shortcut pending Andrew's confirmation)"

patterns-established:
  - "Fixture client: synthetic example.com / 555-010-xxxx data only, same shapes as live"
  - "RED via stub modules so the target test fails on an assertion, not an import"

requirements-completed: [LOOK-01, LOOK-02, LOOK-03, LOOK-05, REQ-02]

coverage:
  - id: D1
    description: "Logics client sends Basic auth and header parameters, with retry-once-on-network and leak-free errors"
    requirement: "LOOK-01"
    verification:
      - kind: unit
        ref: "app/worker/src/integrations/logics/client.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Shared phone yields separate cards with de-duplication and stable ordering"
    requirement: "LOOK-02"
    verification:
      - kind: unit
        ref: "app/worker/src/integrations/logics/lookup.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Phone in any documented format normalizes; (###)###-#### retry only after an empty digits-only result"
    requirement: "LOOK-03"
    verification:
      - kind: unit
        ref: "app/worker/src/integrations/logics/lookup.test.ts; app/src/lib/contact.test.ts#normalizePhone"
        status: pass
    human_judgment: false
  - id: D4
    description: "Credential sealing and fake/live client resolution with base URL guard"
    requirement: "LOOK-05"
    verification:
      - kind: unit
        ref: "app/worker/src/integrations/credential-crypto.test.ts; app/worker/src/integrations/logics/config.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "Shared contact validation with did-you-mean domain suggestions and exact field copy"
    requirement: "REQ-02"
    verification:
      - kind: unit
        ref: "app/src/lib/contact.test.ts"
        status: pass
    human_judgment: false

duration: 29min
completed: 2026-10-11
status: complete
---

# Phase 2 Plan 02: Logics Read Module, Shared Contact Validation, Credential Crypto Summary

**A DB-free Logics read path built on the LogicsClient interface: a header-auth fetch client, a defensive mapper, a four-case example.com fixture client, and lookup orchestration with phone normalization, the (###)###-#### retry, dedupe, and stable ordering. Also a shared Zod 4 contact validator with did-you-mean domains, AES-GCM credential sealing, and an SSRF-guarded fake/live client resolver.**

## Performance

- **Duration:** about 29 min
- **Started:** 2026-10-11T04:09:45Z
- **Completed:** 2026-10-11T04:38:19Z
- **Tasks:** 3 (all TDD: RED commit, then GREEN commit)
- **Files created:** 20

## Accomplishments

- `createLogicsClient` sends `Authorization: Basic base64(key:secret)` and the `phone`/`email`/`lastName`/`CaseID` headers to the four documented endpoints. It has a 3000 ms timeout, retries a network failure exactly once, never retries any HTTP status, and its errors carry only `kind` and `status`.
- `toSummary` builds the summary from an explicit field list. `''` and missing values become `null`. `Status` and `StatusID` are both read. DOB, MaritalStatus, TaxLiability, and TaxAmount are never copied.
- `createFakeLogicsClient` serves fixture CaseIDs **900001, 900002, 900003, 900004**. 900001 and 900002 share a phone stored in two formats, which exercises the multi-match path.
- `lookupCases` sends digits only first and retries in the doc format only when the first call is empty. The retry result replaces the empty list. Results are de-duplicated by CaseID, sorted by created date descending then CaseID ascending, and unknown dates go last.
- `checkContact` / `suggestDomain` cover the seven known domains, a missing dot, and one edit (including an adjacent swap), with the exact field copy strings.
- `encryptSecret` / `decryptSecret` use AES-GCM-256 with a random 12-byte IV. Every decrypt failure becomes `decrypt_failed`, and a malformed key becomes `bad_key`.
- `validateLogicsBaseUrl` allows https only, rejects IP literals, queries, and fragments, and pins the `logiqsapi.com` host in production. `resolveLogicsClient` always returns the fixture client in fake mode.

## Task Commits

1. **Task 1: Logics read module (tracer)**: `a5a326b` (test, RED), `f96eb2e` (feat, GREEN). Tracer gate re-ran verify end to end: client 15, mapper 5, lookup 13 passing.
2. **Task 2: Shared contact validation**: `92bf71e` (test, RED), `fbf0161` (feat, GREEN). 20 tests.
3. **Task 3: Credential crypto and client resolution**: `0e62fa5` (test, RED), `e464baf` (feat, GREEN). Crypto 9, config 15.

## TDD Gate Compliance

| Task | Target test | RED classifier | Semantic assessment |
|------|-------------|----------------|---------------------|
| 1 | `client.test.ts > createLogicsClient > findByPhone sends GET with Basic auth and a phone header, no query string` | RED_EVIDENCE_OK (target_test_failed) | Failed on the assertion "promise rejected Error: stub instead of resolving" against a stub client, which is the intended reason. In the full run against stubs, 31 of 32 failed on assertions. |
| 2 | `contact.test.ts > suggestDomain > gmial.com → gmail.com` | RED_EVIDENCE_OK (target_test_failed) | The stub returned `null` where `gmail.com` was expected. 15 of 19 failed in the full run. |
| 3 | `credential-crypto.test.ts > credential crypto > round-trips` | RED_EVIDENCE_OK (target_test_failed) | The stub returned `''` where `sk-123` was expected. 23 of 23 failed in the full run. |

RED runs were targeted with `-t` because Vitest's `tap-flat` reporter emits multi-line YAML for diff output, which the classifier rejects as malformed TAP.

## Files Created/Modified

See `key-files.created` above. There are 13 code and test files and 7 companion docs, and no existing files were modified.

## Decisions Made

See `key-decisions` in the frontmatter.

## Open Questions for Andrew (shortcut comments)

1. **CaseInfo unknown-id behavior** (`client.ts` `caseInfo`): the doc does not say what an unknown CaseID returns. 404, `Success:false`, and null data are all treated as "no case" for now.
2. **Accepted `phone` header format** (`lookup.ts`): undocumented (D-04). Digits only is sent first, with one retry in the `(121)121-2121` sample format when the first call is empty. Remove the retry once the format is confirmed.

## Planner Assumption Carried (REQ-02)

Email validation is syntax (`z.email()`), non-empty, and the seven-domain typo table. **No MX or DNS-over-HTTPS lookup** is done (PITFALLS M2). That is accepted debt for Phase 8 deliverability.

## Fake-Mode Precedence Rule

`LOGICS_MODE=fake` returns the fixture client even when tested live credentials exist. `live` requires both ciphertexts, `last_test_ok === true`, a base URL valid for the current `APP_ENV`, and ciphertexts that decrypt. Anything else is `LogicsError('not_configured')`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan test value `'12345678901'` contradicted its own rule**
- **Found during:** Task 1 GREEN
- **Issue:** The plan expected `detectLookupType('12345678901')` (labeled "11 digits, no leading 1") to be `null`, but that value does start with `1`, so `normalizePhone` correctly accepts it as `2345678901`.
- **Fix:** The test uses `'21211212121'`, the must_haves example of 11 digits without a leading 1.
- **Files:** `app/worker/src/integrations/logics/lookup.test.ts`
- **Commit:** `f96eb2e`

**2. [Rule 1 - Bug] One-edit typo matching could not satisfy the required cases**
- **Found during:** Task 2
- **Issue:** `gmial.com` and `hotmial.com` are adjacent transpositions, which Levenshtein distance scores as 2, so the planned "distance ≤ 1" rule would not suggest them.
- **Fix:** `withinOneEdit` also accepts one adjacent swap (OSA distance ≤ 1).
- **Files:** `app/src/lib/contact.ts`
- **Commit:** `fbf0161`

**3. [Rule 2 - Missing critical] Suggestion for a missing-dot domain was unreachable**
- **Found during:** Task 2
- **Issue:** `z.email()` rejects `a@gmailcom`, so a suggestion computed only after a syntax pass would never fire for the missing-dot case.
- **Fix:** The suggestion is computed whenever there is an `@`, alongside the syntax error. Covered by a test.
- **Files:** `app/src/lib/contact.ts`, `app/src/lib/contact.test.ts`
- **Commit:** `fbf0161`

**4. [Rule 3 - Blocking] `Env` lacks `LOGICS_MODE` / `INTEGRATION_ENC_KEY`**
- **Found during:** Task 3
- **Issue:** The planned `Pick<Env, 'LOGICS_MODE' | 'INTEGRATION_ENC_KEY' | 'APP_ENV'>` does not type-check until Plan 03 declares those vars, and `worker-configuration.d.ts` is outside this plan's files.
- **Fix:** A local `LogicsEnv` interface with a `shortcut:` comment to switch to `Pick<Env, ...>` after `pnpm cf-typegen`.
- **Files:** `app/worker/src/integrations/logics/config.ts`
- **Commit:** `e464baf`

**5. [Rule 2 - Missing critical] Threat model T-02-07 re-validation and decrypt-failure mapping**
- **Found during:** Task 3
- **Issue:** The threat register requires `base_url` to be re-validated before a live client is built. The planned `liveClientFromRow` signature took only `INTEGRATION_ENC_KEY`.
- **Fix:** `liveClientFromRow` takes `APP_ENV` too, calls `validateLogicsBaseUrl`, and maps a decrypt failure (rotated key) to `not_configured`. The guard also rejects URLs with a query or fragment. Tests were added for each.
- **Files:** `app/worker/src/integrations/logics/config.ts`, `config.test.ts`
- **Commit:** `e464baf`

**6. [Rule 2] `caseInfo` 404 handling matches its own `shortcut:` comment**
- **Found during:** Task 1
- **Issue:** The planned comment says a 404 means "no case", but the planned error mapping would have thrown `upstream` for a 404.
- **Fix:** `caseInfo` maps a 404 to `null`, with a test.
- **Commit:** `f96eb2e`

### Tooling Note

`pnpm -C app vitest run ...` (the plan's verify form) fails under pnpm 10.32 with `Command "app" not found`. The equivalent `pnpm -C app exec vitest run ...` was used for every verify step.

## Issues Encountered

None beyond the deviations above.

## User Setup Required

None for this plan. Plan 03 declares `LOGICS_MODE` and `INTEGRATION_ENC_KEY` in `wrangler.jsonc` and provisions the key.

## Verification

- `pnpm -C app exec vitest run --project worker-node worker/src/integrations/logics/{client,mapper,lookup}.test.ts` → 33 passed
- `pnpm -C app exec vitest run --project web src/lib/contact.test.ts` → 20 passed; `contact.ts` is 103 lines
- `pnpm -C app exec vitest run --project worker-node worker/src/integrations/credential-crypto.test.ts worker/src/integrations/logics/config.test.ts` → 24 passed
- `pnpm -C app check` (size gate, `tsc -b`, eslint, web + worker-node tests) → exit 0, 112 tests passed
- `grep -rn "console\." app/worker/src --include=*.ts | grep -v test | wc -l` → 1 (the Phase 1 logger line)
- Fixture check: 5 `example.com` occurrences, 0 gmail/yahoo/hotmail/outlook addresses

## Next Phase Readiness

Plans 03-05 can import `resolveLogicsClient`, `lookupCases`, `fetchCaseSummary`, `checkContact`, `encryptSecret`, and `keyHint` directly. Plan 03 must add `LOGICS_MODE` (default `fake`) and `INTEGRATION_ENC_KEY` to `wrangler.jsonc` and regenerate types, then swap `LogicsEnv` for `Pick<Env, ...>`.

## Self-Check: PASSED
