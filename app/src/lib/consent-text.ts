// D-12 / BANK-05: the one "Use of data" statement per provider kind. Shared by the SPA (what the
// client reads) and the Worker (which version it records). A wording change needs a new version.
export type ConsentKind = 'bank_data' | 'payroll_data'

export interface ConsentText {
  version: string
  title: string
  body: string
  detail: string
  agree: string
}

export const CONSENT_TEXT: Readonly<Record<ConsentKind, ConsentText>> = {
  bank_data: {
    version: '2026-10-10.1',
    title: 'Before we connect your bank',
    body: "We'll pull up to 6 months of transactions and your monthly statements from the account you choose, to prepare your tax paperwork. We never see your bank password.",
    detail:
      '{firm} receives this information in ResSpark and its case system. The bank connection is removed after 30 days; your statements stay in your case.',
    agree: 'I agree',
  },
  payroll_data: {
    version: '2026-10-10.1',
    title: 'Before we connect your payroll',
    body: "We'll pull your pay stubs, W-2s, and employment and income details from your payroll provider, to prepare your tax paperwork. We never see your payroll password.",
    detail: '{firm} receives this information in ResSpark and its case system.',
    agree: 'I agree',
  },
}

export const consentKindForItem = (kind: 'bank_connect' | 'payroll_connect'): ConsentKind =>
  kind === 'bank_connect' ? 'bank_data' : 'payroll_data'
