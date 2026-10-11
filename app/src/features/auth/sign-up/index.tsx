import { useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Form } from '@/components/ui/form'
import { AuthCard } from '../auth-card'
import { accountErrorText, emailSchema, passwordSchema, signInAndRecord, signUp } from '../auth-api'
import { AuthField } from '../form-fields'

const schema = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(100),
  firm_name: z.string().trim().min(1, 'Enter your firm name.').max(120),
  email: emailSchema,
  password: passwordSchema,
})
type Values = z.infer<typeof schema>

// Public sign-up: creates a new, empty firm with this person as its admin, then signs them in.
export function SignUp() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: { name: '', firm_name: '', email: '', password: '' },
  })
  const pending = form.formState.isSubmitting

  async function onSubmit(values: Values) {
    setError(null)
    try {
      const { email } = await signUp(values)
      await signInAndRecord(email, values.password)
      await navigate({ to: '/admin', replace: true })
    } catch (e) {
      setError(accountErrorText(e))
    }
  }

  return (
    <AuthCard
      title='Create your ResSpark account'
      description="Set up your firm. You'll be its admin and can invite your team from Settings."
      footer={
        <>
          Already have an account?{' '}
          <Link to='/admin/sign-in' className='font-medium text-foreground underline-offset-4 hover:underline'>
            Sign in
          </Link>
        </>
      }
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className='grid gap-3' noValidate>
          <AuthField control={form.control} name='name' label='Your name' autoComplete='name' />
          <AuthField control={form.control} name='firm_name' label='Firm name' autoComplete='organization' />
          <AuthField control={form.control} name='email' label='Work email' type='email' autoComplete='username' />
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
            {pending ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
      </Form>
    </AuthCard>
  )
}
