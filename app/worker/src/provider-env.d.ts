// Vendor keys are optional Worker secrets (D-15): the Worker deploys and serves the
// manual-upload fallback without them, so adapters read them as possibly undefined.
interface Env {
  PLAID_CLIENT_ID?: string
  PLAID_SECRET?: string
  PLAID_ENV?: string
  TRUV_CLIENT_ID?: string
  TRUV_SECRET?: string
}
