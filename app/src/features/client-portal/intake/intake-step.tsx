import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import {
  QUESTION_BY_ID,
  QUESTION_UI,
  clientQuestionOrder,
  validateClientAnswer,
} from '../../../../shared/questions'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { PortalError, type PortalStep } from '../portal-api'
import { finishIntake, getIntake, saveAnswer, type AnswerValue } from './intake-api'
import { INTAKE_COPY as T } from './intake-copy'
import { QuestionControl } from './question-control'

const errorText = (e: unknown) =>
  e instanceof PortalError && e.code === 'bad_value'
    ? T.badValue
    : e instanceof PortalError && e.code === 'incomplete'
      ? T.incomplete
      : T.saveFailed

// D-13: one question per screen; resume at the first unanswered; nothing saves until Next.
export function IntakeStep({ step, open, onClose }: { step: PortalStep; open: boolean; onClose(): void }) {
  const qc = useQueryClient()
  const { data, isError } = useQuery({ queryKey: ['portal', 'intake', step.id], queryFn: getIntake, enabled: open })
  // answers saved in this sheet, layered over the server's
  const [local, setLocal] = useState<Record<string, AnswerValue>>({})
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ id: string; value: AnswerValue | undefined } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  const answers = { ...data?.answers, ...local }
  const order = clientQuestionOrder(answers)
  const firstOpen = order.find((id) => !(id in answers)) ?? order[order.length - 1]
  const id = currentId && order.includes(currentId) ? currentId : firstOpen
  const index = order.indexOf(id)
  const isLast = index === order.length - 1
  const prefill = data && !(id in answers) ? data.prefill[id] : undefined
  const ui = QUESTION_UI[id]
  const value =
    draft?.id === id
      ? draft.value
      : (answers[id] ?? prefill?.value ?? (ui?.control === 'stepper' ? ui.minimum : undefined))

  useEffect(() => {
    if (data) heading.current?.focus()
  }, [id, data])

  const go = (next: string) => {
    setCurrentId(next)
    setDraft(null)
    setError(null)
  }

  const finish = useMutation({
    mutationFn: finishIntake,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['portal', 'state'] })
      onClose()
    },
    onError: (e) => setError(errorText(e)),
  })
  const save = useMutation({
    mutationFn: (a: { id: string; value: AnswerValue }) => saveAnswer(a.id, a.value),
    onSuccess: (_, a) => {
      const saved = { ...local, [a.id]: a.value }
      setLocal(saved)
      const after = clientQuestionOrder({ ...data?.answers, ...saved })
      const next = after[after.indexOf(a.id) + 1]
      if (next) go(next)
      else finish.mutate()
    },
    onError: (e) => setError(errorText(e)),
  })
  const busy = save.isPending || finish.isPending

  const onNext = () => {
    if (value === undefined || validateClientAnswer(id, value)) return setError(T.badValue)
    setError(null)
    save.mutate({ id, value })
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side='bottom'
        className='mx-auto h-dvh max-w-[30rem] gap-0 overflow-y-auto [&>button:last-child]:hidden'
      >
        <SheetHeader className='p-6 pb-2'>
          <SheetTitle className='text-xl leading-tight'>{step.label}</SheetTitle>
          <SheetDescription className={data ? 'text-base' : 'sr-only'}>
            {data ? `${T.progress(index + 1, order.length)} · ${ui.section}` : T.loading}
          </SheetDescription>
        </SheetHeader>
        <div className='grid gap-6 px-6 pb-6'>
          {isError && <p className='text-base text-destructive'>{T.loadFailed}</p>}
          {!data && !isError && <p className='text-base text-muted-foreground'>{T.loading}</p>}
          {data && (
            <>
              <h3 ref={heading} tabIndex={-1} data-question={id} className='text-xl leading-tight font-semibold outline-none'>
                {QUESTION_BY_ID[id].prompt}
              </h3>
              {prefill && draft?.id !== id && <p className='text-base text-muted-foreground'>{T.prefill[prefill.source]}</p>}
              <QuestionControl question={QUESTION_BY_ID[id]} value={value} onChange={(v) => setDraft({ id, value: v })} />
              {error && (
                <p role='alert' className='text-base text-destructive'>
                  {error}
                </p>
              )}
              <div className='grid grid-cols-2 gap-3'>
                <Button
                  type='button'
                  size='xl'
                  variant='outline'
                  disabled={index === 0 || busy}
                  onClick={() => go(order[index - 1])}
                >
                  {T.back}
                </Button>
                <Button type='button' size='xl' disabled={busy} onClick={onNext}>
                  {busy ? (
                    <>
                      <Loader2 className='animate-spin' aria-hidden='true' />
                      {T.saving}
                    </>
                  ) : isLast ? (
                    T.done
                  ) : (
                    T.next
                  )}
                </Button>
              </div>
            </>
          )}
          <Button type='button' size='xl' variant='outline' className='w-full' onClick={onClose}>
            {T.close}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
