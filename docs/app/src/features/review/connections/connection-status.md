# `app/src/features/review/connections/connection-status.ts`

Pure mappings from server values to the badge and copy staff see on a connection card. Nothing here infers a status: each function only renames what the server sent (D-04, WEBH-03). Badge tones are the UI-SPEC palette in `lib/status.ts` (`Tone`), rendered with the Phase 3 `StatusBadge` component.

## `connectionBadge(status, errorCode)`

| `status` | `errorCode` | Tone | Label |
|----------|-------------|------|-------|
| `pending` | any | neutral | Waiting for client |
| `connected` | any | info | Connected |
| `syncing` | any | info | Syncing (bank is sending history) |
| `done` | any | success | Done |
| `error` | `ITEM_LOGIN_REQUIRED` | destructive | Client must reconnect |
| `error` | `order_expired` | destructive | Order expired |
| `error` | `link_expired` | destructive | Link timed out |
| `error` | anything else or `null` | destructive | Error |
| `removed` | any | muted | Removed |
| unknown value | any | neutral | the raw status |

## `transactionsLine(count, updateStatus)`

Returns `Transactions: {count} · {state}`.

| `updateStatus` | State |
|----------------|-------|
| `historical` | Up to date |
| `initial`, `not_ready` (or any other non-null value) | Syncing |
| `null` | Not started |

A bank that is still sending history therefore never reads as a final `0 transactions` (PITFALLS M4).

## `cellBadge(status)`

One statement-grid cell.

| Cell status | Tone | Label |
|-------------|------|-------|
| `available` | success | Statement (a bank-issued statement PDF) |
| `manual` | info | Uploaded (a file the client or staff attached; never labelled as bank-issued, PITFALLS C6) |
| `not_supported` | muted | Not from bank |
| `missing` | warning | Missing |
| `pending` | neutral | Checking |
| `generated` | info | From transactions (not a stored cell status: the grid passes it for a `not_supported` or `missing` cell that carries a ResSpark-generated transaction statement, Oct 12 call item H) |
| unknown | warning | Missing |

## `employerBadge(status)`

One employer inside a payroll connection.

| Employer status | Tone | Label |
|-----------------|------|-------|
| `pending` | neutral | Waiting for client |
| `connected` | info | Connected |
| `done` | success | Done |
| `error` | destructive | Needs attention |
| unknown | neutral | the raw status |

## `employerCounts(e)`

Joins the non-zero counts with ` · `, singular or plural: `2 pay stubs · 1 W-2 · 1 income report`, `1 pay stub`. All three zero gives `No documents yet`. `plural(n, one, many)` is the private helper.
