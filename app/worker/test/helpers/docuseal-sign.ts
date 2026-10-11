// What DocuSeal sends in X-Docuseal-Signature: `${ts}.${hex(HMAC-SHA256(secret, `${ts}.${raw}`))}`.
export async function signDocuseal(raw: string, secret: string, ts = Math.floor(Date.now() / 1000)): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${ts}.${raw}`)))
  return `${ts}.` + [...mac].map((b) => b.toString(16).padStart(2, '0')).join('')
}
