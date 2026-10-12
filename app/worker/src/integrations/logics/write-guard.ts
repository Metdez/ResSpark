// Demo-safety enforcement point (D-19, PLAT-05): every Logics write must call this first.
// Exact-match allowlist after trim; no numeric coercion, no prefix match; an empty allowlist
// blocks every id even when the flag is on, and `*` allows every id (user request, 2026-10-12).
// The error never carries the id or env values.
export function logicsWriteGuard(
  env: Pick<Env, 'LOGICS_WRITE_ENABLED' | 'LOGICS_TEST_CASE_IDS'>,
  caseId: string
): void {
  const allow = env.LOGICS_TEST_CASE_IDS.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (env.LOGICS_WRITE_ENABLED !== 'true' || !(allow.includes('*') || allow.includes(caseId.trim()))) {
    throw new Error('logics_write_blocked')
  }
}
