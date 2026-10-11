# `app/worker/src/engine/outcome.ts`

The outcome vocabulary the staff view shows next to a determination, copied verbatim from `src/case_api.py` (lines 29-42).

| Export | Source | Meaning |
|--------|--------|---------|
| `NEXT_STEP` | `_NEXT` | "A tax professional must review this result before anything is filed." The view and worksheet always show it (D-15). |
| `PATHS` | `_PATHS` | Maps each of the seven `Determination.path` strings to `{ id, label }`: `blocked`, `cnc`, `manual_equity`, `simple_plan`, `non_simple_installment`, `manual_payment`, `oic` (Offer in Compromise), with the Python short labels. The keys are the recommendation wording and must stay byte-identical to `src/determination.py`. |
| `outcomeFor(path)` | — | `PATHS[path]` or `null` for an unknown path (own keys only, so `"constructor"` is not a path). |
| `ENGINE_VERSION` | — | `'ts-port-2'` (bumped from `'ts-port-1'` when the port gained the Offer in Compromise path and the calculation trace). Stored with every evaluation run so a run names the engine that produced it. Bump it whenever the port's behavior changes. |

## Tests

`parity.test.ts` compares `PATHS` and `NEXT_STEP` with the `paths` and `next` entries the exporter writes from Python into `golden.json`.
