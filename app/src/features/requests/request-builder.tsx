import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Loader2, Plus } from 'lucide-react'
import { ApiError } from '@/lib/api'
import {
  ESIGN_TEMPLATE_KEYS,
  ESIGN_TEMPLATE_LABELS,
} from '@/lib/esign-templates'
import { GENERIC_ERROR } from '@/lib/handle-server-error'
import { ago } from '@/lib/relative-time'
import { requestStatusBadge } from '@/lib/status'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ESIGN_SETTINGS_KEY,
  getEsignSettings,
} from '@/features/settings/integrations/esign-api'
import {
  createRequest,
  getCase,
  getTemplates,
  unlessHandled,
  type CaseRequestRow,
  type Template,
  type TemplateItem,
} from './requests-api'

// Oct 12 call (A): bank and payroll are what the firm cares about; the full packet stays in the dropdown.
const DEFAULT_TEMPLATE = 'Bank and payroll'
const FALLBACK_TEMPLATE = 'Standard resolution packet'
const NONE_ON = 'Choose at least one item.'
const CASE_NOT_FOUND = {
  title: 'Case not found',
  body: 'Look the client up again.',
}
const CREATE_COPY = new Map<string, { title: string; body?: string }>([
  ['no_items', { title: NONE_ON }],
  ['case_not_found', CASE_NOT_FOUND],
])

type Row = TemplateItem & { enabled: boolean }
const rowsOf = (t: Template | undefined): Row[] =>
  t ? t.items.map((i) => ({ ...i, enabled: true })) : []

const Title = ({ children }: { children: React.ReactNode }) => (
  <h1 className='mb-6 text-2xl leading-tight font-semibold'>{children}</h1>
)

function ErrorAlert({ title, body }: { title: string; body?: string }) {
  return (
    <Alert variant='destructive'>
      <AlertTitle className='whitespace-normal'>{title}</AlertTitle>
      {body && <AlertDescription>{body}</AlertDescription>}
    </Alert>
  )
}

// Oct 12 call (I): say so when the case already has a request, with a way to it. Creating another
// stays allowed; the Worker treats a second packet as a legitimate second draft (admin-requests.ts).
function ExistingRequests({ rows }: { rows: CaseRequestRow[] }) {
  return (
    <Alert className='mb-6'>
      <AlertTitle className='whitespace-normal'>
        A request already exists for this client
      </AlertTitle>
      <AlertDescription>
        {rows.map((r) => (
          <p
            key={r.id}
            data-existing-request
            className='flex flex-wrap items-center gap-x-3'
          >
            <span title={r.sent_at ?? r.created_at}>
              {`${r.agent_display_name ?? 'Someone'} · ${requestStatusBadge(r.status).label} · ${ago(r.sent_at ?? r.created_at)}`}
            </span>
            <Link
              to='/admin/requests/$requestId'
              params={{ requestId: r.id }}
              className='text-brand underline underline-offset-4'
            >
              View request
            </Link>
          </p>
        ))}
      </AlertDescription>
    </Alert>
  )
}

