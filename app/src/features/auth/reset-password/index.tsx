import { useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Form } from '@/components/ui/form'
import { AuthCard } from '../auth-card'
import { passwordSchema } from '../auth-api'
import { AuthField } from '../form-fields'

const schema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: "The passwords don't match." })
type Values = z.infer<typeof schema>

const EXPIRED = 'This reset link has expired or was already used.'

// Landing page for the emailed (or admin-copied) reset link. The token is verified on submit,
// not on load, so a reload or a link preview cannot use it up before the person picks a password.
export function ResetPassword() {
  const { token_hash } = useSearch({ from: '/admin/reset-password' })
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(token_hash ? null : EXPIRED)
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: { password: '', confirm: '' },
  })
  const pending = form.formState.isSubmitting

  async function onSubmit({ password }: Values) {
    setError(null)
    const { supabase } = await import('@/lib/supabase')
    const verified = await supabase.auth.verifyOtp({ token_hash: token_hash ?? '', type: 'recovery' })
    if (verified.error) return setError(EXPIRED)
    const updated = await supabase.auth.updateUser({ password })
    if (updated.error) return setError("Couldn't save the new password. Try a different one.")
    toast.success('Password updated')
    await navigate({ to: '/admin', replace: true })
  }

  return (
    <AuthCard
      title='Choose a new password'
      footer={
        <Link to='/admin/forgot-password' className='font-medium text-foreground underline-offset-4 hover:underline'>
          Need a new link?
        </Link>
      }
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className='grid gap-3' noValidate>
          <AuthField
            control={form.control}
            name='password'
            label='New password'
            type='password'
            autoComplete='new-password'
            description='At least 10 characters.'
          />
          <AuthField control={form.control} name='confirm' label='Confirm new password' type='password' autoComplete='new-password' />
          {error && (
            <Alert variant='destructive'>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type='submit' className='mt-2 h-10 w-full' disabled={pending || !token_hash}>
            {pending && <Loader2 className='size-4 animate-spin' />}
            {pending ? 'Saving…' : 'Save new password'}
          </Button>
        </form>
      </Form>
    </AuthCard>
  )
}
