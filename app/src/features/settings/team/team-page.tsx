import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/features/requests/requests-api'
import { ContentSection } from '../components/content-section'
import { copyText } from './copy-text'
import { InviteCard } from './invite-card'
import { TEAM_KEY, getTeam, memberResetLink, revokeInvite, type Team, type TeamMember } from './team-api'

const roleLabel = (role: string) => (role === 'admin' ? 'Admin' : 'Staff')

function MemberRow({ m, team }: { m: TeamMember; team: Team }) {
  const reset = useMutation({
    mutationFn: () => memberResetLink(m.user_id),
    onSuccess: ({ url }) => copyText(url, `Reset link for ${m.display_name} copied. It works once, for one hour.`),
  })
  return (
    <li className='flex flex-wrap items-center gap-x-3 gap-y-1 py-3' data-member={m.user_id}>
      <div className='min-w-0 flex-1'>
        <p className='truncate text-sm font-medium'>
          {m.display_name}
          {m.user_id === team.you && <span className='text-muted-foreground'> (you)</span>}
        </p>
        <p className='truncate text-sm text-muted-foreground'>{m.email ?? '—'}</p>
      </div>
      <Badge variant={m.role === 'admin' ? 'default' : 'secondary'}>{roleLabel(m.role)}</Badge>
      <span className='w-32 text-xs text-muted-foreground'>
        {m.last_sign_in_at ? `Last sign-in ${formatDate(m.last_sign_in_at)}` : 'Never signed in'}
      </span>
      {team.can_manage && m.user_id !== team.you && (
        <Button variant='outline' size='sm' disabled={reset.isPending} onClick={() => reset.mutate()}>
          <KeyRound className='size-4' /> Copy reset link
        </Button>
      )}
    </li>
  )
}

function Invites({ team }: { team: Team }) {
  const qc = useQueryClient()
  const revoke = useMutation({
    mutationFn: revokeInvite,
    onSuccess: () => {
      toast.success('Invite revoked')
      void qc.invalidateQueries({ queryKey: TEAM_KEY })
    },
  })
  if (!team.invites.length) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending invites</CardTitle>
        <CardDescription>Links that haven't been used yet. Revoke one to stop it working.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className='divide-y'>
          {team.invites.map((i) => (
            <li key={i.id} className='flex flex-wrap items-center gap-3 py-3' data-invite={i.id}>
              <span className='min-w-0 flex-1 truncate text-sm'>{i.email}</span>
              <Badge variant='outline'>{roleLabel(i.role)}</Badge>
              <span className='text-xs text-muted-foreground'>Expires {formatDate(i.expires_at)}</span>
              <Button variant='ghost' size='sm' disabled={revoke.isPending} onClick={() => revoke.mutate(i.id)}>
                <X className='size-4' /> Revoke
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

export function TeamPage() {
  const team = useQuery({ queryKey: TEAM_KEY, queryFn: getTeam })
  return (
    <ContentSection title='Team' desc="People who can sign in to your firm's ResSpark.">
      <div className='grid gap-4'>
        {team.data?.can_manage && <InviteCard />}
        {team.data && <Invites team={team.data} />}
        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
            <CardDescription>
              {team.data?.can_manage
                ? 'Admins can invite people and make password-reset links for teammates.'
                : 'Ask an admin to invite someone new.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {team.data ? (
              <ul className='divide-y'>
                {team.data.members.map((m) => (
                  <MemberRow key={m.user_id} m={m} team={team.data} />
                ))}
              </ul>
            ) : (
              <Skeleton className='h-24 w-full' />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentSection>
  )
}
