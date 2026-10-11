import { useId, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  LOGICS_KEY,
  updateLogicsSettings,
  type LogicsSettings,
} from './logics-settings-api'

const CATEGORY_ERROR = 'Enter a whole number of 1 or more, or leave it empty.'

// Empty means "omit FileCategoryID" (null, never 0, Pitfall 5); undefined means invalid.
function parseCategory(raw: string): number | null | undefined {
  const t = raw.trim()
  if (t === '') return null
  return /^\d+$/.test(t) && Number(t) >= 1 ? Number(t) : undefined
}

function activityLine(types: string[], error: number | undefined) {
  if (error !== undefined)
    return `Logics returned ${error} for the activity listing — the key may lack case.read on activities; connection still OK`
  if (types.length > 0)
    return `Activity types seen in Logics: ${types.join(', ')}`
  return 'Not checked — add a test CaseID to LOGICS_TEST_CASE_IDS'
}

export function PushSettingsCard({
  settings,
  activityTypes,
  activityTypesError,
  isAdmin,
}: {
  settings: LogicsSettings
  activityTypes: string[]
  activityTypesError?: number
  isAdmin: boolean
}) {
  const id = useId()
  const qc = useQueryClient()
  const [category, setCategory] = useState(
    settings.file_category_id?.toString() ?? ''
  )
  const [activity, setActivity] = useState(settings.activity_type)
  const [write, setWrite] = useState(settings.write_enabled)
  const save = useMutation({
    mutationFn: updateLogicsSettings,
    onSuccess: () => {
      toast.success('Settings saved')
      void qc.invalidateQueries({ queryKey: LOGICS_KEY })
    },
  })

  const categoryValue = parseCategory(category)
  const activityTrimmed = activity.trim()
  const activityValid =
    activityTrimmed.length >= 1 && activityTrimmed.length <= 60
  const patch: Partial<LogicsSettings> = {}
  if (
    categoryValue !== undefined &&
    categoryValue !== settings.file_category_id
  )
    patch.file_category_id = categoryValue
  if (activityValid && activityTrimmed !== settings.activity_type)
    patch.activity_type = activityTrimmed
  if (write !== settings.write_enabled) patch.write_enabled = write
  const canSave =
    categoryValue !== undefined &&
    activityValid &&
    Object.keys(patch).length > 0 &&
    !save.isPending
  // Keep the saved value selectable even if Logics no longer lists it.
  const options = [...new Set([...activityTypes, settings.activity_type])]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Push settings</CardTitle>
        <CardDescription>
          How approved documents are filed in the client's Logics case.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className='grid gap-4'
          onSubmit={(e) => {
            e.preventDefault()
            if (canSave) save.mutate(patch)
          }}
        >
          <div className='grid gap-2'>
            <Label htmlFor={`${id}-category`}>
              File category ID (optional)
            </Label>
            <Input
              id={`${id}-category`}
              type='number'
              inputMode='numeric'
              min={1}
              disabled={!isAdmin}
              value={category}
              aria-invalid={categoryValue === undefined || undefined}
              aria-describedby={`${id}-category-hint`}
              onChange={(e) => setCategory(e.target.value)}
            />
            <p
              id={`${id}-category-hint`}
              className={
                categoryValue === undefined
                  ? 'text-sm text-destructive'
                  : 'text-sm text-muted-foreground'
              }
            >
              {categoryValue === undefined
                ? CATEGORY_ERROR
                : 'Leave empty to let Logics use its default category.'}
            </p>
          </div>
          <div className='grid gap-2'>
            <Label htmlFor={`${id}-activity`}>Activity type</Label>
            {activityTypes.length > 0 ? (
              <Select
                value={activity}
                onValueChange={setActivity}
                disabled={!isAdmin}
              >
                <SelectTrigger id={`${id}-activity`} className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id={`${id}-activity`}
                maxLength={60}
                disabled={!isAdmin}
                value={activity}
                onChange={(e) => setActivity(e.target.value)}
              />
            )}
            <p className='text-sm text-muted-foreground'>
              {activityLine(activityTypes, activityTypesError)}
            </p>
          </div>
          <div className='grid gap-2'>
            <div className='flex items-center gap-2'>
              <Switch
                id={`${id}-write`}
                checked={write}
                onCheckedChange={setWrite}
                disabled={!isAdmin}
                aria-describedby={`${id}-write-hint`}
              />
              <Label htmlFor={`${id}-write`}>Write enabled</Label>
            </div>
            <p
              id={`${id}-write-hint`}
              className='text-sm text-muted-foreground'
            >
              Pushes are refused for this firm until this is on.
            </p>
          </div>
          {isAdmin ? (
            <div className='flex sm:justify-end'>
              <Button type='submit' disabled={!canSave}>
                {save.isPending && <Loader2 className='size-4 animate-spin' />}
                {save.isPending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          ) : (
            <p className='text-sm text-muted-foreground'>
              Only a firm admin can change these settings.
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
