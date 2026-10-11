// Every client-facing string of the intake step (D-13) except the question prompts, which come
// verbatim from app/shared/questions.ts. UI-SPEC client voice: second person, no exclamation marks.
export const INTAKE_COPY = {
  progress: (i: number, n: number) => `Question ${i} of ${n}`,
  yes: 'Yes',
  no: 'No',
  back: 'Back',
  next: 'Next',
  done: 'Done',
  close: 'Close',
  saving: 'Saving…',
  fewer: 'Fewer',
  more: 'More',
  prefill: {
    truv: 'We filled this in from your payroll. Tap to change.',
    logics: 'We filled this in from your case file. Tap to change.',
  },
  loading: 'Loading your questions…',
  loadFailed: "We couldn't load your questions. Close this and try again.",
  badValue: 'Check your answer and try again.',
  incomplete: 'Some questions still need an answer.',
  saveFailed: 'Something went wrong. Try again.',
} as const
