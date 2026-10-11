# `app/worker/src/db/consents.ts`

Reads and writes `public.consents` (migration 0005) with the service-role client. One row per `(link_id, kind, text_version)`.

- `hasConsent(env, linkId, kind, version)`: true when that link agreed to that version of that kind. The route passes the current version from `CONSENT_TEXT`, so an older consent does not count.
- `recordConsent(env, input)`: upsert with `onConflict: 'link_id,kind,text_version', ignoreDuplicates: true` and `select('id')`. A new row returns its id (`created: true`); a duplicate returns no row (`created: false`) and writes nothing. The route logs the `consent.<kind>` event only when `created`, so repeats add neither a row nor an event.
  - `ip_class` is `ipv4 | ipv6 | unknown`; the address itself is never stored.
  - `user_agent_class` is the Phase 2 enum (`phone | tablet | desktop`) or null.

Errors become fixed tokens (`consent_lookup_failed`, `consent_insert_failed`); Postgres text never leaves the module.
