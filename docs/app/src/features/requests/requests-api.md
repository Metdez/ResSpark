# `app/src/features/requests/requests-api.ts`

The SPA side of the request routes from Plan 02-04 and the case read from Plan 02-03: types, runtime guards, thin callers, and the small shared helpers the request and lookup screens both use. Every call goes through `api()` from `lib/api.ts`; this file has no `fetch`.

| Part | What it does |
|------|--------------|
| `ItemKind`, `TemplateItem`, `Template` | The template item shape the Worker stores and accepts (`kind`, `label`, `required`, `config`). |
| `CaseInfo` | `GET /api/admin/cases/:id`: `case_id`, `logics_case_id`, names, `email`, `phone_e164` (each may be `null` when Logics has no value). |
| `RequestItem`, `RequestLink`, `RequestDetail` | `GET /api/admin/requests/:id`. `link.url` is `null` once the link is revoked. |
| `SendResult` | `POST .../send` success: `url`, `expires_at`, `version`. |
| `str`, `strOrNull` | Tiny predicates used by the guards. |
| `isCaseInfo`, `isItem`, `isLink` | Guards for the nested parts. |
| `isRequestDetail` | Requires string `id`, `status`, `template_name`, a valid `case`, an `items` array of valid items, and `link` either `null` or valid. |
| `isTemplateItem`, `isTemplates` | `{ templates: [{ id, name, items: TemplateItem[] }] }`. |
| `isSendResult` | String `url` and `expires_at`, number `version`. |
| `isCreated` | `{ request_id }` from `POST /api/admin/requests`. |
| `json(body)` | `POST` init with a JSON body. |
| `getRequest`, `getTemplates`, `getCase`, `createRequest`, `sendRequest`, `markCopied` | One-line callers, each `api(path, init, guard)`. `markCopied` posts `/copied` so the Worker logs `request.link_copied` (D-09). |
| `SendErrorExtras`, `sendErrorExtras(err)` | Reads the extra fields of a 400/409 send refusal from `ApiError.body`: `email_error`, `phone_error`, `email_suggestion` (strings), `differs` (only `email`/`phone` survive), `changed` (strings). Returns `{}` when there is no body. |
| `LOGICS_COPY`, `logicsErrorCopy(code)` | The two-part copy for `logics_not_configured`, `logics_unreachable`, and `logics_unauthorized` (UI-SPEC error convention: what happened, then what to do). One source for the lookup and send screens. |
| `unlessHandled(qc, handled)` | Builds a mutation `onError`. Errors the screen renders itself (inline or in an `Alert`) stop there. Everything else is passed to the app-wide default handler from `main.tsx`, so 401 still signs out, 403 still toasts, and unknown codes still get the generic toast. Needed because a mutation's own `onError` replaces the default one. |
| `DATE`, `formatDate(iso)` | `Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })` in the viewer's time zone (`Oct 24, 2026`). Callers put the raw timestamp in `title`. |

## Tests

`requests-api.test.ts` (`web` project): `isRequestDetail` accepts the documented shape with and without a link, and rejects a missing `items` or a numeric `status`. `isSendResult` rejects a string `version` or a missing `url`. `isTemplates` rejects a template without `items`. `sendErrorExtras` reads the 409 extras, returns `{}` without a body, and drops `differs` entries outside `email|phone` and non-string `changed` entries.
