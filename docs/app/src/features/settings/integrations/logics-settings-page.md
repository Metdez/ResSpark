# `app/src/features/settings/integrations/logics-settings-page.tsx`

`LogicsSettingsPage()`: the `/admin/settings/integrations` page with the `IRS Logics` card (LOOK-05, D-01, D-03). A firm admin pastes the Logics API key and secret token, saves them, and tests the connection; afterwards only the key hint is ever shown.

| Part | What it does |
|------|--------------|
| `KEY` | The query key `['integrations', 'logics']`. |
| `testCopy(result)` | Success: `Connected — Logics accepted the credentials on {Oct 10, 2026}.` Status 401/403: `Logics rejected the credentials` / `Check the API key and secret token and save again.` Anything else (no status, or another HTTP status): `Couldn't reach Logics` / `Check the base URL and try again.` |
| `StatusLines` | `Key ending in ••••{hint} · Updated {date}` when configured, else `No credentials saved`; then the muted `Last test: passed {date}`, `failed {date}`, or `never`. |
| `isAdmin` | `useSession().data?.role === 'admin'`. The Worker's `requireAdmin` is the real gate; this only shapes the UI. |
| Status query | `useQuery(KEY, getLogicsStatus)` with `meta: { errorShown: true }`, so the app-wide handler adds no toast (a 401 still signs out). Pending: three `Skeleton` bars. Error: a destructive `Alert` with the generic staff copy. |
| Form state | `apiKey`, `secret`, `baseUrl`, never prefilled from the server. |
| `test` mutation | `testLogicsConnection()`. On success it writes `last_test_at`/`last_test_ok` into the cached status. Errors (403, `no_credentials`, 5xx) go to the app's default handler, which shows `You don't have access to this.` for a 403. The `(_: void)` parameter pins the variables to `void` so `mutate()` takes no argument. |
| `save` mutation | `saveLogicsCredentials(...)`. On success the PUT answer (the Worker's last write) replaces the cached status, all three inputs clear, the old test result is reset, and `toast.success('Credentials saved')`. `invalid_base_url` is rendered under the base URL field (`unlessHandled`); anything else reaches the app handler. Two admins saving at once: whichever write the Worker made last is what the status shows after the next fetch. |
| Fixture notice | When `mode === 'fake'`: an `Alert` with `FlaskConical`, `Using built-in test cases`, and the sentence that saved credentials are tested but not used for lookups until the mode is live. |
| Test result | One inline `Alert` (default variant on success, destructive on failure); never also a toast. |
| Form | `API key` and `Secret token` as `PasswordInput` (show/hide toggle, `autoComplete="off"`); `Base URL (optional)` as a URL `Input` whose helper `Leave blank for the ValorTax default.` turns into the error `Enter an https:// address.` (with `aria-invalid`) after a refused save; typing again clears the error. |
| Buttons (admin) | Right-aligned on wide screens, stacked below 640 px, 16 px apart: `Test connection` (outline, `Testing…`, disabled until configured) and `Save credentials` (primary submit, `Saving…`, disabled until both secrets are non-blank). |
| Staff view | Inputs disabled, no buttons, and the muted line `Only a firm admin can change these credentials.` |
| Layout | Settings `ContentSection` titled `Integrations` around a `Card` with title `IRS Logics` and description `Used to find cases by case ID, phone, or email.` |

## Notes

- A saved custom base URL is not displayed back (the input is never prefilled). Re-saving with the field blank resets it to the ValorTax default.

## Tests

`logics-settings-page.test.tsx` (`web` project; `useSession` mocked with a switchable role; `fetch` stubbed through `test-utils/query-render`), 12 cases:

- empty status: `IRS Logics`, `No credentials saved`, the fixture notice, password-type secret inputs with `Show password`, the base URL helper, disabled `Save credentials` and `Test connection`;
- live mode hides the notice;
- `Save credentials` enables only once both secrets are typed;
- `Saving…` while the PUT is pending;
- a save PUTs `{ api_key, secret_token }` (no `base_url`), then shows `Key ending in ••••1234` and `Updated Oct 10, 2026`, clears both inputs, enables `Test connection`, and the typed secret is nowhere in the DOM;
- a typed base URL is sent, and `invalid_base_url` shows `Enter an https:// address.` with `aria-invalid`;
- `Test connection` posts `/test` and shows the success sentence; `Testing…` while pending; 401 shows the rejected copy; `null` shows the unreachable copy;
- the status's last test renders `Last test: failed Oct 9, 2026`;
- as staff: the hint shows, inputs are disabled, no buttons, and the admin-only line renders.
