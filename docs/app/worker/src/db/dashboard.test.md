# `app/worker/src/db/dashboard.test.ts`

Pure unit tests for the two helpers in `db/dashboard.ts`. They make no database or network calls and run in the `worker-node` Vitest project.

## `sanitizeQuery`

- A 100-character query is cut to 64 characters.
- `O'Neil` and `mary-jo_s@x.com` pass through unchanged, because apostrophes, `@`, dots, dashes and underscores are allowed.
- `  Ann (Smith), ann@x.com ` becomes `Ann Smith ann@x.com`. Brackets and commas are dropped, and spaces are collapsed and trimmed.
- `*,or(id.eq.1)` becomes `orid.eq.1`. With `*`, `,`, `(` and `)` removed, the text can no longer add a PostgREST filter.
- `undefined` and a string of only punctuation both give `''`.

## `clientName`

- First and last name give `Ann Lee`.
- A first name alone gives `Ann`.
- No name gives the email.
- No name and no email give `Unknown client`.
