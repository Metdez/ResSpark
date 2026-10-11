import { useId, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api'
import {
  ESIGN_TEMPLATE_KEYS,
  ESIGN_TEMPLATE_LABELS,
  type EsignTemplateKey,
} from '@/lib/esign-templates'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { unlessHandled } from '@/features/requests/requests-api'
import {
  ESIGN_SETTINGS_KEY,
  getEsignSettings,
  listEsignTemplates,
  saveEsignMapping,
  type EsignMappingValue,
  type EsignSettings,
} from './esign-api'

// Radix Select refuses an empty-string value, so "Not set" needs a sentinel.
const NONE = 'none'

// Errors worded in the card; everything else gets the generic staff toast with the code.
const INLINE: Record<string, string> = {
  forbidden: 'Only an admin can change these.',
  template_not_single_signer:
    'That template has more than one signer. Use a template with one signer role.',
  template_not_found:
    "DocuSeal couldn't find that template. Reload the page and pick again.",
}

export function EsignTemplatesCard() {
  const id = useId()
  const qc = useQueryClient()
  const settings = useQuery({
    queryKey: ESIGN_SETTINGS_KEY,
    queryFn: getEsignSettings,
    meta: { errorShown: true },
  })
  const configured = settings.data?.configured === true
  const templates = useQuery({
    queryKey: ['esign', 'templates'],
    queryFn: listEsignTemplates,
    enabled: configured,
    meta: { errorShown: true },
  })
  const [draft, setDraft] = useState<Partial<EsignMappingValue>>({})
  const save = useMutation({
    mutationFn: saveEsignMapping,
    onSuccess: (mapping) => {
      qc.setQueryData<EsignSettings>(
        ESIGN_SETTINGS_KEY,
        (old) => old && { ...old, mapping }
      )
      setDraft({})
      toast.success('E-sign templates saved')
    },
    onError: unlessHandled(qc, (e) => e.code in INLINE),
  })
  const inlineError =
    save.error instanceof ApiError ? INLINE[save.error.code] : undefined

  let body: React.ReactNode
  if (settings.isPending)
    body = [0, 1, 2].map((i) => <Skeleton key={i} className='h-10 w-full' />)
  else if (settings.isError)
    body = (
      <p className='text-sm text-destructive'>
        Couldn't load the e-sign settings.
      </p>
    )
  else if (!configured)
    body = (
      <p className='text-sm text-muted-foreground'>
        E-sign not set up. Add the DocuSeal API key, then reload this page.
      </p>
    )
  else if (templates.isPending)
    body = [0, 1, 2].map((i) => <Skeleton key={i} className='h-10 w-full' />)
  else if (templates.isError)
    body = (
      <p className='text-sm text-destructive'>
        Couldn't load the DocuSeal templates.
      </p>
    )
  else {
    const mapping = settings.data.mapping
    const value = (k: EsignTemplateKey) =>
      k in draft ? (draft[k] ?? null) : mapping[k]
    const patch = Object.fromEntries(
      ESIGN_TEMPLATE_KEYS.filter((k) => value(k) !== mapping[k]).map((k) => [
        k,
        value(k),
      ])
    ) as Partial<EsignMappingValue>
    const options = (k: EsignTemplateKey) => {
      const list = templates.data
      const saved = mapping[k]
      // Keep a saved template selectable even if DocuSeal no longer lists it.
      return saved !== null && !list.some((t) => t.id === saved)
        ? [...list, { id: saved, name: `Template ${saved}` }]
        : list
    }
    body = (
      <form
        className='grid gap-4'
        onSubmit={(e) => {
          e.preventDefault()
          if (Object.keys(patch).length > 0) save.mutate(patch)
        }}
      >
        {ESIGN_TEMPLATE_KEYS.map((k) => (
          <div key={k} className='grid gap-2'>
            <Label htmlFor={`${id}-${k}`}>{ESIGN_TEMPLATE_LABELS[k]}</Label>
            <Select
              value={value(k)?.toString() ?? NONE}
              onValueChange={(v) => {
                save.reset()
                setDraft((d) => ({ ...d, [k]: v === NONE ? null : Number(v) }))
              }}
            >
              <SelectTrigger id={`${id}-${k}`} className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not set</SelectItem>
                {options(k).map((t) => (
                  <SelectItem key={t.id} value={t.id.toString()}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
        {inlineError && (
          <p role='alert' className='text-sm text-destructive'>
            {inlineError}
          </p>
        )}
        <div className='flex sm:justify-end'>
          <Button
            type='submit'
            disabled={Object.keys(patch).length === 0 || save.isPending}
          >
            {save.isPending && <Loader2 className='size-4 animate-spin' />}
            {save.isPending ? 'Saving…' : 'Save templates'}
          </Button>
        </div>
      </form>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          E-sign templates
          {configured && settings.data?.env === 'test' && (
            <Badge variant='outline'>Test mode</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Choose the DocuSeal template for each form. Build templates in the
          DocuSeal console with one signer.
        </CardDescription>
      </CardHeader>
      <CardContent className='grid gap-4'>{body}</CardContent>
    </Card>
  )
}
