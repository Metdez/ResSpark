// Staff-account checks for smoke.mjs: the public /api/auth/* endpoints and the admin Team API answer
// with the right codes without creating anything (the sign-up probe is refused before any write).
export function accountChecks({ base, expectJson, isObject }) {
  const code = (expected) => (b) => isObject(b.error) && b.error.code === expected
  return [
    {
      name: 'team 401 without token',
      run: async () => expectJson(await fetch(`${base}/api/admin/team`), 401, code('unauthorized')),
    },
    {
      name: 'unknown invite 404',
      run: async () =>
        expectJson(await fetch(`${base}/api/auth/invite?token=${'x'.repeat(43)}`), 404, code('invite_invalid')),
    },
    {
      name: 'sign-up refuses a weak password',
      run: async () => {
        const body = JSON.stringify({ email: 'smoke@resspark.test', password: 'short', name: 'Smoke', firm_name: 'Smoke' })
        const headers = { 'content-type': 'application/json' }
        await expectJson(await fetch(`${base}/api/auth/sign-up`, { method: 'POST', headers, body }), 400, code('weak_password'))
      },
    },
  ]
}
