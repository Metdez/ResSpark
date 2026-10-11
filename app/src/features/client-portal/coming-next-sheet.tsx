import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { PortalStep } from './portal-api'
import { COMING_NEXT } from './step-copy'

// D-11: every step opens this placeholder until Phases 3-6 build the real step.
export function ComingNextSheet({
  step,
  onClose,
}: {
  step: PortalStep | null
  onClose: () => void
}) {
  return (
    <Sheet open={!!step} onOpenChange={(open) => !open && onClose()}>
      {/* the vendored icon close is 16 px; the 44 px Close below replaces it */}
      <SheetContent
        side='bottom'
        className='mx-auto max-w-[30rem] rounded-t-lg [&>button:last-child]:hidden'
      >
        <SheetHeader className='p-6 pb-0'>
          <SheetTitle className='text-xl leading-tight'>
            {step?.label}
          </SheetTitle>
          <SheetDescription asChild>
            <div className='text-base'>
              <p className='font-medium text-foreground'>{COMING_NEXT.title}</p>
              <p className='mt-1'>{COMING_NEXT.body}</p>
            </div>
          </SheetDescription>
        </SheetHeader>
        <SheetFooter className='p-6 pt-2'>
          <SheetClose asChild>
            <Button size='xl' variant='outline' className='w-full'>
              {COMING_NEXT.close}
            </Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
