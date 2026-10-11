# `app/worker/src/db/accounts.ts`

Database access for firms, invites and the team list, using the service-role client. Postgres error text never leaves these functions; callers see fixed codes only (`fail(code)` throws `new Error(code)`).

| Export | What it does |
|---|---|
| `OpenInvite`, `InviteListRow`, `ProfileRow` | Row shapes returned below. |
| `createFirmWithAdmin(env, userId, firmName, displayName)` | RPC `firm_create_with_admin`. Returns the new firm id, or throws `firm_create_failed`. |
| `createInvite(env, { firmId, email, role, tokenHash, invitedBy, ttlDays })` | RPC `staff_invite_create`. Returns `{ id, expires_at }`, or throws `invite_create_failed`. |
| `findOpenInvite(env, tokenHash)` | Selects the invite by hash where it is not accepted, not revoked and not expired, with the firm name through the `firms` foreign key. Returns `null` when none matches. |
| `acceptInvite(env, tokenHash, userId, displayName)` | RPC `staff_invite_accept`. The SQL `invite_invalid` exception becomes `Error('invite_invalid')`; any other error becomes `invite_accept_failed`. |
| `listOpenInvites(env, firmId)` | Open, unexpired invites of the firm, newest first. |
| `revokeInvite(env, firmId, inviteId)` | Sets `revoked_at` only on an open invite of that firm. Returns `false` when nothing matched (unknown id, another firm, already used or revoked). |
| `listFirmProfiles(env, firmId)` | `staff_profiles` of the firm, oldest first. |
| `getFirmName(env, firmId)` | Firm name for the invite email. |

Covered live by `app/worker/test/accounts-live.test.ts`.
