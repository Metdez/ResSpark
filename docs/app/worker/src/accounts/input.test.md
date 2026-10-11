# `app/worker/src/accounts/input.test.ts`

Unit tests for `input.ts`.

- Emails are trimmed and lowercased. Junk values (empty, no `@`, no dot in the domain, spaces, non-strings) and addresses over 254 characters are refused.
- Names are trimmed with whitespace collapsed. Blank names and names over the cap are refused.
- Passwords need at least 10 characters. A 37-character password of two-byte characters (74 bytes) is refused for exceeding 72 bytes.
- Only `staff` and `admin` are accepted as roles.
- Minted tokens match `INVITE_TOKEN_SHAPE`, two mints differ, and the hash is 64 lowercase hex characters.
