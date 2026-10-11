export const RPC_TOKENS = [
  'no_items',
  'case_not_found',
  'request_not_found',
  'request_not_draft',
  'request_not_active',
  'request_revoked',
  'link_inactive',
] as const

export function rpcErrorToken(_error: { message?: string } | null | undefined): (typeof RPC_TOKENS)[number] | null {
  return null // RED stub
}
