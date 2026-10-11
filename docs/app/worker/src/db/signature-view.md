# `app/worker/src/db/signature-view.ts`

Per-item e-sign read model for the staff review screen (Plan 06-07, D-20). The review route
(`routes/admin-review.ts`) puts its result on the review response as `signatures`.

## Exports

- `EsignStage`: `'not_started' | 'waiting' | 'viewed' | 'signing' | 'signed' | 'declined' | 'expired' | 'error'`.
- `SignatureView`: `{ item_id, template_key, configured, connection }`. `connection` is `null` when the
  item has no DocuSeal connection yet; otherwise `{ id, status, stage, env, error_code, completed_at }`.
- `esignStage(status, lastAction, errorCode)`: the stage truth table below.
- `listRequestSignatures(env, firmId, requestId)`: one view per `signature` item of the request, in item
  position order.

## Stage truth table (`esignStage`)

| connection status | last esign event | error code | stage |
|---|---|---|---|
| none (`null`) | any | any | `not_started` |
| `done` | any | any | `signed` |
| `error` | any | `declined` | `declined` |
| `error` | any | `expired` | `expired` |
| `error` | any | anything else | `error` |
| open (`pending`, `connected`, `syncing`, ...) | `esign.started` | n/a | `signing` |
| open | `esign.viewed` | n/a | `viewed` |
| open | none | n/a | `waiting` |

The status always wins: a signed or failed submission ignores older view/start events. View and start
are only logged as events (D-18), never written as statuses, which is why they refine an open connection.

## How `listRequestSignatures` reads

1. `request_items` with `request_id = requestId` and `kind = 'signature'`, selecting `id, config`. The
   template key comes from `config.template` (the same key `routes/c-signature.ts` reads) and is kept only
   when `isEsignTemplateKey` accepts it; otherwise `template_key` is `null`. The caller has already scoped
   the request to the staff firm through `getFirmRequest`.
2. `connections` for the request with `firm_id = firmId` and `provider = 'docuseal'`, ordered
   `created_at DESC, id DESC`. The first row per `request_item_id` is the latest connection.
3. If any connection exists: `events` with `firm_id`, `request_id`, `action in ('esign.viewed','esign.started')`
   and `payload->>connection_id in (<latest connection ids>)`, ordered `created_at DESC, id DESC`. The
   first row per connection id is its last esign action. `connection_record_event` (migration 0005)
   merges `connection_id` into every event payload, so the PostgREST JSON-path filter
   (`.in('payload->>connection_id', ids)`) matches exactly the events of that submission. An older,
   replaced submission's events never leak into the new one's stage.
4. `configured` is `docusealConfigured(env) && mapping[template_key] != null`. `getEsignMapping` is read
   once per call, and only when DocuSeal is configured.

`env` is `'production'` only when the connection's `data.env` is `'production'`; anything else reads as
`'test'`, so a missing value never hides the `Test` badge. `error_code` is `connections.error.code`.

## Never selected (D-12, D-17, T-06-27)

The selects name their columns and use JSON paths (`env:data->>env`, `error_code:error->>code`), so the
rest of `data` never leaves the database. These are never read into the view:

- `connections.link_ref` (the DocuSeal signing slug),
- `connections.external_id` (the DocuSeal submission id),
- any `embed_src` or `/s/{slug}` URL (never stored at all).

## Errors

Supabase errors throw `item_list_failed`, `connection_list_failed` or `event_list_failed`. The review
route lets them reach the global error handler like its other reads.
