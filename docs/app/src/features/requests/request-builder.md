# `app/src/features/requests/request-builder.tsx`

`RequestBuilder({ caseId, onCreated })`: the "New request" screen (REQ-01, D-06). Staff pick a seeded template, switch its items on or off, rename them, and create the draft request. The only way to add an item is `Add a form to sign` (Plan 06-05), which appends an e-sign form; there is no general editor for adding or reordering items (that is v1.x). The component has no router dependency; the route passes `onCreated`.

| Part | What it does |
|------|--------------|
| `DEFAULT_TEMPLATE` | `Standard resolution packet`, preselected when present (else the first template). |
| `NONE_ON`, `CASE_NOT_FOUND`, `CREATE_COPY` | Copy for "nothing switched on" and for the create route's `no_items` and `case_not_found` refusals. |
| `Row`, `rowsOf(template)` | A template item plus `enabled`; every row starts on. |
| `Title`, `ErrorAlert` | The Display title and a destructive two-part `Alert`. |
| Queries | `getCase(caseId)` and `getTemplates()` in parallel, plus `getEsignSettings()` under `ESIGN_SETTINGS_KEY` (Plan 06-05) with `retry: false` and `meta: { errorShown: true }`, so a failed read shows no toast and only disables `Add a form to sign`. |
| `chosen` state | `null` until staff touch anything, so the default template's rows render without an effect. Choosing a template or editing a row stores `{ templateId, rows }`. Changing the template resets the rows to that template's items, all on. |
| `create` mutation | `createRequest(...)` then `onCreated(request_id)`. `onError` is `unlessHandled(...)`: `no_items` and `case_not_found` render as an `Alert`; any other error goes to the app's default handler (401 sign-out, 403, generic toast). |
| Case error | A 404 shows `Case not found` / `Look the client up again.`; anything else the generic staff copy. |
| Templates error | Generic staff copy. |
| Pending | Title `New request` plus three `Skeleton` rows. |
| Header | `New request for {First Last}` (or `New request`). |
| Template field | `Label` `Template` above the vendored `Select` of template names. |
| Rows | One per item, in template order: a `Checkbox` (`aria-label` `Include {label}`), an `Input` for the label (`aria-label` `Label for item {n}`, `maxLength` 120, `aria-invalid` when blank), and muted `Required`/`Optional`. An enabled row with a blank label shows `Enter a label.` |
| `mappedKeys`, `inRequest(key)` | `ESIGN_TEMPLATE_KEYS` whose mapping value is non-null, and only when DocuSeal is `configured`; empty while the settings read is pending or failed. `inRequest` is true when any row (on or off) is a `signature` with that `config.template`. The list comes only from `ESIGN_TEMPLATE_KEYS`, so Form 433-A or any other form can never appear (D-01, D-11). |
| `Add a form to sign` | An outline `DropdownMenu` button with a `Plus` icon below the rows. Its items are the mapped keys labeled from `ESIGN_TEMPLATE_LABELS`; a key already in the request is disabled. Choosing one appends `{ kind: 'signature', label, required: true, config: { template: key }, enabled: true }` to the current rows. With no mapped keys the button is disabled and the muted line `E-sign not set up. An admin maps templates in Settings → Integrations.` shows under it. |
| `submit()` | Posts `{ case_id, template_id, items }` with only the enabled rows, in template order (appended forms last), labels trimmed; `required` and `config` come from the template unchanged. The Worker numbers positions contiguously. |
| Footer | `Choose at least one item.` when nothing is on; `Create request` right-aligned from 640 px, disabled when nothing is on, a label is blank, or the create is in flight (`Creating…` with a 16 px `Loader2`). |

## Notes

- `required` is taken from the template as-is; no toggle was asked for (plan discretion).
- The plan's aria-label `Label for {kind}` became `Label for item {n}` because "Documents only" has three `upload` items, which would give three inputs the same name.
- A query error also triggers the app-wide query toast from `main.tsx`; see the 02-05 SUMMARY follow-up.

## Tests

`request-builder.test.tsx` (`web` project, `test-utils/query-render.tsx` harness):

- loads `New request for Jordan Rivera`, the select showing `Standard resolution packet`, and five checked rows in template order;
- unchecking payroll and renaming `Government ID` to `Driver's license` posts four items in order with `config` intact, and `onCreated('r9')` fires on the 201;
- unchecking all five disables `Create request` and shows `Choose at least one item.`;
- switching the select (keyboard open, option click) to `Documents only` shows its three items, all checked;
- a blank label shows `Enter a label.` and disables the button;
- `Creating…` while the create is in flight;
- a 404 case read shows `Case not found` / `Look the client up again.` and no button;
- a 404 `case_not_found` from create shows the same title in an alert and does not navigate;
- with `engagement_letter` and `form_2848` mapped, the menu lists `Engagement letter` (disabled, already a row) and `Form 2848 (power of attorney)`, and nothing matching `Form 8821` or `/433/`;
- choosing Form 2848 appends a checked row and `Create request` posts it as `{ kind: 'signature', label: 'Form 2848 (power of attorney)', required: true, config: { template: 'form_2848' } }`;
- unconfigured, or every mapping value `null`: the button is disabled and the not-set-up line shows;
- a 500 from the settings read: the button is disabled, and `Create request` still posts.

The `esign(configured, mapping)` helper builds the stubbed `GET /api/admin/esign/settings` answer; the fixture's engagement letter row carries `config: { template: 'engagement_letter' }`, matching the seed.
