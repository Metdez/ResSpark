import { toast } from 'sonner'

export const GENERIC_ERROR =
  'Something went wrong. Try again, and tell your admin if it keeps happening.'

// shortcut: no API error envelope yet, Plan 03 maps `{ error: { code, message } }` to copy here
export function handleServerError(error: unknown) {
  toast.error(error instanceof Error ? error.message : 'Something went wrong')
}
