// Demo-safety enforcement point (D-19, PLAT-05): every Logics write must call this first.
export function logicsWriteGuard(
  _env: Pick<Env, 'LOGICS_WRITE_ENABLED' | 'LOGICS_TEST_CASE_IDS'>,
  _caseId: string
): void {}
