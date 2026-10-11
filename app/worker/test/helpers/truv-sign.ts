// What Truv sends in x-webhook-sign: "v1=" + hex(HMAC-SHA256(Access Secret, raw body)).
export async function signTruv(secret: string, raw: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(raw)))
  return 'v1=' + [...mac].map((b) => b.toString(16).padStart(2, '0')).join('')
}
