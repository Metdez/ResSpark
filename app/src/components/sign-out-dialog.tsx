import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api'
import { GENERIC_ERROR } from '@/lib/handle-server-error'
import { signOutEverywhere } from '@/lib/session'
import { ConfirmDialog } from '@/components/confirm-dialog'

const appName = import.meta.env.VITE_APP_NAME ?? 'ResSpark'

interface SignOutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// UI-SPEC S4. Signing out is not destructive, so the confirm button keeps the default variant.
export function SignOutDialog({ open, onOpenChange }: SignOutDialogProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [pending, setPending] = useState(false)

  const handleSignOut = async () => {
    setPending(true)
    // posts signed_out first, then always signs out locally (never traps the user)
    const postError = await signOutEverywhere()
    if (postError) {
      toast.error(GENERIC_ERROR, {
        description: postError instanceof ApiError ? postError.code : undefined,
      })
    }
    await navigate({ to: '/admin/sign-in', replace: true })
    // after leaving the shell, so the mounted session query does not refetch without a token
    queryClient.clear()
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Sign out of ${appName}?`}
      desc="You'll need your email and password to sign in again."
      confirmText='Sign out'
      cancelBtnText='Cancel'
      isLoading={pending}
      handleConfirm={() => void handleSignOut()}
      className='sm:max-w-sm'
    />
  )
}
