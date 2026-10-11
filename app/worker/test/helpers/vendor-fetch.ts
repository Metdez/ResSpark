import { vi } from 'vitest'

export interface VendorRoute {
  host: string
  path: string | RegExp
  method?: string
  respond: (req: Request) => Response | Promise<Response>
}

// Answers matching vendor URLs; everything else (live Supabase) goes to the real fetch.
// `calls` holds a clone of every matched request, in order.
export function stubVendorFetch(routes: VendorRoute[]): { calls: Request[]; restore(): void } {
  const original = globalThis.fetch
  const calls: Request[] = []
  const router = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const route = routes.find(
      (r) =>
        r.host === url.host &&
        (typeof r.path === 'string' ? r.path === url.pathname : r.path.test(url.pathname)) &&
        (!r.method || r.method.toUpperCase() === method)
    )
    if (!route) return original(input, init)
    const req = new Request(input, init)
    calls.push(req.clone())
    return route.respond(req)
  }
  vi.stubGlobal('fetch', router)
  return { calls, restore: () => vi.unstubAllGlobals() }
}
