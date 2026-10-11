import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { GENERIC_ERROR } from '@/lib/handle-server-error'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
  createRequest,
  getCase,
  getTemplates,
  unlessHandled,
  type Template,
  type TemplateItem,
} from './requests-api'

const DEFAULT_TEMPLATE = 'Standard resolution packet'
const NONE_ON = 'Choose at least one item.'
const CASE_NOT_FOUND = {
  title: 'Case not found',
  body: 'Look the client up again.',
}
const CREATE_COPY: Record<string, { title: string; body?: string }> = {
  no_items: { title: NONE_ON },
  case_not_found: CASE_NOT_FOUND,
}

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
  // null until staff touch anything: the default template's rows, all on.
  const [chosen, setChosen] = useState<{ templateId: string; rows: Row[] } | null>(
    null
  )
  const create = useMutation({
    mutationFn: (body: Parameters<typeof createRequest>[0]) =>
      createRequest(body),
    onSuccess: (data) => onCreated(data.request_id),
    onError: unlessHandled(qc, (e) => e.code in CREATE_COPY),
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
  const fallback =
    templates.find((t) => t.name === DEFAULT_TEMPLATE) ?? templates[0]
  const templateId = chosen?.templateId ?? fallback?.id ?? ''
  const rows = chosen?.rows ?? rowsOf(fallback)
  const c = caseQuery.data
  const name = [c.first_name, c.last_name].filter(Boolean).join(' ')

  const noneOn = !rows.some((r) => r.enabled)
  const blank = (r: Row) => r.enabled && r.label.trim() === ''
  const createError =
    create.error instanceof ApiError ? CREATE_COPY[create.error.code] : undefined

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
