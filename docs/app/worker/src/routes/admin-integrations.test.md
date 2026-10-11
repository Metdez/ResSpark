# `app/worker/src/routes/admin-integrations.test.ts`

Unit tests for the D-08 additions to `admin-integrations.ts`. The route is mounted on a bare Hono app at `/api/admin/integrations` with the Worker's error envelope. Mocked: `staffAuth` (a mutable `staff` object, admin by default), `logEvent`, `getIntegration` / `recordIntegrationTest` / `updateSettings` / `upsertIntegration` (the real `readSettings` is kept), and `liveClientFromRow`, which returns a stub with `findByEmail` and a `listActivities` spy (default `['General', 'Document sent']`). `updateSettings` echoes the patch over the defaults.

- GET with `settings: {}` → `settings` defaults and `activity_types: []`.
- PUT settings as `staff` → 403, nothing written.
- PUT `{ file_category_id: 7, activity_type: 'Document sent', write_enabled: true }` → 200 with those settings, `updateSettings` with exactly that patch, event `integration.logics.settings_updated` with `{ changed: [keys] }`.
- PUT bodies `{ file_category_id: 'x' }`, `{ file_category_id: 0 }`, `{ activity_type: '' }`, a 61-character type, an unknown key, and `{}` → 400 `bad_request`.
- PUT `{ file_category_id: null }` → `updateSettings` with `{ file_category_id: null }`.
- POST test with allowlist `900001` → `listActivities(900001)`, `updateSettings` with `activity_types_seen: ['Document sent', 'General']`, test recorded ok.
- POST test with an empty allowlist → no listing.
- A listing that returns `{ kind: 'failed', status: 403 }` → `ok: true`, `activity_types_error: 403`, settings untouched.
