# `app/src/features/settings/integrations/esign-templates-card.test.tsx`

Vitest (`web` project) for `EsignTemplatesCard`, with `fetch` stubbed through `test-utils/query-render`.

- Mocks: `@/lib/supabase` (no session) and `sonner` (`toast` spies).
- `settings(configured)`: a test-mode GET body with an empty mapping. `TEMPLATES`: two DocuSeal templates.
- `render(body, put)`: stubs `GET /settings`, `GET /templates`, and the PUT answer (or `'pending'`).
- `pick(index, name)`: opens the select at `index` with `Enter` and clicks the option by its text. `putBody`: the parsed PUT body.

Cases:

- title, `Test mode` badge, the three labels in order, options `Not set` plus both names, `Save templates` disabled;
- choosing the engagement letter template PUTs `{ engagement_letter: 1001 }` and shows a disabled `Saving…` while pending;
- success toasts `E-sign templates saved`;
- 403 shows `Only an admin can change these.`;
- 422 `template_not_single_signer` shows the one-signer sentence;
- unconfigured: `E-sign not set up`, no select, no badge, no templates request.
