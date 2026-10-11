export const CONNECT_COPY = {
  payroll: {
    connect: 'Connect payroll',
    another: 'Add another employer',
    upload: 'Upload pay stubs instead',
    intro:
      'Connect your payroll account so your pay stubs and W-2 come through on their own. If you have more than one job, you can add each one.',
    finishing: 'Finishing up…',
    connected: "Payroll connected. We're getting your pay stubs now.",
    done: 'Done. Your agent has what they need.',
    notConfigured: "Your agent's payroll connection isn't set up yet. Upload your pay stubs instead.",
    bridgeFailed: "The payroll window couldn't open. Try again, or upload your pay stubs instead.",
  },
  bank: {
    connect: 'Connect bank',
    upload: 'Upload statements instead',
    intro: "Connect the bank you use most. We'll gather up to 6 months of transactions and statements.",
    introNoStatements:
      "Connect the bank you use most. We'll gather up to 6 months of transactions; you'll add the statements yourself below.",
    notAvailable: "Connecting this bank isn't available yet. Upload your statements instead.",
    notConfigured: "Your agent's bank connection isn't set up yet. Upload your statements instead.",
    checking: 'Checking your connection…',
    syncing: 'Bank connected. Your bank is sending the history — this can take a few minutes.',
    done: 'Done. Your agent has what they need.',
    uploadMonth: (label: string, mask: string | null) =>
      `Upload your ${label} statement${mask ? ` for ••${mask}` : ''}`,
    received: 'Received',
    pendingCell: 'Checking…',
    notSupported: 'Not from this bank',
  },
  return: {
    title: 'Checking your connection…',
    body: 'Give us a moment while your bank finishes up.',
    slow: 'This is taking longer than usual.',
    slowBody: "You can go back to your steps — we'll keep checking in the background.",
    back: 'Back to your steps',
    connected: 'Bank connected',
  },
} as const

export function connectErrorCopy(code: string, kind: 'bank' | 'payroll'): string {
  switch (code) {
    case 'provider_not_configured':
      return CONNECT_COPY[kind].notConfigured
    case 'provider_error':
    case 'provider_unavailable':
      return "We couldn't reach the connection service. Try again in a minute."
    case 'order_expired':
      return 'This request expired. Ask your agent to send a new link.'
    case 'ITEM_LOGIN_REQUIRED':
      return 'Your bank asked you to sign in again. Connect your bank again.'
    case 'link_expired':
      return 'That connection timed out. Try again.'
    case 'consent_text_stale':
      return 'Please read and agree again.'
    default:
      return 'Something went wrong. Try again.'
  }
}
