import type { StepKind } from './portal-api'

// Client voice (UI-SPEC): "agent", "link", "bank"; plain words; no exclamation marks.
export const STEP_DESCRIPTIONS: Record<StepKind, string> = {
  bank_connect:
    'Connect the bank you use most, so your statements come through automatically.',
  payroll_connect:
    'Connect your payroll, so your pay stubs and W-2 come through.',
  address: 'Confirm your home address.',
  upload: 'Take a photo or choose a file from your phone.',
  signature: 'Review and sign.',
  intake: 'Answer a few questions about your situation.',
}

export const COMING_NEXT = {
  title: 'Coming next',
  body: "This step isn't ready yet. Your agent will tell you when it is. You can close this page.",
  close: 'Close',
} as const
