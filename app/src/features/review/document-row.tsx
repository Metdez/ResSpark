import { Download, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api'
import { ago } from '@/lib/relative-time'
import { documentStatusBadge } from '@/lib/status'
import { Button } from '@/components/ui/button'
import { TableCell, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { StatusBadge } from '@/components/status-badge'
import { documentUrl, type Disposition, type ReviewDocument } from './api'

const MIME_LABEL: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
}

function formatSize(bytes: number | null): string {
  if (bytes === null) return '—'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Client files never render inside the admin origin: the signed URL opens in its own tab (T-03-16).
// shortcut: window.open runs after the fetch, so a strict popup blocker (Safari) may block it; open a blank tab first if staff report that.
async function openFile(d: ReviewDocument, disposition: Disposition) {
  try {
    const { url } = await documentUrl(d.id, disposition)
    window.open(url, '_blank', 'noopener')
  } catch (e) {
    toast.error("Couldn't open this file", {
      description: e instanceof ApiError ? `Try again in a moment. (${e.code})` : 'Try again in a moment.',
    })
  }
}

function IconAction({ label, onClick, children }: { label: string; onClick(): void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type='button' variant='ghost' size='icon' className='size-8' aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function DocumentRow({ document: d }: { document: ReviewDocument }) {
  return (
    <TableRow data-document-row={d.id} className='h-10'>
      <TableCell className='max-w-64 truncate text-primary' title={d.name}>
        {d.name}
      </TableCell>
      <TableCell className='text-muted-foreground'>{MIME_LABEL[d.mime] ?? d.mime}</TableCell>
      <TableCell className='text-end tabular-nums'>{formatSize(d.size_bytes)}</TableCell>
      <TableCell className='text-muted-foreground' title={d.uploaded_at}>
        {ago(d.uploaded_at)}
      </TableCell>
      <TableCell>
        <StatusBadge {...documentStatusBadge(d.status)} />
      </TableCell>
      <TableCell className='text-end'>
        <IconAction label='Preview' onClick={() => void openFile(d, 'inline')}>
          <ExternalLink className='size-4' />
        </IconAction>
        <IconAction label='Download' onClick={() => void openFile(d, 'attachment')}>
          <Download className='size-4' />
        </IconAction>
      </TableCell>
    </TableRow>
  )
}
