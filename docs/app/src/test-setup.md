# `app/src/test-setup.ts`

Vitest setup file for the `web` (jsdom) project, wired by `app/vitest.config.ts`.

| Lines | What it does |
|-------|--------------|
| 1 | Why the flag exists: component tests render with `react-dom/client` and wrap updates in `act`; React only treats `act` as authoritative when this global is `true`. |
| 2-4 | Declares the global on `globalThis` so the assignment type-checks under `strict`. |
| 6 | Sets the flag before any test file runs. |
| 8 | Makes the file a module so `declare global` is legal. |

## Notes

- No testing-library dependency is added (plan decision); tests that need the DOM use `react-dom/client` + `act` directly.
- The `worker-node` project does not load this file.
