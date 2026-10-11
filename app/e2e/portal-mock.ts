import type { Page, Route } from '@playwright/test'
import { FAKE_FORM_JS } from './fake-docuseal-form'

export const SIG_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
export const EMBED_SRC = 'https://docuseal.com/s/fakeSlug'
const OPENED = '2026-10-11T09:00:00Z'

export interface MockOptions {
  opened?: boolean
  consented?: boolean
  configured?: boolean
}

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
const fail = (route: Route, status: number, code: string) =>
  json(route, status, { error: { code, message: code } })

// In-memory fake of the /api/c/* contracts the signing path uses. Returns the list of calls
// ("METHOD /path") so a test can assert on them; anything unmatched goes on to the dev server.
export async function mockPortal(page: Page, opts: MockOptions = {}): Promise<string[]> {
  const calls: string[] = []
  let openedAt = opts.opened ? OPENED : null
  let consented = opts.consented ?? false
  let signed = false

  await page.route('https://cdn.docuseal.com/js/form.js', (r) =>
    r.fulfill({ contentType: 'application/javascript', body: FAKE_FORM_JS })
  )
  await page.route('**/api/c/**', async (route) => {
    const req = route.request()
    const call = `${req.method()} ${new URL(req.url()).pathname}`
    calls.push(call)
    switch (call) {
      case 'GET /api/c/state':
        return json(route, 200, {
          firm_name: 'ValorTax',
          agent_display_name: 'Andrew',
          status: 'sent',
          opened_at: openedAt,
          expires_at: '2026-10-25T00:00:00Z',
          steps: [
            {
              id: SIG_ID,
              position: 1,
              kind: 'signature',
              label: 'Sign your engagement letter',
              required: true,
              status: signed ? 'submitted' : 'pending',
            },
          ],
        })
      case 'POST /api/c/start':
        openedAt = OPENED
        return json(route, 200, { opened_at: openedAt })
      case 'POST /api/c/heartbeat':
        return json(route, 200, { ok: true })
      case 'POST /api/c/consents':
        consented = true
        return json(route, 200, { ok: true })
      case `POST /api/c/items/${SIG_ID}/signature/start`:
        if (opts.configured === false) return fail(route, 503, 'provider_not_configured')
        if (!consented) return fail(route, 409, 'consent_required')
        return json(route, 200, { connection_id: 'C1', embed_src: EMBED_SRC })
      case 'POST /api/c/connections/C1/reconcile':
        signed = true
        return json(route, 202, { ok: true })
      default:
        return route.continue()
    }
  })
  return calls
}
