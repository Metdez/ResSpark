# `app/src/features/timeline/actor-badge.tsx`

`ActorBadge({ actorType })`: the small pill at the start of each timeline row that says who acted (Plan 03-05; D-10, STAT-04).

| Part | What it does |
|------|--------------|
| `ACTOR_TONES` | Maps each actor type to a shared `Tone` from `app/src/lib/status.ts`: `staff` → `info` (blue), `client` → `success` (green), `system` → `neutral` (grey), `provider` → `warning` (amber). The file has no colour classes of its own; the palette comes from `TONE_CLASSES` through `StatusBadge`. |
| `ACTOR_LABELS` | The text in the pill: `Staff`, `Client`, `System`, `Provider`. The text is always shown, so colour is never the only signal (accessibility). |
| `ActorBadge` | Renders `<StatusBadge tone label />` (Phase 2's badge component). It never shows the actor's id; staff display names are not resolved yet, so every staff action reads `Staff` (T-03-22). |
