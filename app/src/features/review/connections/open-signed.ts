import { toast } from 'sonner'
import { ApiError } from '@/lib/api'

// Client files never render inside the admin origin: the 5-minute signed URL opens in its own tab (T-04-31).
// shortcut: window.open runs after the fetch, so a strict popup blocker (Safari) may block it; open a blank tab first if staff report that.
export async function openSigned(signed: Promise<{ url: string }>) {
  try {
    const { url } = await signed
    window.open(url, '_blank', 'noopener')
  } catch (e) {
    toast.error("Couldn't open this file", {
      description: e instanceof ApiError ? `Try again in a moment. (${e.code})` : 'Try again in a moment.',
    })
  }
}
