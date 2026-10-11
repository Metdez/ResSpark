import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { acceptFile } from './accept'
import {
  completeUpload,
  listItemDocuments,
  mintUpload,
  remintToken,
  type MintResponse,
} from './api'
import {
  errorCopy,
  uploadCopy,
  uploadErrorCode,
  type UploadErrorCode,
} from './copy'
import { FileRow, type FileRowData } from './file-row'
import { preprocess, sha256Hex } from './preprocess'
import {
  clearPending,
  pendingKey,
  readPending,
  uploadBlob,
  writePending,
} from './transport'

// Same cap as the case-documents bucket and the Worker (D-02).
const MAX_BYTES = 26_214_400
const ACCEPT = 'image/*,.pdf,.heic,.heif'
// The server deleted the object or the file can never pass: retrying cannot help.
const FINAL = new Set([
  'unsupported_type',
  'file_too_large',
  'bad_file_type',
  'empty',
  'item_approved',
  'heic_failed',
])

const codeOf = (e: unknown): string => {
  const code = (e as { code?: unknown } | null)?.code
  if (typeof code === 'string') return code
  return e instanceof Error && e.message === 'heic_failed'
    ? 'heic_failed'
    : 'network'
}

type Local = FileRowData & { file: File }

// D-11/UPL-01: camera or files, per-file progress, independent failures, Done once one file landed.
export function UploadSheet({
  item,
  open,
  onClose,
  onError,
}: {
  item: { id: string; label: string; status: string }
  open: boolean
  onClose: () => void
  onError?: (code: UploadErrorCode) => void
}) {
  const listed = useQuery({
    queryKey: ['portal', 'item', item.id, 'documents'],
    queryFn: () => listItemDocuments(item.id),
  })
  const [rows, setRows] = useState<Local[]>([])
  const nextKey = useRef(0)
  const camera = useRef<HTMLInputElement>(null)
  const files = useRef<HTMLInputElement>(null)
  const controllers = useRef(new Map<string, AbortController>())

  // Closing the sheet stops every in-flight upload (XHR or tus).
  useEffect(() => {
    const map = controllers.current
    return () => map.forEach((c) => c.abort())
  }, [])

  const status = listed.data?.item.status ?? item.status
  const note = listed.data?.item.rejection_note
  const update = (key: string, patch: Partial<Local>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const fail = (key: string, code: string) => {
    update(key, {
      phase: 'error',
      error: errorCopy(code),
      canRetry: !FINAL.has(code),
    })
    onError?.(uploadErrorCode(code))
  }

  async function send(key: string, file: File) {
    const accepted = acceptFile(file)
    if (!accepted.ok)
      return fail(
        key,
        accepted.reason === 'type' ? 'unsupported_type' : 'empty'
      )
    const ctrl = new AbortController()
    controllers.current.set(key, ctrl)
    const fileKey = pendingKey(file)
    try {
      update(key, { phase: 'preparing', progress: 0, error: undefined })
      const p = await preprocess(file, accepted.kind)
      if (p.blob.size > MAX_BYTES) return fail(key, 'file_too_large')
      if (p.blob.size === 0) return fail(key, 'empty')
      const sha256 = await sha256Hex(p.blob)

      // A file picked again after a reload reuses its document so tus can resume.
      let target: MintResponse | undefined
      const prior = readPending(item.id)[fileKey]
      if (prior)
        target = await remintToken(prior).catch(() => {
          clearPending(item.id, fileKey)
          return undefined
        })
      if (!target) {
        target = await mintUpload(item.id, {
          name: p.name,
          mime: p.mime,
          size: p.blob.size,
        })
        writePending(item.id, fileKey, target.document_id)
      }

      update(key, { phase: 'uploading', size: p.blob.size })
      try {
        await uploadBlob(
          target,
          p.blob,
          p.mime,
          (f) => update(key, { progress: f }),
          { signal: ctrl.signal }
        )
      } catch (e) {
        // A 4xx (expired token, offset mismatch) cannot resume: the next try mints anew.
        if (codeOf(e) === 'upload_failed') clearPending(item.id, fileKey)
        throw e
      }
      update(key, { phase: 'checking', progress: 1 })
      await completeUpload(target.document_id, { sha256, size: p.blob.size })
      clearPending(item.id, fileKey)
      update(key, { phase: 'ready' })
    } catch (e) {
      if (ctrl.signal.aborted) return
      const code = codeOf(e)
      if (code === 'bad_file_type' || code === 'file_too_large')
        clearPending(item.id, fileKey)
      fail(key, code)
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = [...(e.target.files ?? [])]
    e.target.value = ''
    if (picked.length === 0) return
    const added = picked.map<Local>((file) => ({
      key: `new-${nextKey.current++}`,
      name: file.name,
      size: file.size,
      phase: 'preparing',
      progress: 0,
      file,
    }))
    setRows((rs) => [...rs, ...added])
    // allSettled: one file failing never cancels its siblings.
    void Promise.allSettled(added.map((r) => send(r.key, r.file)))
  }

  const prior: FileRowData[] = (listed.data?.documents ?? []).map((d) => ({
    key: d.id,
    name: d.name,
    size: d.size_bytes,
    phase: d.status,
    progress: 1,
  }))
  const all: FileRowData[] = [...prior, ...rows]
  const anyReady = all.some((r) => r.phase === 'ready')

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      {/* the vendored icon close is 16 px; the 44 px Close below replaces it */}
      <SheetContent
        side='bottom'
        className='mx-auto max-h-[90svh] max-w-[30rem] overflow-y-auto rounded-t-lg [&>button:last-child]:hidden'
      >
        <SheetHeader className='p-6 pb-0'>
          <SheetTitle className='text-xl leading-tight'>
            {item.label}
          </SheetTitle>
          <SheetDescription className='text-base'>
            {uploadCopy.intro}
          </SheetDescription>
        </SheetHeader>
        <div className='flex flex-col gap-4 px-6'>
          {status === 'rejected' && note && (
            <Alert variant='destructive'>
              <AlertDescription className='text-base'>
                {uploadCopy.rejectedPrefix}
                {note}
              </AlertDescription>
            </Alert>
          )}
          {status === 'approved' ? (
            <Alert>
              <AlertDescription className='text-base'>
                {uploadCopy.approved}
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <Button
                className='h-14 w-full text-base'
                onClick={() => camera.current?.click()}
              >
                {status === 'rejected'
                  ? uploadCopy.controlAgain
                  : uploadCopy.control}
              </Button>
              <input
                ref={camera}
                type='file'
                accept={ACCEPT}
                capture='environment'
                multiple
                hidden
                onChange={onPick}
              />
              {/* iOS opens only the camera when `capture` is set; this one reaches photos and PDFs */}
              <Button
                size='xl'
                variant='outline'
                className='w-full'
                onClick={() => files.current?.click()}
              >
                {uploadCopy.chooseFiles}
              </Button>
              <input
                ref={files}
                type='file'
                accept={ACCEPT}
                multiple
                hidden
                onChange={onPick}
              />
            </>
          )}
          {all.length > 0 && (
            <ul>
              {all.map((r) => (
                <FileRow
                  key={r.key}
                  row={r}
                  onRetry={() => {
                    const local = rows.find((x) => x.key === r.key)
                    if (local) void send(local.key, local.file)
                  }}
                  onRemove={() =>
                    setRows((rs) => rs.filter((x) => x.key !== r.key))
                  }
                />
              ))}
            </ul>
          )}
        </div>
        <SheetFooter className='flex flex-col gap-3 p-6 pt-2'>
          <Button
            size='xl'
            className='w-full'
            disabled={!anyReady}
            onClick={onClose}
          >
            {uploadCopy.done}
          </Button>
          <Button
            size='xl'
            variant='outline'
            className='w-full'
            onClick={onClose}
          >
            {uploadCopy.close}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
