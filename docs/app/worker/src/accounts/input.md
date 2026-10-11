# `app/worker/src/accounts/input.ts`

Field rules shared by sign-up, invite and accept-invite, plus invite-token minting and hashing. Each `parse*` function returns `null` for an unusable value. Routes turn `null` into a fixed 400 code.

| Export | What it does |
|---|---|
| `PASSWORD_MIN` = 10 | Minimum password length, mirrored in the SPA's `passwordSchema`. |
| `PASSWORD_MAX` = 72 | Maximum password size in UTF-8 bytes. Supabase Auth hashes with bcrypt, which ignores bytes after the 72nd, so longer passwords would give a false sense of strength. |
| `parseEmail(v)` | Trims, lowercases, caps at 254 characters, and requires one `@` and a dot in the domain. |
| `parseName(v, max = 100)` | Trims and collapses runs of whitespace. Requires 1 to `max` characters. Sign-up passes 120 for the firm name. |
| `parsePassword(v)` | Requires at least 10 characters and at most 72 bytes. The string is not changed. |
| `parseRole(v)` | Only `staff` or `admin`. |
| `INVITE_TOKEN_SHAPE` | 43 base64url characters, the length of 32 bytes encoded without padding. Malformed tokens are rejected before any database lookup. |
| `newInviteToken()` | 32 bytes from `crypto.getRandomValues`, base64url-encoded. This raw value goes only into the join link. |
| `hashInviteToken(token)` | SHA-256 of the token as lowercase hex. This is the value stored in `staff_invites.token_hash`. |

Tests: `input.test.ts` (see `input.test.md`).
