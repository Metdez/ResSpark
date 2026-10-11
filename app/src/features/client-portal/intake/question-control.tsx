import { Minus, Plus } from 'lucide-react'
import { QUESTION_UI, type Question } from '../../../../shared/questions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { AnswerValue } from './intake-api'
import { INTAKE_COPY as T } from './intake-copy'

interface Props {
  question: Question
  value: AnswerValue | undefined
  onChange(value: AnswerValue | undefined): void
}

// D-13: yes/no and pay frequency are 44 px buttons, counts are steppers, ages a numeric input.
export function QuestionControl({ question, value, onChange }: Props) {
  const ui = QUESTION_UI[question.id]
  const pick = (options: ReadonlyArray<{ value: AnswerValue; label: string }>) => (
    <div className='grid gap-3'>
      {options.map((o) => (
        <Button
          key={String(o.value)}
          type='button'
          size='xl'
          variant={value === o.value ? 'default' : 'outline'}
          aria-pressed={value === o.value}
          className='w-full'
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </Button>
      ))}
    </div>
  )

  if (ui.control === 'yes_no')
    return pick([
      { value: true, label: T.yes },
      { value: false, label: T.no },
    ])
  if (ui.control === 'choice') return pick(ui.options ?? [])

  const min = ui.minimum ?? 0
  const max = ui.maximum ?? Number.MAX_SAFE_INTEGER
  if (ui.control === 'stepper') {
    const n = typeof value === 'number' ? value : min
    return (
      <div className='flex items-center justify-center gap-6'>
        <Button
          type='button'
          size='xl'
          variant='outline'
          className='min-h-11 min-w-11'
          aria-label={T.fewer}
          disabled={n <= min}
          onClick={() => onChange(n - 1)}
        >
          <Minus aria-hidden='true' />
        </Button>
        <output aria-live='polite' className='min-w-12 text-center text-3xl font-semibold'>
          {n}
        </output>
        <Button
          type='button'
          size='xl'
          variant='outline'
          className='min-h-11 min-w-11'
          aria-label={T.more}
          disabled={n >= max}
          onClick={() => onChange(n + 1)}
        >
          <Plus aria-hidden='true' />
        </Button>
      </div>
    )
  }

  return (
    <Input
      aria-label={question.prompt}
      inputMode='numeric'
      autoComplete='off'
      maxLength={3}
      value={typeof value === 'number' ? String(value) : ''}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '')
        onChange(digits === '' ? undefined : Number(digits))
      }}
      className='h-11 text-base md:text-base'
    />
  )
}
