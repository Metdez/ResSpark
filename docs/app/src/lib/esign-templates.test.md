# `app/src/lib/esign-templates.test.ts`

Web-project unit tests for `esign-templates.ts`.

| Test | Proves |
|------|--------|
| keys and labels | exactly `engagement_letter`, `form_2848`, `form_8821` in order, each with a label |
| D-01 guard | `form_433a`, `form_656`, `''`, `null`, `undefined` and a number are rejected; `form_8821` is accepted |
| IRS notes | no note for the engagement letter; the 8821 note names `IRS.gov/Submit8821`; the 2848 note names `Part II` |
