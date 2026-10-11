import { useId, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Copy, Loader2 } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { unlessHandled } from '@/features/requests/requests-api'
import { copyText } from './copy-text'
import { TEAM_KEY, inviteMember, type CreatedInvite, type Role } from './team-api'

// Codes this card explains inline; anything else goes to the app-wide handler.
const INLINE: Record<string, string> = {
  invalid_email: "That doesn't look like an email address.",
  already_member: 'That person is already on your team.',
}

const EMAIL_STATUS: Record<CreatedInvite['email_status'], string> = {
  sent: 'We emailed them the link. You can also copy it below.',
  not_configured: "Email isn't set up yet, so nothing was sent. Copy the link and send it to them yourself.",
  send_failed: "The email didn't go out. Copy the link and send it to them yourself.",
}

export function InviteCard() {
  const id = useId()
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('staff')
  const [created, setCreated] = useState<CreatedInvite | null>(null)
  const invite = useMutation({
    mutationFn: inviteMember,
    onSuccess: (result) => {
      setCreated(result)
      setEmail('')
      void qc.invalidateQueries({ queryKey: TEAM_KEY })
    },
    onError: unlessHandled(qc, (e) => e.code in INLINE),
  })
  const inlineError = invite.error instanceof ApiError ? INLINE[invite.error.code] : undefined

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite a teammate</CardTitle>
        <CardDescription>They get a link to set their own password. Links expire after 7 days.</CardDescription>
      </CardHeader>
      <CardContent className='grid gap-3'>
        <form
          className='flex flex-wrap items-end gap-2'
          onSubmit={(e) => {
            e.preventDefault()
            setCreated(null)
            if (email.trim()) invite.mutate({ email: email.trim(), role })
          }}
        >
          <div className='grid min-w-48 flex-1 gap-1.5'>
            <Label htmlFor={`${id}-email`}>Email</Label>
            <Input id={`${id}-email`} type='email' value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className='grid gap-1.5'>
            <Label htmlFor={`${id}-role`}>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger id={`${id}-role`} className='w-28'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='staff'>Staff</SelectItem>
                <SelectItem value='admin'>Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type='submit' disabled={invite.isPending || !email.trim()}>
            {invite.isPending && <Loader2 className='size-4 animate-spin' />}
            Send invite
          </Button>
        </form>
        {inlineError && <p className='text-sm text-destructive'>{inlineError}</p>}
        {created && (
          <Alert>
            <AlertTitle>Invite ready for {created.email}</AlertTitle>
            <AlertDescription className='grid gap-2'>
              <span>{EMAIL_STATUS[created.email_status]}</span>
              <code className='rounded bg-muted px-2 py-1 text-xs break-all'>{created.url}</code>
              <Button
                variant='outline'
                size='sm'
                className='justify-self-start'
                onClick={() => copyText(created.url, 'Invite link copied')}
              >
                <Copy className='size-4' /> Copy invite link
              </Button>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
