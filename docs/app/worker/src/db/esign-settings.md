# `app/worker/src/db/esign-settings.ts`

Reads the firm's DocuSeal template mapping (D-11).

- `EsignMapping`: `Record<EsignTemplateKey, number | null>`, one entry per key in `ESIGN_TEMPLATE_KEYS`.
- `getEsignMapping(env, firmId)`: selects `firms.settings` with the service-role client, takes `settings.esign_templates`, and maps every template key to its value when that value is a positive integer, otherwise `null`. A missing firm, missing object, or junk value all read as `null`, which the start route turns into 503 `template_not_mapped`. A query error throws `firm_lookup_failed`.

Template ids come only from this mapping, never from the client (T-06-09). Plan 06-05 adds the writer to this file.
