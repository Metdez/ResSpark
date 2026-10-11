import { Hono } from 'hono'

// Display-only flags for the SPA (D-19): drives the SANDBOX banner; never a secret.
export const configRoute = new Hono<{ Bindings: Env }>().get('/', (c) =>
  c.json({
    app_env: c.env.APP_ENV,
    logics_write_enabled: c.env.LOGICS_WRITE_ENABLED === 'true',
    logics_mode: c.env.LOGICS_MODE === 'live' ? 'live' : 'fake',
    app_name: 'ResSpark',
  })
)
