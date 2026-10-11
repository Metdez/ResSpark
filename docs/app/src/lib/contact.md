# `app/src/lib/contact.ts`

Shared client-contact validation (REQ-02, D-04, D-07). Both the SPA "send link" form and the Worker send route import it, so the two sides apply exactly the same rules. It imports only `zod`: no DOM, no React, no Supabase, no `@/` alias, because the Worker bundle pulls it in by relative path (`worker/src/integrations/logics/lookup.ts`).

| Lines | What it does |
|-------|--------------|
| 1-2 | The sharing rule, and the Zod 4 import. |
| 4-10 | `normalizePhone`: strips every non-digit, drops a leading `1` when 11 digits remain, and returns `{ e164: '+1' + digits, digits }` only for exactly 10 digits. `(121)121-2121`, `121-121-2121`, `1 121 121 2121`, `+11211212121` all become `+11211212121`. `21211212121`, empty, and whitespace return `null`. |
| 12-15 | `formatPhoneDoc`: `1211212121` → `(121)121-2121`, the format of the Logics doc's `HomePhone` sample. `lookup.ts` uses it for its one retry. |
| 17-25 | `KNOWN_DOMAINS`: the seven consumer domains checked for typos (table below). |
| 27-41 | `withinOneEdit`: true when two strings are at most one insertion, deletion, substitution, or adjacent swap apart. Walks the common prefix once, then compares the remaining tails, so it runs in O(n). The adjacent swap matters because `gmial`/`hotmial` are swaps, and plain Levenshtein counts those as two edits. |
| 43-51 | `suggestDomain`: lowercases. An exact known domain returns `null`. A known domain with its dot removed (`gmailcom`) returns that domain. Otherwise it returns the first known domain within one edit, or `null` when none is close (`valortax.com`). |
| 53 | `emailSchema`: Zod 4 top-level `z.email()`. |
| 55-58 | `contactSchema`: `{ email, phone }` with the phone refined by `normalizePhone`. Used by route bodies and forms that want a Zod schema. |
| 60-67 | `ContactCheck`: the result shape. `email` is the trimmed, lowercased address, set only when the syntax is valid. |
| 69-94 | `checkContact`: email empty → `Enter the client's email.`; bad syntax → `That doesn't look like an email address.`; otherwise `email` is set. A domain suggestion is computed whenever there is an `@`, even next to a syntax error, so `a@gmailcom` gets `a@gmail.com`. Phone empty → `Enter the client's phone number.`; not 10 digits → `Enter a 10-digit US phone number.`; otherwise `phone_e164`. `ok` is true only with no error and no suggestion. A suggestion blocks, and the staff member must apply it or explicitly keep the value (D-07). The keep decision lives in the SPA/Worker, and it must not be offered while `email_error` is set. |
| 96-98 | `maskPhone`: `+11211212121` → `(•••) •••-2121`. |
| 100-103 | `maskEmail`: `steve1234@hotmail.com` → `s•••@hotmail.com`. |

## Known domains

| Domain | Example typos caught |
|--------|---------------------|
| gmail.com | `gmailcom`, `gmial.com`, `gmail.co`, `gmal.com` |
| yahoo.com | `yaho.com`, `yahoocom`, `yahooo.com` |
| outlook.com | `outlok.com`, `outlookcom` |
| hotmail.com | `hotmial.com`, `hotmal.com` |
| icloud.com | `iclod.com`, `icloudcom` |
| aol.com | `aol.co`, `aolcom` |
| comcast.net | `comcast.ne`, `comcastnet` |

## Copy strings

| Field | Condition | Text |
|-------|-----------|------|
| email | empty | `Enter the client's email.` |
| email | invalid syntax | `That doesn't look like an email address.` |
| phone | empty | `Enter the client's phone number.` |
| phone | not 10 digits after normalization | `Enter a 10-digit US phone number.` |

## Known limits

- No MX or DNS lookup is done (PITFALLS M2). That is accepted debt for Phase 8's deliverability work.
- One edit from a known domain is enough to suggest, so a real domain such as `mail.com` gets the suggestion `gmail.com`. The staff member can keep the value.

## Tests

`contact.test.ts` (co-located, `web` project): seven typo → fix cases, exact and unknown domains returning `null`, every documented phone format normalizing to the same E.164 value, the rejected phone shapes, all four copy strings, the suggestion blocking `ok`, a missing-dot address that gets both the syntax error and the suggestion, trimmed/lowercased output, `contactSchema`, and both masks.
