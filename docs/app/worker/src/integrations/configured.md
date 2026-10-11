# `app/worker/src/integrations/configured.ts`

`providerConfigured(env, id)` answers "are this provider's secrets present?" (D-15):

| Provider | Configured when |
|----------|-----------------|
| `truv` | `TRUV_CLIENT_ID` and `TRUV_SECRET` are non-empty (`truvConfigured`) |
| `plaid` | `PLAID_CLIENT_ID` and `PLAID_SECRET` are non-empty |
| `teller` | never (no adapter yet) |

The client routes return `configured` in the item view and 503 `provider_not_configured` on start when this is false, so a deploy without vendor keys shows "Provider not configured" instead of crashing. The secrets stay optional (`provider-env.d.ts`) and are never in `secrets.required`.
