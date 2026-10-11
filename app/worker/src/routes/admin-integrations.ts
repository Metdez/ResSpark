import { Hono } from 'hono'
import { staffAuth, type StaffCtx } from '../middleware/staff-auth'

// RED stub
export const adminIntegrationsRoute = new Hono<{ Bindings: Env; Variables: { staff: StaffCtx } }>().use('*', staffAuth)
