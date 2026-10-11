# `app/src/features/client-portal/connect/connect-copy.ts`

Every string the payroll sheet, the bank sheet, and the return page show, in one place. Voice (UI-SPEC): second person, sentence case, no exclamation marks; say "agent", "bank", "payroll", never "token", "staff", "financial institution", or a vendor name.

## `CONNECT_COPY.payroll`

| Key | Text |
| --- | --- |
| `connect` | Connect payroll |
| `another` | Add another employer |
| `upload` | Upload pay stubs instead |
| `intro` | Connect your payroll account so your pay stubs and W-2 come through on their own. If you have more than one job, you can add each one. |
| `finishing` | Finishing up… |
| `connected` | Payroll connected. We're getting your pay stubs now. |
| `done` | Done. Your agent has what they need. |
| `notConfigured` | Your agent's payroll connection isn't set up yet. Upload your pay stubs instead. |
| `bridgeFailed` | The payroll window couldn't open. Try again, or upload your pay stubs instead. |

## `CONNECT_COPY.bank`

| Key | Text |
| --- | --- |
| `connect` | Connect bank |
| `upload` | Upload statements instead |
| `intro` | Connect the bank you use most. We'll gather up to 6 months of transactions and statements. |
| `introNoStatements` | Connect the bank you use most. We'll gather up to 6 months of transactions; you'll add the statements yourself below. |
| `notAvailable` | Connecting this bank isn't available yet. Upload your statements instead. |
| `notConfigured` | Your agent's bank connection isn't set up yet. Upload your statements instead. |
| `checking` | Checking your connection… |
| `syncing` | Bank connected. Your bank is sending the history — this can take a few minutes. |
| `done` | Done. Your agent has what they need. |
| `uploadMonth(label, mask)` | `Upload your {label} statement`, plus ` for ••{mask}` when a mask is known |
| `received` | Received |
| `pendingCell` | Checking… |
| `notSupported` | Not from this bank |

## `CONNECT_COPY.return`

| Key | Text |
| --- | --- |
| `title` | Checking your connection… |
| `body` | Give us a moment while your bank finishes up. |
| `slow` | This is taking longer than usual. |
| `slowBody` | You can go back to your steps — we'll keep checking in the background. |
| `back` | Back to your steps |
| `connected` | Bank connected |

The object is `as const`, so each string is a literal type.

## `connectErrorCopy(code, kind)`

Maps a server or client error code to one sentence:

| Code | Text |
| --- | --- |
| `provider_not_configured` | the kind's `notConfigured` |
| `provider_error`, `provider_unavailable` | We couldn't reach the connection service. Try again in a minute. |
| `order_expired` | This request expired. Ask your agent to send a new link. |
| `ITEM_LOGIN_REQUIRED` | Your bank asked you to sign in again. Connect your bank again. |
| `link_expired` | That connection timed out. Try again. |
| `consent_text_stale` | Please read and agree again. |
| anything else | Something went wrong. Try again. |
