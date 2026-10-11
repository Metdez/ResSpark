import { portalFetch } from '../portal-api'

// Contracts of app/worker/src/routes/c-intake.ts (Plan 07-08), mirrored, not imported.
export type AnswerValue = boolean | number | string
export type PrefillSource = 'truv' | 'logics'

export interface IntakeState {
  item: { id: string; status: string }
  answers: Record<string, AnswerValue>
  prefill: Record<string, { value: AnswerValue; source: PrefillSource }>
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isAnswer = (v: unknown): v is AnswerValue =>
  typeof v === 'boolean' || typeof v === 'number' || typeof v === 'string'
const isPrefill = (v: unknown) =>
  isObject(v) && isAnswer(v.value) && (v.source === 'truv' || v.source === 'logics')

export const isIntakeState = (v: unknown): v is IntakeState =>
  isObject(v) &&
  isObject(v.item) &&
  typeof v.item.id === 'string' &&
  typeof v.item.status === 'string' &&
  isObject(v.answers) &&
  Object.values(v.answers).every(isAnswer) &&
  isObject(v.prefill) &&
  Object.values(v.prefill).every(isPrefill)

const isSaved = (v: unknown): v is { saved: true } => isObject(v) && v.saved === true

export const isDone = (v: unknown): v is { item_status: string; request_status: string } =>
  isObject(v) && typeof v.item_status === 'string' && typeof v.request_status === 'string'

export const getIntake = () => portalFetch('/api/c/intake', {}, isIntakeState)

export const saveAnswer = (questionId: string, value: AnswerValue) =>
  portalFetch('/api/c/intake', { method: 'PUT', body: JSON.stringify({ question_id: questionId, value }) }, isSaved)

export const finishIntake = () => portalFetch('/api/c/intake/done', { method: 'POST' }, isDone)
