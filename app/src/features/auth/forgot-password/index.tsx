import { useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Form } from '@/components/ui/form'
import { AuthCard } from '../auth-card'
import { accountErrorText, emailSchema, requestPasswordReset } from '../auth-api'
import { AuthField } from '../form-fields'

const schema = z.object({ email: emailSchema })

const backToSignIn = (
  <Link to='/admin/sign-in' className='font-medium text-foreground underline-offset-4 hover:underline'>
    Back to sign in
  </Link>
)

// The Worker answers the same way whether or not the account exists, so this page does too.
export function ForgotPassword() {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: { email: '' },
  })
  const pending = form.formState.isSubmitting

  async function onSubmit({ email }: z.infer<typeof schema>) {
    setError(null)
    try {
      await requestPasswordReset(email)
      setSentTo(email)
    } catch (e) {
      setError(accountErrorText(e))
    }
  }

  if (sentTo)
    return (
      <AuthCard title='Check your email' footer={backToSignIn}>
        <p className='text-sm'>
          If an account exists for <span className='font-medium'>{sentTo}</span>, we sent a link to choose a
          new password. It works once and expires in one hour.
        </p>
        <p className='text-sm text-muted-foreground'>
          No email after a few minutes? Your firm admin can make you a reset link from Settings → Team.
        </p>
      </AuthCard>
    )

  return (
    <AuthCard
      title='Reset your password'
      description="Enter your account email and we'll send you a link to choose a new password."
      footer={backToSignIn}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className='grid gap-3' noValidate>
          <AuthField control={form.control} name='email' label='Email' type='email' autoComplete='username' />
          {error && (
            <Alert variant='destructive'>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type='submit' className='mt-2 h-10 w-full' disabled={pending}>
            {pending && <Loader2 className='size-4 animate-spin' />}
            {pending ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      </Form>
    </AuthCard>
  )
}
