import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { verifyStaffJwt } from '../auth/staff-jwt'
import { getStaffProfile } from '../db/staff'

export interface StaffCtx {
  userId: string
  firmId: string
  role: 'staff' | 'admin'
  displayName: string
  email?: string
}

// Verify-then-scope (Pattern 2): identity and firm come only from the verified JWT,
// cross-checked against staff_profiles. Body, query and other headers are never consulted.
export const staffAuth = createMiddleware<{ Bindings: Env; Variables: { staff: StaffCtx } }>(
  async (c, next) => {
    const token = c.req.header('authorization')?.replace(/^Bearer\s+/i, '').trim()
    if (!token) throw new HTTPException(401, { message: 'unauthorized' })
    const claims = await verifyStaffJwt(token, c.env.SUPABASE_URL).catch(() => {
      throw new HTTPException(401, { message: 'unauthorized' })
    })
    const profile = await getStaffProfile(c.env, claims.sub)
    if (!profile || profile.firm_id !== claims.app_metadata?.firm_id) {
      throw new HTTPException(403, { message: 'forbidden' })
    }
    c.set('staff', {
      userId: claims.sub,
      firmId: profile.firm_id,
      role: profile.role,
      displayName: profile.display_name,
      email: claims.email,
    })
    await next()
  }
)
