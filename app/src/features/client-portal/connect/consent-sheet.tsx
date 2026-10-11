import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { CONSENT_TEXT, type ConsentKind } from '@/lib/consent-text'

// D-12 / BANK-05: the one "Use of data" statement, shown before the first connect of each kind.
export function ConsentSheet({
  kind,
  firmName,
  open,
  busy,
  notice,
  onAgree,
  onClose,
}: {
  kind: ConsentKind
  firmName: string
  open: boolean
  busy: boolean
  notice?: string | null
  onAgree(): void
  onClose(): void
}) {
  const t = CONSENT_TEXT[kind]
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side='bottom'
        className='mx-auto max-h-[90dvh] max-w-[30rem] gap-0 rounded-t-lg [&>button:last-child]:hidden'
      >
        {/* the text scrolls, the footer stays pinned: I agree is tappable without scrolling on 390×844 */}
        <SheetHeader className='min-h-0 overflow-y-auto p-6 pb-2'>
          <SheetTitle className='text-xl leading-tight'>{t.title}</SheetTitle>
          <SheetDescription asChild>
            <div className='grid gap-2 text-base'>
              {notice && <p className='font-medium text-foreground'>{notice}</p>}
              <p className='text-foreground'>{t.body}</p>
              {t.points && (
                <ul className='grid list-disc gap-1 ps-5'>
                  {t.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
              <p>{t.detail.replace('{firm}', firmName)}</p>
            </div>
          </SheetDescription>
        </SheetHeader>
        <SheetFooter className='border-t p-6 pt-4'>
          <Button size='xl' className='w-full' disabled={busy} onClick={onAgree}>
            {busy ? (
              <>
                <Loader2 className='animate-spin motion-reduce:animate-none' aria-hidden='true' />
                Saving…
              </>
            ) : (
              t.agree
            )}
          </Button>
          <Button size='xl' variant='outline' className='w-full' onClick={onClose}>
            Not now
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