// D-06: toggle seeded items on or off and rename them; the list itself is fixed by the template.
export function RequestBuilder({
  caseId,
  onCreated,
}: {
  caseId: string
  onCreated: (requestId: string) => void
}) {
  const qc = useQueryClient()
  const caseQuery = useQuery({
    queryKey: ['case', caseId],
    queryFn: () => getCase(caseId),
  })
  const templatesQuery = useQuery({
    queryKey: ['request-templates'],
    queryFn: () => getTemplates(),
  })
  // A failed read only disables "Add a form to sign"; the rest of the builder keeps working.
  const esignQuery = useQuery({
    queryKey: ESIGN_SETTINGS_KEY,
    queryFn: getEsignSettings,
    retry: false,
    meta: { errorShown: true },
  })
  // null until staff touch anything: the default template's rows, all on.
  const [chosen, setChosen] = useState<{ templateId: string; rows: Row[] } | null>(
    null
  )
  const create = useMutation({
    mutationFn: (body: Parameters<typeof createRequest>[0]) =>
      createRequest(body),
    onSuccess: (data) => onCreated(data.request_id),
    onError: unlessHandled(qc, (e) => CREATE_COPY.has(e.code)),
  })

  if (caseQuery.isError)
    return (
      <>
        <Title>New request</Title>
        {caseQuery.error instanceof ApiError && caseQuery.error.status === 404 ? (
          <ErrorAlert {...CASE_NOT_FOUND} />
        ) : (
          <ErrorAlert title={GENERIC_ERROR} />
        )}
      </>
    )
  if (templatesQuery.isError)
    return (
      <>
        <Title>New request</Title>
        <ErrorAlert title={GENERIC_ERROR} />
      </>
    )
  if (caseQuery.isPending || templatesQuery.isPending)
    return (
      <>
        <Title>New request</Title>
        <div className='grid gap-4'>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className='h-10 w-full' />
          ))}
        </div>
      </>
    )

  const templates = templatesQuery.data.templates
  // Templates arrive by name, so templates[0] alone would pick "Documents only" where the new row is missing.
  const fallback =
    templates.find((t) => t.name === DEFAULT_TEMPLATE) ??
    templates.find((t) => t.name === FALLBACK_TEMPLATE) ??
    templates[0]
  const templateId = chosen?.templateId ?? fallback?.id ?? ''
  const rows = chosen?.rows ?? rowsOf(fallback)
  const c = caseQuery.data
  const name = [c.first_name, c.last_name].filter(Boolean).join(' ')

  const noneOn = !rows.some((r) => r.enabled)
  const blank = (r: Row) => r.enabled && r.label.trim() === ''
  const createError =
    create.error instanceof ApiError
      ? CREATE_COPY.get(create.error.code)
      : undefined

  // D-01, D-11: only the three allowed forms, and only those the firm has mapped.
  const esign = esignQuery.data
  const mappedKeys = esign?.configured
    ? ESIGN_TEMPLATE_KEYS.filter((k) => esign.mapping[k] !== null)
    : []
  const inRequest = (key: string) =>
    rows.some((r) => r.kind === 'signature' && r.config.template === key)

  const update = (i: number, patch: Partial<Row>) =>
    setChosen({
      templateId,
      rows: rows.map((r, j) => (j === i ? { ...r, ...patch } : r)),
    })

  function submit() {
    create.mutate({
      case_id: caseId,
      template_id: templateId,
      items: rows
        .filter((r) => r.enabled)
        .map(({ kind, label, required, config }) => ({
          kind,
          label: label.trim(),
          required,
          config,
        })),
    })
  }

  return (
    <>
      <Title>{name ? `New request for ${name}` : 'New request'}</Title>
      {c.requests?.length ? <ExistingRequests rows={c.requests} /> : null}
      <Card>
        <CardContent className='grid gap-6'>
          <div className='grid gap-2'>
            <Label htmlFor='request-template' className='font-normal'>
              Template
            </Label>
            <Select
              value={templateId}
              onValueChange={(id) =>
                setChosen({
                  templateId: id,
                  rows: rowsOf(templates.find((t) => t.id === id)),
                })
              }
            >
              <SelectTrigger id='request-template' className='h-10 w-full sm:w-80'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <ul className='grid gap-4'>
            {rows.map((r, i) => (
              <li key={`${templateId}-${i}`} data-builder-row className='grid gap-2'>
                <div className='flex items-center gap-3'>
                  <Checkbox
                    checked={r.enabled}
                    aria-label={`Include ${r.label.trim() || 'item ' + (i + 1)}`}
                    onCheckedChange={(v) => update(i, { enabled: v === true })}
                  />
                  <Input
                    value={r.label}
                    maxLength={120}
                    aria-label={`Label for item ${i + 1}`}
                    aria-invalid={blank(r) ? true : undefined}
                    onChange={(e) => update(i, { label: e.target.value })}
                  />
                  <span className='shrink-0 text-sm text-muted-foreground'>
                    {r.required ? 'Required' : 'Optional'}
                  </span>
                </div>
                {blank(r) && (
                  <p className='ps-7 text-sm text-destructive'>Enter a label.</p>
                )}
              </li>
            ))}
          </ul>

          <div className='grid gap-2 sm:justify-items-start'>
            <DropdownMenu>
              <DropdownMenuTrigger asChild disabled={mappedKeys.length === 0}>
                <Button type='button' variant='outline' className='h-10'>
                  <Plus className='size-4' />
                  Add a form to sign
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='start'>
                {mappedKeys.map((key) => (
                  <DropdownMenuItem
                    key={key}
                    disabled={inRequest(key)}
                    onSelect={() =>
                      setChosen({
                        templateId,
                        rows: [
                          ...rows,
                          {
                            kind: 'signature',
                            label: ESIGN_TEMPLATE_LABELS[key],
                            required: true,
                            config: { template: key },
                            enabled: true,
                          },
                        ],
                      })
                    }
                  >
                    {ESIGN_TEMPLATE_LABELS[key]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {mappedKeys.length === 0 && (
              <p className='text-sm text-muted-foreground'>
                E-sign not set up. An admin maps templates in Settings →
                Integrations.
              </p>
            )}
          </div>

          {createError && <ErrorAlert {...createError} />}

          <div className='flex flex-col gap-2 sm:items-end'>
            {noneOn && (
              <p className='text-sm text-muted-foreground'>{NONE_ON}</p>
            )}
            <Button
              type='button'
              className='h-10 w-full sm:w-auto'
              disabled={noneOn || rows.some(blank) || create.isPending}
              onClick={submit}
            >
              {create.isPending && <Loader2 className='size-4 animate-spin' />}
              {create.isPending ? 'Creating…' : 'Create request'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
