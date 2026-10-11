import { useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError, api, isOk } from '@/lib/api'
import { GENERIC_ERROR } from '@/lib/handle-server-error'
import { safeRedirect } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/password-input'

const formSchema = z.object({
  email: z.email({
    error: (iss) =>
      iss.input === ''
        ? 'Enter your email.'
        : "That doesn't look like an email address.",
  }),
  password: z.string().min(1, 'Enter your password.'),
})

const WRONG_CREDENTIALS = {
  title: 'Email or password is incorrect',
  body: "Check both and try again. If you've forgotten your password, ask your admin to reset it.",
}
const NETWORK = {
  title: "Couldn't reach ResSpark",
  body: 'Check your connection and try again.',
}

interface UserAuthFormProps extends React.HTMLAttributes<HTMLFormElement> {
  redirectTo?: string
}

export function UserAuthForm({
  className,
  redirectTo,
  ...props
}: UserAuthFormProps) {
  const [pending, setPending] = useState(false)
  const [formError, setFormError] = useState<typeof NETWORK | null>(null)
  const navigate = useNavigate()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    mode: 'onBlur',
    defaultValues: { email: '', password: '' },
  })

  async function signIn({ email, password }: z.infer<typeof formSchema>) {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (!error) return true
      setFormError(isAuthRetryableFetchError(error) ? NETWORK : WRONG_CREDENTIALS)
    } catch {
      setFormError(NETWORK)
    }
    return false
  }

  async function onSubmit(data: z.infer<typeof formSchema>) {
    if (pending) return
    setPending(true)
    setFormError(null)
    if (!(await signIn(data))) {
      setPending(false)
      return
    }
    try {
      // D-16 audit event; the session already exists, so a failed post only warns
      await api(
        '/api/admin/session',
        { method: 'POST', body: JSON.stringify({ event: 'signed_in' }) },
        isOk
      )
    } catch (error) {
      toast.error(GENERIC_ERROR, {
        description: error instanceof ApiError ? error.code : undefined,
      })
    }
    await navigate({ to: safeRedirect(redirectTo), replace: true })
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('grid gap-3', className)}
        noValidate
        {...props}
      >
        <FormField
          control={form.control}
          name='email'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type='email'
                  autoComplete='username'
                  inputMode='email'
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='password'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {formError && (
          <Alert variant='destructive'>
            <AlertTitle className='whitespace-normal'>{formError.title}</AlertTitle>
            <AlertDescription>{formError.body}</AlertDescription>
          </Alert>
        )}
        <Button type='submit' className='mt-2 h-10 w-full' disabled={pending}>
          {pending && <Loader2 className='size-4 animate-spin' />}
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </Form>
  )
}
