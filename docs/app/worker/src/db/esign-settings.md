# `app/worker/src/db/esign-settings.ts`

Reads and writes the firm's DocuSeal template mapping (D-11).

- `EsignMapping`: `Record<EsignTemplateKey, number | null>`, one entry per key in `ESIGN_TEMPLATE_KEYS`.
- `getEsignMapping(env, firmId)`: selects `firms.settings` with the service-role client and returns `mappingOf(settings)`.
- `mappingOf(settings)` (private): takes `settings.esign_templates` and maps every template key to its value when that value is a positive integer, otherwise `null`. A missing firm, missing object, or junk value all read as `null`, which the start route turns into 503 `template_not_mapped`. A query error throws `firm_lookup_failed`.

- `setEsignMapping(env, firmId, patch, actorId)` (Plan 06-05): reads `firms.settings` (`.single()`, so a missing firm throws `firm_lookup_failed`), keeps only the patch keys that are in `ESIGN_TEMPLATE_KEYS` (in that order), overlays them on the current mapping (an `undefined` value becomes `null`), writes `settings` back with every other key untouched (`firm_write_failed` on error), logs `settings.esign_templates_updated` with `actor_type: 'staff'`, the actor id, and the payload `{ keys }` (key names only, never template ids), and returns the merged mapping. The route has already validated the patch.

Template ids come only from this mapping, never from the client (T-06-09).

## Shortcut

`setEsignMapping` is a read-merge-write (marked `shortcut:` in the code): two admins saving at the same moment can drop one change. Upgrade to a single-statement jsonb update RPC when `firms.settings` gains concurrent writers. Phase 5 took the same approach for `firm_integrations.settings`.

## Tests

`app/worker/test/esign-settings-live.test.ts` (live) covers the merge, the kept unrelated key, the event payload, and the round trip through `getEsignMapping`.
