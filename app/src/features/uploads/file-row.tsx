import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import { uploadCopy } from './copy'

export type RowPhase =
  | 'preparing'
  | 'uploading'
  | 'checking'
  | 'ready'
  | 'rejected'
  | 'error'

export interface FileRowData {
  key: string
  name: string
  size: number | null
  phase: RowPhase
  progress: number
  error?: string
  canRetry?: boolean
}

// Middle truncation keeps the extension and the camera's numbering visible.
const shortName = (name: string) =>
  name.length > 32 ? `${name.slice(0, 18)}…${name.slice(-12)}` : name

const formatSize = (bytes: number | null) =>
  bytes === null
    ? ''
    : bytes < 1024 * 1024
      ? `${Math.max(1, Math.round(bytes / 1024))} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`

export function FileRow({
  row,
  onRetry,
  onRemove,
}: {
  row: FileRowData
  onRetry: () => void
  onRemove: () => void
}) {
  const busy =
    row.phase === 'preparing' ||
    row.phase === 'uploading' ||
    row.phase === 'checking'
  const percent = Math.round(row.progress * 100)
  return (
    <li
      data-file-row
      className='flex flex-col gap-2 border-b py-3 last:border-0'
    >
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <p className='min-w-0 text-base break-all' title={row.name}>
          {shortName(row.name)}
          <span className='ms-2 text-muted-foreground'>
            {formatSize(row.size)}
          </span>
        </p>
        {row.phase === 'ready' && (
          <StatusBadge tone='success' label={uploadCopy.ready} size='lg' />
        )}
        {row.phase === 'rejected' && (
          <StatusBadge
            tone='destructive'
            label={uploadCopy.needsNewCopy}
            size='lg'
          />
        )}
      </div>
      {busy && (
        <>
          <p className='text-base text-muted-foreground' aria-live='polite'>
            {row.phase === 'preparing' && uploadCopy.preparing}
            {row.phase === 'uploading' && `${uploadCopy.uploading} ${percent}%`}
            {row.phase === 'checking' && uploadCopy.checking}
          </p>
          <div
            role='progressbar'
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className='h-2 w-full overflow-hidden rounded-full bg-muted'
          >
            <div
              className='h-full bg-primary transition-all'
              style={{ width: `${percent}%` }}
            />
          </div>
        </>
      )}
      {row.phase === 'error' && (
        <div className='flex flex-wrap items-center gap-3'>
          <p
            role='alert'
            className='flex-1 basis-48 text-base text-destructive'
          >
            {row.error}
          </p>
          <Button
            size='xl'
            variant='outline'
            onClick={row.canRetry ? onRetry : onRemove}
          >
            {row.canRetry ? uploadCopy.retry : uploadCopy.remove}
          </Button>
        </div>
      )}
    </li>
  )
}
