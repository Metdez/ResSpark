# `app/src/features/client-portal/step-copy.ts`

The client-facing words for steps, kept in one file so they can be reviewed for voice in one place.

- `STEP_DESCRIPTIONS`: one plain-language sentence per `StepKind`, shown under each step's label in the step list (D-11). The staff-chosen label says what the step is; the description says what the client will do.
- `COMING_NEXT`: the `title`, `body`, and `close` copy of the placeholder sheet every `View` opens in Phase 2. Uploads, connects, and forms arrive in Phases 3-6; until then the sheet says so plainly and points back to the agent.

Voice rules (UI-SPEC, Inherited): "agent" never "staff" or "user", "link" never "token", "bank" never "financial institution", no error codes, no exclamation marks. Vendor names appear in one place: the bank and payroll sheets show a provider trust line ("Secure connection powered by Plaid / Truv", `connect/provider-mark.tsx`), requested on the Oct 12 2026 ValorTax call so the client recognises who they are connecting through. Step descriptions and every other string stay vendor-free.
