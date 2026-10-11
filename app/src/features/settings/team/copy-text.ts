import { toast } from 'sonner'

// Clipboard copy with the app's toasts; a refused copy asks the person to select the link instead.
export async function copyText(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(done)
  } catch {
    toast.error("Couldn't copy the link", { description: 'Select the link and copy it yourself.' })
  }
}
