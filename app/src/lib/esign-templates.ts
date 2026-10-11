// D-01: the only forms a client may sign in the portal. 433-A, 433-F, 656 and 9465 never are.
export const ESIGN_TEMPLATE_KEYS = ['engagement_letter', 'form_2848', 'form_8821'] as const
export type EsignTemplateKey = (typeof ESIGN_TEMPLATE_KEYS)[number]

export const isEsignTemplateKey = (v: unknown): v is EsignTemplateKey =>
  typeof v === 'string' && (ESIGN_TEMPLATE_KEYS as readonly string[]).includes(v)

export const ESIGN_TEMPLATE_LABELS: Readonly<Record<EsignTemplateKey, string>> = {
  engagement_letter: 'Engagement letter',
  form_2848: 'Form 2848 (power of attorney)',
  form_8821: 'Form 8821 (tax information authorization)',
}

const IRS_ONLINE =
  "E-signed copies must be submitted online at IRS.gov/Submit2848 or IRS.gov/Submit8821, and you must authenticate the client's identity for a remote signature."

// D-20 staff notes; the engagement letter is not an IRS form.
export const IRS_ONLINE_NOTE: Readonly<Partial<Record<EsignTemplateKey, string>>> = {
  form_2848: `${IRS_ONLINE} The representative signs Part II outside the portal.`,
  form_8821: IRS_ONLINE,
}
