// The bare RAISE EXCEPTION tokens of migration 0003's RPCs; the Worker maps them to error codes.
export const RPC_TOKENS = [
  'no_items',
  'case_not_found',
  'request_not_found',
  'request_not_draft',
  'request_not_active',
  'request_revoked',
  'link_inactive',
] as const

export type RpcToken = (typeof RPC_TOKENS)[number]

// supabase-js surfaces a plpgsql RAISE as error.message, possibly behind a SQLSTATE prefix.
export function rpcErrorToken(error: { message?: string } | null | undefined): RpcToken | null {
  const words = (error?.message ?? '').split(/\W+/)
  return RPC_TOKENS.find((t) => words.includes(t)) ?? null
}
