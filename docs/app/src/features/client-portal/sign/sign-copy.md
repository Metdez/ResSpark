# `app/src/features/client-portal/sign/sign-copy.ts`

`SIGN_COPY`: every string the client sees on the signing page and the signature row (Plan 06-06). Client voice, no vendor name, as the UI-SPEC asks.

| Key | Text | Where |
|---|---|---|
| `back` | Back to your steps | Sticky header link and the button under a message |
| `loading` | Getting your form ready… | While the start call runs |
| `notConfigured` | Your agent will send this form another way. | Start returned 503 `provider_not_configured`, `template_not_mapped`, `template_invalid`, or 409 `bad_template` (D-10) |
| `alreadySigned` | You already signed this. Your agent has it. | Start returned `signed: true` or 409 `item_approved` |
| `signed` | Signed. Your agent has it. | Toast on the step list after the embed reports completion |
| `error` | Something went wrong. Try again. | Any other start failure |
| `tryAgain` | Try again | Retry button under `error` |
| `signButton` | Sign | The signature row's button. Chosen over "Review and sign" because the row is phone-width |

`as const` keeps each value a literal type.
