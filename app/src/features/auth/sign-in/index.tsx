import { Link, useSearch } from '@tanstack/react-router'
import { AuthCard } from '../auth-card'
import { UserAuthForm } from './components/user-auth-form'

const appName = import.meta.env.VITE_APP_NAME ?? 'ResSpark'
const link = 'font-medium text-foreground underline-offset-4 hover:underline'

// UI-SPEC S1, framed by AuthCard.
export function SignIn() {
  const { redirect } = useSearch({ from: '/admin/sign-in' })

  return (
    <AuthCard
      title={`Sign in to ${appName}`}
      description={`Staff access for ${appName}.`}
      footer={
        <>
          New to {appName}?{' '}
          <Link to='/admin/sign-up' className={link}>
            Create an account
          </Link>
        </>
      }
    >
      <UserAuthForm redirectTo={redirect} />
      <Link to='/admin/forgot-password' className={`justify-self-center text-sm ${link}`}>
        Forgot your password?
      </Link>
    </AuthCard>
  )
}
