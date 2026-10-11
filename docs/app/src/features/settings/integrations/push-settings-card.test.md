# `app/src/features/settings/integrations/push-settings-card.test.tsx`

Vitest (`web` project) for `PushSettingsCard`, rendered through `LogicsSettingsPage` so the GET wiring is covered too.

- Mocks: `@/lib/supabase` (no session), `sonner` (`toast.success`/`toast.error` spies), `@/lib/session` (switchable `role`).
- `status(settings, activity_types)`: a configured fake-mode GET body with the D-08 defaults (`file_category_id: null`, `activity_type: 'General'`, `write_enabled: false`) merged with overrides.
- `render(body, replies)`: stubs the `GET` and a default `PUT .../settings` answer, then waits for `Push settings`.
- `putBody(fetchMock)`: the parsed body of the settings PUT, or `undefined` if none was sent.
- `writeSwitch()`: the Radix switch (`role="switch"`).
- The Radix `Select` is opened with `Enter` on `[data-slot="select-trigger"]`; options are read from `[role="option"]`.

The eight cases are listed in `push-settings-card.md` § Tests.
