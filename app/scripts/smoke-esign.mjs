// Plan 06-08, --esign-flow: the address step, ESIGN consent, signing start, the signing page CSP and the
// copied-signing-link redirect on the deployed Worker, in whichever mode the Smarty and DocuSeal secrets
// allow. Called by smoke.mjs between `admin opened` and `revoke`. Prints ids, codes and mode flags only,
// never a token, link URL, cookie, address text or embed link.
import { consentVersion } from './smoke-connect.mjs'

/** Returns the mode string for the final line; throws an error already printed as FAIL. */
export async function esignFlow({ base, client, staffHeaders, steps, requestId, url }) {
  let step = 'items'
  const ok = (line, next) => {
    console.log(`ok esign-flow ${line}`)
    step = next
  }
  const json = async (res, status) => {
    if (res.status !== status) throw new Error(`status ${res.status}, expected ${status}`)
    return res.json()
  }
  try {
    const address = steps.find((s) => s.kind === 'address')?.id
    const sig = steps.find((s) => s.kind === 'signature')?.id
    if (!address || !sig) throw new Error('state lacks address or signature')
    ok('items', 'address suggest')

    const suggestRes = await client('/address/suggest?q=1600%20Amphitheatre')
    let smarty
    if (suggestRes.status === 503) {
      const body = await suggestRes.json()
      if (body.error?.code !== 'provider_not_configured') throw new Error(`code ${body.error?.code}`)
      smarty = false
    } else {
      const { suggestions } = await json(suggestRes, 200)
      if (!Array.isArray(suggestions) || suggestions.length === 0) throw new Error('no suggestions')
      smarty = suggestions[0]
    }
    ok(`address suggest (smarty: ${smarty ? 'yes' : 'no'})`, 'address save')

    const payload = smarty
      ? { source: 'smarty', ...smarty }
      : { source: 'manual', street: '1 Main St', city: 'Springfield', state: 'IL', zip5: '62701' }
    const saved = await json(await client(`/items/${address}/address`, 'POST', payload), 200)
    if (!smarty && saved.verified !== false) throw new Error('manual address came back verified')
    ok(`address save (verified: ${saved.verified ? 'yes' : 'no'})`, 'admin review')

    const review = await json(await fetch(`${base}/api/admin/requests/${requestId}/review`, { headers: staffHeaders }), 200)
    const a = review.address
    if (!a) throw new Error('review has no address')
    if (smarty && (!/^\d{5}$/.test(a.county_fips ?? '') || a.rdi === null)) throw new Error('smarty address lacks FIPS or RDI')
    if (!smarty && (a.source !== 'manual' || a.county_fips !== null)) throw new Error(`source ${a.source}, county_fips set`)
    const sigs = review.signatures
    if (!Array.isArray(sigs) || sigs.length !== 1 || sigs[0].template_key !== 'engagement_letter') {
      throw new Error(`signatures ${sigs?.length}, template ${sigs?.[0]?.template_key}`)
    }
    ok('admin review address + 1 signature', 'consent')

    const consent = await json(await client('/consents', 'POST', { kind: 'esign', text_version: consentVersion('esign') }), 200)
    if (consent.consented !== true) throw new Error('esign not consented')
    ok('consent esign', 'signature start')

    const startRes = await client(`/items/${sig}/signature/start`, 'POST')
    let docuseal
    if (startRes.status === 503) {
      const code = (await startRes.json()).error?.code
      if (code !== 'provider_not_configured' && code !== 'template_not_mapped') throw new Error(`code ${code}`)
      docuseal = false
      ok(`signature start 503 ${code}`, 'sign csp')
    } else {
      const body = await json(startRes, 200)
      if (typeof body.embed_src !== 'string' || !body.embed_src.startsWith('https://docuseal.com/s/')) throw new Error('no embed_src')
      docuseal = true
      ok(`signature start 200 connection ${body.connection_id}`, 'sign csp')
    }

    const page = await fetch(`${base}/c/sign/${sig}`)
    if (page.status !== 200) throw new Error(`status ${page.status}`)
    if (!(page.headers.get('content-type') ?? '').includes('text/html')) throw new Error('not html')
    const csp = page.headers.get('content-security-policy') ?? ''
    const fontSrc = csp.split(';').find((d) => d.trim().startsWith('font-src')) ?? ''
    if (!csp.includes('https://cdn.docuseal.com') || !csp.includes('https://docuseal.com') || !fontSrc.includes('https://docuseal.com')) {
      throw new Error('csp lacks the DocuSeal hosts')
    }
    ok('sign csp', 'step link')

    // Last: a second exchange of the same link; the flow's own cookie stays valid for revoke.
    const deep = await fetch(`${url}?step=${sig}`, { redirect: 'manual' })
    if (deep.status !== 302) throw new Error(`status ${deep.status}`)
    if (deep.headers.get('location') !== `/c/?step=${sig}`) throw new Error('location is not /c/?step=<item>')
    ok('step link 302')

    return `keys: smarty ${smarty ? 'yes' : 'no'}, docuseal ${docuseal ? 'yes' : 'no'}`
  } catch (error) {
    console.log(`FAIL esign-flow ${step}: ${error instanceof Error ? error.message : String(error)}`)
    throw Object.assign(new Error('esign-flow failed'), { reported: true })
  }
}
