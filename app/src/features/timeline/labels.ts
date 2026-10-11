type Payload = Record<string, unknown>

const text = (v: unknown) => (typeof v === 'string' ? v : '')
const words = (action: string) => action.replace(/[._]/g, ' ')

// D-10: one plain sentence per event action. Payload values are read as strings only.
export const ACTION_LABELS: Record<string, (payload: Payload) => string> = {
  'staff.signed_in': () => 'Signed in',
  'staff.signed_out': () => 'Signed out',
  'case.looked_up': () => 'Looked up the case',
  'request.created': () => 'Created the request',
  'request.sent': () => 'Sent the link',
  'request.link_copied': () => 'Copied the link',
  'request.email_sent': () => 'Emailed the link',
  'request.link_regenerated': () => 'Made a new link',
  'request.revoked': () => 'Revoked the link',
  'consent.sms': () => 'Recorded text-message consent',
  'request.opened': () => 'Client opened the link',
  'document.uploaded': (p) =>
    text(p.mime_type).startsWith('image/') ? 'Client uploaded a photo' : 'Client uploaded a PDF',
  'document.viewed': (p) => (p.disposition === 'attachment' ? 'Downloaded a file' : 'Previewed a file'),
  'item.approved': (p) => `Approved ${text(p.label) || 'an item'}`,
  'item.rejected': (p) => {
    const note = text(p.note)
    return `Rejected ${text(p.label) || 'an item'}${note ? ` — ${note}` : ''}`
  },
  'integration.logics.tested': () => 'Tested the Logics connection',
  'address.confirmed': (p) =>
    p.verified === true ? 'Client confirmed their address' : 'Client entered their address (unverified)',
  // SIGN-04: e-sign steps. Bank and payroll connection events keep their plain-word labels.
  'consent.esign': () => 'Client agreed to sign electronically',
  'esign.viewed': () => 'Client opened the form to sign',
  'esign.started': () => 'Client started signing',
  'connection.started': (p) => (p.provider === 'docuseal' ? 'Form sent for signing' : words('connection.started')),
  'connection.done': (p) => (p.kind === 'signature' ? 'Form signed' : words('connection.done')),
  'connection.error': (p) =>
    p.kind === 'signature' && p.code === 'declined' ? 'Client declined to sign' : words('connection.error'),
}

// Unknown actions (provider webhooks of Phase 4 and later) still read as words.
export function actionLabel(action: string, payload: Payload): string {
  const label = ACTION_LABELS[action]
  return label ? label(payload) : words(action)
}
