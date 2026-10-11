import { createMiddleware } from 'hono/factory'

export interface ClientCtx {
  linkId: string
  requestId: string
  firmId: string
  expiresAt: string
  openedAt: string | null
}

// RED stub: replaced in the GREEN commit.
export const clientSession = createMiddleware<{ Bindings: Env; Variables: { client: ClientCtx } }>(
  async (_c, next) => {
    await next()
  }
)
export const requireClientHeader = createMiddleware(async (_c, next) => {
  await next()
})
