import { useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Form } from '@/components/ui/form'
import { Skeleton } from '@/components/ui/skeleton'
import { AuthCard } from '../auth-card'
import { acceptInvite, accountErrorText, getInvite, passwordSchema, signInAndRecord } from '../auth-api'
import { AuthField } from '../form-fields'

const schema = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(100),
  password: passwordSchema,
})
type Values = z.infer<typeof schema>

const signInLink = (
  <Link to='/admin/sign-in' className='font-medium text-foreground underline-offset-4 hover:underline'>
    Go to sign in
  </Link>
)

// Invite landing page: shows the firm and the invited email, then creates the account.
export function Join() {
  const { token } = useSearch({ from: '/admin/join' })
  const invite = useQuery({
    queryKey: ['invite', token],
    queryFn: () => getInvite(token ?? ''),
    enabled: Boolean(token),
    retry: false,
    // the invalid-link card below is the error message; no app-wide toast
    meta: { errorShown: true },
  })

  if (!token || invite.isError)
    return (
      <AuthCard title='This invite link is no longer valid' footer={signInLink}>
        <p className='text-sm text-muted-foreground'>
          It may have expired, been used already, or been replaced by a newer invite. Ask your admin to send
          you a new one.
        </p>
      </AuthCard>
    )

  if (!invite.data)
    return (
      <AuthCard title='Join your team'>
        <Skeleton className='h-40 w-full' />
      </AuthCard>
    )

  const { firm_name, email, role } = invite.data
  return (
    <AuthCard
      title={`Join ${firm_name}`}
      description={
        <>
          You're invited as {role === 'admin' ? 'an admin' : 'staff'} with <span className='font-medium'>{email}</span>.
          Set your name and a password to finish.
        </>
      }
      footer={signInLink}
    >
      <JoinForm token={token} />
    </AuthCard>
  )
}

function JoinForm({ token }: { token: string }) {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const form = useForm<Values>({ resolver: zodResolver(schema), mode: 'onBlur', defaultValues: { name: '', password: '' } })
  const pending = form.formState.isSubmitting

  async function onSubmit(values: Values) {
    setError(null)
    try {
      const { email } = await acceptInvite({ token, ...values })
      await signInAndRecord(email, values.password)
      await navigate({ to: '/admin', replace: true })
    } catch (e) {
      setError(accountErrorText(e))
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='grid gap-3' noValidate>
        <AuthField control={form.control} name='name' label='Your name' autoComplete='name' />
        <AuthField
          control={form.control}
          name='password'
          label='Password'
          type='password'
          autoComplete='new-password'
          description='At least 10 characters.'
        />
        {error && (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type='submit' className='mt-2 h-10 w-full' disabled={pending}>
          {pending && <Loader2 className='size-4 animate-spin' />}
          {pending ? 'Joining…' : 'Join and sign in'}
        </Button>
      </form>
    </Form>
  )
}
