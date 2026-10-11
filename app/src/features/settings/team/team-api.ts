import { api, isObject, isOk } from '@/lib/api'

// GET/POST/DELETE /api/admin/team (worker/src/routes/admin-team.ts).

export type Role = 'staff' | 'admin'

export interface TeamMember {
  user_id: string
  display_name: string
  role: Role
  email: string | null
  last_sign_in_at: string | null
  created_at: string
}

export interface TeamInvite {
  id: string
  email: string
  role: Role
  created_at: string
  expires_at: string
}

export interface Team {
  members: TeamMember[]
  invites: TeamInvite[]
  can_manage: boolean
  you: string
}

export interface CreatedInvite {
  id: string
  email: string
  role: Role
  expires_at: string
  url: string
  email_status: 'sent' | 'not_configured' | 'send_failed'
}

const isRole = (v: unknown): v is Role => v === 'staff' || v === 'admin'
const isStrOrNull = (v: unknown) => v === null || typeof v === 'string'

const isMember = (v: unknown): v is TeamMember =>
  isObject(v) &&
  typeof v.user_id === 'string' &&
  typeof v.display_name === 'string' &&
  isRole(v.role) &&
  isStrOrNull(v.email) &&
  isStrOrNull(v.last_sign_in_at)

const isInvite = (v: unknown): v is TeamInvite =>
  isObject(v) && typeof v.id === 'string' && typeof v.email === 'string' && isRole(v.role) && typeof v.expires_at === 'string'

export const isTeam = (v: unknown): v is Team =>
  isObject(v) &&
  Array.isArray(v.members) &&
  v.members.every(isMember) &&
  Array.isArray(v.invites) &&
  v.invites.every(isInvite) &&
  typeof v.can_manage === 'boolean' &&
  typeof v.you === 'string'

const isCreatedInvite = (v: unknown): v is CreatedInvite =>
  isInvite(v) &&
  isObject(v) &&
  typeof v.url === 'string' &&
  (v.email_status === 'sent' || v.email_status === 'not_configured' || v.email_status === 'send_failed')

const isUrl = (v: unknown): v is { url: string } => isObject(v) && typeof v.url === 'string'

export const TEAM_KEY = ['team'] as const

export const getTeam = () => api('/api/admin/team', {}, isTeam)

export const inviteMember = (input: { email: string; role: Role }) =>
  api('/api/admin/team/invites', { method: 'POST', body: JSON.stringify(input) }, isCreatedInvite)

export const revokeInvite = (id: string) => api(`/api/admin/team/invites/${id}`, { method: 'DELETE' }, isOk)

export const memberResetLink = (userId: string) =>
  api(`/api/admin/team/members/${userId}/reset-link`, { method: 'POST' }, isUrl)
