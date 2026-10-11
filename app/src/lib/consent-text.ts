// D-12 / BANK-05: the one "Use of data" statement per provider kind. Shared by the SPA (what the
// client reads) and the Worker (which version it records). A wording change needs a new version.
export type ConsentKind = 'bank_data' | 'payroll_data' | 'esign'

export interface ConsentText {
  version: string
  title: string
  body: string
  detail: string
  agree: string
  points?: readonly string[]
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
  // D-16: the 15 U.S.C. 7001(c)(1) disclosures; draft wording for counsel review.
  esign: {
    version: 'esign-v1',
    title: 'Before you sign',
    body: "You're agreeing to sign your forms electronically on this device. Your electronic signature counts the same as signing on paper.",
    points: [
      "You can ask for a paper copy of anything you sign here. Call your agent; there's no fee.",
      'You can take back this agreement at any time by telling your agent. After that, your agent will send you paper forms to sign instead. Anything you already signed stays signed.',
      'This agreement covers the forms your agent sends you through this link.',
      'If your email address or phone number changes, tell your agent so they can still reach you.',
      'You need a phone or computer with an up-to-date web browser that can show PDF files. If you can read this page, your device works.',
    ],
    detail: '{firm} keeps a record that you agreed, with the date and time.',
    agree: 'I agree',
  },
}

export const consentKindForItem = (kind: 'bank_connect' | 'payroll_connect' | 'signature'): ConsentKind =>
  kind === 'bank_connect' ? 'bank_data' : kind === 'payroll_connect' ? 'payroll_data' : 'esign'
