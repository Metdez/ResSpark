# `app/worker/src/integrations/logics/write-types.ts`

The contract for the two Logics writes (Phase 5, D-07). The live client (`client.ts`), the fake (`fixtures.ts`), the queue consumer and the finalizer all import from here.

## Exports

- `LOGICS_MAX_PART_BYTES = 5_767_168` (5.5 MiB, D-05). The vendor doc says "Maximum uploaded file size is 6 MB per file" without saying which megabyte; 5,767,168 is below both 6,000,000 (SI) and 6,291,456 (MiB) with room for about 300 bytes of multipart framing. A part over it is refused before `fetch` (`size_gate`).
- `DocResult`: `{ kind: 'sent', logicsDocumentId }` | `{ kind: 'failed', status, code }` | `{ kind: 'unknown', code }`. `unknown` means the request may have been dispatched and nobody can tell whether Logics stored the file (PUSH-04).
- `ActivityResult`: the same union for `CaseActivity/Activity`, with `activityId`.
- `isCaseDocumentCreated(x)` / `isActivityCreated(x)`: zod 4 guards via `safeParse`: `Success` must be the literal `true` and `data.CaseDocumentID` / `data.ActivityID` an integer. This is the only proof of success (Pitfall 2); the response `message` (which carries a user name and a typo in the vendor example) is never read.
- `LogicsWriteClient`: `createCaseDocument({ caseId, comment, fileCategoryId?, fileName, bytes })`, `createActivity({ caseId, activityType, subject, comment })`, `listActivities(caseId)` (distinct `ActivityType` strings, or `{ kind: 'failed', status }`). `LogicsClient` in `client.ts` extends it, so the live and the fake client both implement it.
- `FakeWriteOptions`: `{ outcome?: 'sent' | 'unknown' | 'auth' | 'scope' | 'rejected'; delayMs?: number }`, the fake's injectable outcome (default `sent`, 300 ms).

## Tests

`write-types.test.ts`: the guards accept the vendor examples and reject a string id, `Success: false`, and `null`; the gate constant is `5767168`.
