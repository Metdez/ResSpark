# `app/src/features/client-portal/address/address-copy.ts`

`ADDRESS_COPY`: one constant object holding every client-facing string of the address step, so the components carry no literal copy and tests can match exact wording.

- Search: `inputLabel` (`Home address`), `placeholder`, `hint` (`Type at least 3 characters.`), `cantFind` (`I can't find my address`).
- Units: `unitsTitle` (`Choose your unit`), `unitsHint(n)` returns `{n} units at this address`.
- Confirm: `confirmTitle` (`Is this your home address?`), `confirmYes`, `confirmNo`.
- Unit prompt: `unitPrompt` (`Add your apartment or unit number.`), `unitLabel`, `unitSave`, `unitSkip` (`I don't have one`).
- Manual form: `manualTitle`, field labels `street`, `unit`, `city`, `state`, `zip`, the select placeholder `statePlaceholder`, and `manualSave`.
- Shared: `saving` (`Saving…`), `done` (`Address saved. Your agent has it.`), `close`.
- Fallback notices (D-06): `notConfigured` (503 `provider_not_configured`), `lookupFailed` (any other suggest error), `unverifiable` (422 `address_unverifiable`), and `saveFailed`.
- Field errors: `errStreet`, `errCity`, `errState`, `errZip`.

UI-SPEC client voice: second person, sentence case, no exclamation marks, no vendor name, and no mention of a county.
