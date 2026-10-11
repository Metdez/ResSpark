# `app/src/features/settings/integrations/esign-templates-card.tsx`

`EsignTemplatesCard()`: the `E-sign templates` card on Settings → Integrations (Plan 06-05; D-01, D-10, D-11). An admin picks the DocuSeal template for each allowed form. The integrations route mounts it as a child of `LogicsSettingsPage`, below the Logics cards.

| Part | What it does |
|------|--------------|
| `NONE` | Select value for `Not set`; Radix Select refuses an empty string. |
| `INLINE` | Error codes worded inside the card: `forbidden` → `Only an admin can change these.`; `template_not_single_signer` → `That template has more than one signer. Use a template with one signer role.`; `template_not_found` → `DocuSeal couldn't find that template. Reload the page and pick again.` |
| `settings` query | `getEsignSettings` under `ESIGN_SETTINGS_KEY`, with `meta: { errorShown: true }` (the card shows its own error line). |
| `templates` query | `listEsignTemplates`, enabled only when `configured`, so an unconfigured firm makes no DocuSeal call. |
| `draft` | Only the keys the admin changed; `value(k)` is the draft value when present, else the saved one. |
| `patch` | Keys whose current value differs from the saved mapping. `Save templates` is disabled while it is empty. |
| `save` mutation | `saveEsignMapping(patch)`. On success the returned mapping replaces the cached one, the draft clears, and `toast.success('E-sign templates saved')`. Codes in `INLINE` are shown under the selects (`role="alert"`); any other error goes to the app-wide handler (generic staff toast with the muted code). Changing a select clears the last error. |
| `options(k)` | The DocuSeal templates, plus `Template {id}` for a saved id DocuSeal no longer lists, so the saved value still shows. |

## States

| State | Body |
|-------|------|
| Settings loading | Three `Skeleton` bars. |
| Settings error | `Couldn't load the e-sign settings.` |
| Not configured | Muted `E-sign not set up. Add the DocuSeal API key, then reload this page.` and nothing else. |
| Templates loading | Three `Skeleton` bars. |
| Templates error | `Couldn't load the DocuSeal templates.` |
| Ready | Three rows, each a `Label` from `ESIGN_TEMPLATE_LABELS` and a full-width `Select` (`Not set` plus each template by name, value = id), then the inline error, then the right-aligned `Save templates` button (`Saving…` with a spinner while pending). |

The title carries an outline `Test mode` badge when DocuSeal is configured and `env` is `test` (D-10). The description reads `Choose the DocuSeal template for each form. Build templates in the DocuSeal console with one signer.`

Only the three keys in `ESIGN_TEMPLATE_KEYS` can appear, so Form 433-A is never offered (D-01). The Worker's admin check is the gate: the card hides nothing from staff, and a staff save shows the 403 line.

## Tests

`esign-templates-card.test.tsx` (see `esign-templates-card.test.md`).
