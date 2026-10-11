import { useId, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FlaskConical, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api'
import { GENERIC_ERROR } from '@/lib/handle-server-error'
import { useSession } from '@/lib/session'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { PasswordInput } from '@/components/password-input'
import { formatDate, unlessHandled } from '@/features/requests/requests-api'
import { ContentSection } from '../components/content-section'
import {
  LOGICS_KEY as KEY,
  getLogicsStatus,
  saveLogicsCredentials,
  testLogicsConnection,
  type IntegrationStatus,
  type TestResult,
} from './logics-settings-api'
import { PushSettingsCard } from './push-settings-card'

// D-03: 401/403 means Logics answered and refused; no status means it was never reached.
function testCopy(r: TestResult) {
  if (r.ok)
    return {
      failed: false,
      title: `Connected — Logics accepted the credentials on ${formatDate(r.tested_at)}.`,
    }
  if (r.status === 401 || r.status === 403)
    return {
      failed: true,
      title: 'Logics rejected the credentials',
      body: 'Check the API key and secret token and save again.',
    }
  return {
    failed: true,
    title: "Couldn't reach Logics",
    body: 'Check the base URL and try again.',
  }
}

function StatusLines({ s }: { s: IntegrationStatus }) {
  const lastTest = !s.last_test_at
    ? 'never'
    : `${s.last_test_ok ? 'passed' : 'failed'} ${formatDate(s.last_test_at)}`
  return (
    <div className='grid gap-1 text-sm'>
      <p>
        {s.configured && s.key_hint
          ? `Key ending in ••••${s.key_hint}`
          : 'No credentials saved'}
        {s.configured &&
          s.updated_at &&
          ` · Updated ${formatDate(s.updated_at)}`}
      </p>
      <p className='text-muted-foreground'>Last test: {lastTest}</p>
    </div>
  )
}

export function LogicsSettingsPage({
  children,
}: {
  children?: React.ReactNode
}) {
  const id = useId()
  const qc = useQueryClient()
  const isAdmin = useSession().data?.role === 'admin'
  const status = useQuery({
    queryKey: KEY,
    queryFn: getLogicsStatus,
    meta: { errorShown: true },
  })
  const [apiKey, setApiKey] = useState('')
  const [secret, setSecret] = useState('')
  const [baseUrl, setBaseUrl] = useState('')

  const test = useMutation({
    mutationFn: (_: void) => testLogicsConnection(),
    onSuccess: (r) => {
      qc.setQueryData<IntegrationStatus>(
        KEY,
        (old) =>
          old && { ...old, last_test_at: r.tested_at, last_test_ok: r.ok }
      )
      // A passing test may have listed new activity types (D-08).
      if (r.ok) void qc.invalidateQueries({ queryKey: KEY })
    },
  })
  const save = useMutation({
    mutationFn: saveLogicsCredentials,
    // The PUT answers with the Worker's last write, so it replaces the cached status (D-01).
    onSuccess: (s) => {
      qc.setQueryData<IntegrationStatus>(KEY, (old) => ({ ...old, ...s }))
      setApiKey('')
      setSecret('')
      setBaseUrl('')
      test.reset()
      toast.success('Credentials saved')
    },
    onError: unlessHandled(qc, (e) => e.code === 'invalid_base_url'),
  })
  const baseError =
    save.error instanceof ApiError && save.error.code === 'invalid_base_url'

  let body: React.ReactNode
  if (status.isPending)
    body = [0, 1, 2].map((i) => <Skeleton key={i} className='h-10 w-full' />)
  else if (status.isError)
    body = (
      <Alert variant='destructive'>
        <AlertTitle className='whitespace-normal'>
          Couldn't load these settings
        </AlertTitle>
        <AlertDescription>{GENERIC_ERROR}</AlertDescription>
      </Alert>
    )
  else {
    const s = status.data
    const result = test.data && testCopy(test.data)
    body = (
      <>
        <StatusLines s={s} />
        {s.mode === 'fake' && (
          <Alert>
            <FlaskConical className='size-4' />
            <AlertTitle>Using built-in test cases</AlertTitle>
            <AlertDescription>
              Lookups use ResSpark's sample cases until the Logics mode is
              switched to live. Credentials you save are tested against Logics
              but not used for lookups until then.
            </AlertDescription>
          </Alert>
        )}
        {result && (
          <Alert variant={result.failed ? 'destructive' : 'default'}>
            <AlertTitle className='whitespace-normal'>
              {result.title}
            </AlertTitle>
            {result.body && <AlertDescription>{result.body}</AlertDescription>}
          </Alert>
        )}
        <form
          className='grid gap-4'
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate({
              api_key: apiKey,
              secret_token: secret,
              base_url: baseUrl,
            })
          }}
        >
          <div className='grid gap-2'>
            <Label htmlFor={`${id}-key`}>API key</Label>
            <PasswordInput
              id={`${id}-key`}
              autoComplete='off'
              disabled={!isAdmin}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor={`${id}-secret`}>Secret token</Label>
            <PasswordInput
              id={`${id}-secret`}
              autoComplete='off'
              disabled={!isAdmin}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor={`${id}-base`}>Base URL (optional)</Label>
            <Input
              id={`${id}-base`}
              type='url'
              disabled={!isAdmin}
              value={baseUrl}
              aria-invalid={baseError || undefined}
              aria-describedby={`${id}-base-hint`}
              onChange={(e) => {
                setBaseUrl(e.target.value)
                if (baseError) save.reset()
              }}
            />
            <p
              id={`${id}-base-hint`}
              className={
                baseError
                  ? 'text-sm text-destructive'
                  : 'text-sm text-muted-foreground'
              }
            >
              {baseError
                ? 'Enter an https:// address.'
                : 'Leave blank for the ValorTax default.'}
            </p>
          </div>
          {isAdmin ? (
            <div className='flex flex-col gap-4 sm:flex-row sm:justify-end'>
              <Button
                type='button'
                variant='outline'
                disabled={!s.configured || test.isPending}
                onClick={() => test.mutate()}
              >
                {test.isPending && <Loader2 className='size-4 animate-spin' />}
                {test.isPending ? 'Testing…' : 'Test connection'}
              </Button>
              <Button
                type='submit'
                disabled={!apiKey.trim() || !secret.trim() || save.isPending}
              >
                {save.isPending && <Loader2 className='size-4 animate-spin' />}
                {save.isPending ? 'Saving…' : 'Save credentials'}
              </Button>
            </div>
          ) : (
            <p className='text-sm text-muted-foreground'>
              Only a firm admin can change these credentials.
            </p>
          )}
        </form>
      </>
    )
  }

  return (
    <ContentSection
      title='Integrations'
      desc='Connect the services your firm already uses.'
    >
      <div className='grid gap-6'>
        <Card>
          <CardHeader>
            <CardTitle>IRS Logics</CardTitle>
            <CardDescription>
              Used to find cases by case ID, phone, or email.
            </CardDescription>
          </CardHeader>
          <CardContent className='grid gap-4'>{body}</CardContent>
        </Card>
        {status.data?.settings && (
          <PushSettingsCard
            // Remount on a refetch so the form starts from the saved values.
            key={JSON.stringify(status.data.settings)}
            settings={status.data.settings}
            activityTypes={status.data.activity_types ?? []}
            activityTypesError={test.data?.activity_types_error}
            isAdmin={isAdmin}
          />
        )}
        {children}
      </div>
    </ContentSection>
  )
}
