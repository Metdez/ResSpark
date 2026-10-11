# `app/src/features/client-portal/step-copy.ts`

The client-facing words for steps, kept in one file so they can be reviewed for voice in one place.

- `STEP_DESCRIPTIONS`: one plain-language sentence per `StepKind`, shown under each step's label in the step list (D-11). The staff-chosen label says what the step is; the description says what the client will do.
- `COMING_NEXT`: the `title`, `body`, and `close` copy of the placeholder sheet every `View` opens in Phase 2. Uploads, connects, and forms arrive in Phases 3-6; until then the sheet says so plainly and points back to the agent.

Voice rules (UI-SPEC, Inherited): "agent" never "staff" or "user", "link" never "token", "bank" never "financial institution", no error codes, no exclamation marks. No vendor names (Plaid, Truv) appear before those steps exist.
