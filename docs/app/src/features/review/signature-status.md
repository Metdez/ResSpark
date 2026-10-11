# `app/src/features/review/signature-status.ts`

Maps an e-sign stage (`EsignStage` from `./api`) to the chip on the staff signature card (D-20).

| stage | tone | label |
|---|---|---|
| `not_started`, `waiting`, or `null` | `neutral` | `Waiting` |
| `viewed` | `info` | `Viewed` |
| `signing` | `info` | `Signing` |
| `signed` | `success` | `Signed` |
| `declined` | `destructive` | `Declined` |
| `expired` | `warning` | `Expired` |
| `error` | `destructive` | `Needs attention` |

Tones use the same `Tone` names as `connections/connection-status.ts`: neutral while waiting on the client,
info while in progress, success when done, destructive on failure. An unknown stage string falls back to
`Needs attention`, so a new server stage is never shown as a success.

`signatureChip(stage)` returns `{ tone, label }`, which the card spreads into `StatusBadge`.

## Test (`signature-status.test.ts`)

A table test of all eight stages, plus `null` (neutral `Waiting`) and an unknown stage (`Needs attention`).
