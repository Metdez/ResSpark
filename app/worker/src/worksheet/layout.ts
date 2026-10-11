// Pure page layout of the 433-A screening worksheet (D-16): rows of text -> Letter pages with the
// disclaimer header and footer on every page. No amounts are computed here; every number is the run's.
import type { RunView } from '../financials/evaluate'
import { money, toWinAnsi } from './text'

export const HEADER_TEXT = 'Screening worksheet — Not an IRS form'
export const FOOTER_TEXT = 'Prepared by ResSpark for review by a tax professional. Not an IRS form. Do not file.'

export interface WorksheetInput {
  firm_name: string
  client_name: string
  logics_case_id: number | null
  run: RunView
  snapshot: Record<string, unknown>
  sources: Record<string, { source: string; status: 'accepted' | 'edited'; by_name: string | null }>
  standards: { effective_date: string | null; source_url: string | null }
  generated_at: string
}

export interface WorksheetLine {
  text: string
  x: number
  size: number
  bold?: boolean
  align?: 'left' | 'right'
}

export interface WorksheetPage {
  lines: Array<WorksheetLine & { y: number }>
}

export type Measure = (text: string, size: number, bold: boolean) => number

// One baseline of body text; `keep` reserves room below it so a heading never ends a page.
export interface Row {
  height: number
  items: WorksheetLine[]
  keep?: number
}

export const PAGE = { width: 612, height: 792, margin: 50 } as const
export const RIGHT = PAGE.width - PAGE.margin
const BODY_TOP = PAGE.height - 70
const BODY_BOTTOM = 60
const HEADER_Y = PAGE.height - 40
const FOOTER_Y = 32
export const SIZE = 9
const LEADING = 13
const VALUE_X = 170

export const line = (text: string, x: number, size = SIZE, opts: { bold?: boolean; align?: 'left' | 'right' } = {}): WorksheetLine => ({
  text: toWinAnsi(text),
  x,
  size,
  ...opts,
})

export const spacer = (height = 8): Row => ({ height, items: [] })

export const heading = (text: string): Row => ({ height: 22, items: [line(text, PAGE.margin, 12, { bold: true })], keep: 2 * LEADING })

// Greedy word wrap at the measured width; a word wider than the line is cut by characters.
export function wrap(text: string, width: number, size: number, bold: boolean, measure: Measure): string[] {
  const out: string[] = []
  let cur = ''
  for (const word of toWinAnsi(text).split(' ').filter(Boolean)) {
    const next = cur ? `${cur} ${word}` : word
    if (measure(next, size, bold) <= width) {
      cur = next
      continue
    }
    if (cur) out.push(cur)
    cur = word
    while (measure(cur, size, bold) > width && cur.length > 1) {
      let cut = cur.length - 1
      while (cut > 1 && measure(cur.slice(0, cut), size, bold) > width) cut--
      out.push(cur.slice(0, cut))
      cur = cur.slice(cut)
    }
  }
  if (cur || out.length === 0) out.push(cur)
  return out
}

// Shortens text with an ellipsis to fit a table cell.
export function fit(text: string, width: number, size: number, measure: Measure): string {
  const t = toWinAnsi(text)
  if (measure(t, size, false) <= width) return t
  let cut = t.length
  while (cut > 0 && measure(`${t.slice(0, cut)}…`, size, false) > width) cut--
  return `${t.slice(0, cut)}…`
}

export const paragraph = (text: string, measure: Measure, opts: { x?: number; size?: number; bold?: boolean } = {}): Row[] => {
  const x = opts.x ?? PAGE.margin
  const size = opts.size ?? SIZE
  return wrap(text, RIGHT - x, size, opts.bold ?? false, measure).map((t) => ({
    height: LEADING,
    items: [line(t, x, size, { bold: opts.bold })],
  }))
}

// Bold label on the left, wrapped value beside it.
export function keyValue(label: string, value: string, measure: Measure): Row[] {
  const parts = wrap(value, RIGHT - VALUE_X, SIZE, false, measure)
  return parts.map((t, i) => ({
    height: LEADING,
    items: [...(i === 0 ? [line(label, PAGE.margin, SIZE, { bold: true })] : []), line(t, VALUE_X, SIZE)],
  }))
}

const stamp = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

function titleRows(input: WorksheetInput, measure: Measure): Row[] {
  const { run, standards } = input
  const b = run.standards_inputs
  return [
    { height: 20, items: [line('433-A screening worksheet', PAGE.margin, 16, { bold: true })] },
    ...paragraph('Built from one ResSpark screening run and the case facts staff confirmed for it. Proposed values are not included.', measure),
    spacer(),
    ...keyValue('Firm', input.firm_name, measure),
    ...keyValue('Client', input.client_name, measure),
    ...keyValue('Logics CaseID', input.logics_case_id === null ? 'Not linked' : String(input.logics_case_id), measure),
    ...keyValue('Run', run.id, measure),
    ...keyValue('Run time', `${stamp(run.created_at)}${run.created_by_name ? ` by ${run.created_by_name}` : ''}`, measure),
    ...keyValue('Engine version', run.engine_version, measure),
    ...keyValue('IRS standards', `Effective ${standards.effective_date ?? run.standards_effective_date ?? 'unknown'}${standards.source_url ? `, ${standards.source_url}` : ''}`, measure),
    ...keyValue('Location', `${b.county}, ${b.state}`, measure),
    ...keyValue('Household', `${b.household_size} ${b.household_size === 1 ? 'person' : 'people'}, ${b.vehicle_count} ${b.vehicle_count === 1 ? 'vehicle' : 'vehicles'}`, measure),
    ...keyValue('Generated', stamp(input.generated_at), measure),
  ]
}

function recommendationRows(input: WorksheetInput, measure: Measure): Row[] {
  const { run } = input
  const rows: Row[] = [
    heading('Recommendation'),
    ...keyValue('Outcome', run.outcome?.label ?? 'Not recognized', measure),
    ...keyValue('Path', run.path, measure),
    ...keyValue('Reason', run.reason, measure),
  ]
  if (run.payment_math) {
    const { total_tax_owed, csed_months_used } = run.payment_math
    rows.push(
      ...keyValue(
        'Payment',
        `${money(total_tax_owed)} ÷ ${csed_months_used} months, rounded up to the cent = ${money(run.suggested_offer_or_payment)}`,
        measure
      )
    )
  } else if (run.suggested_offer_or_payment !== 0) {
    rows.push(...keyValue('Suggested amount', money(run.suggested_offer_or_payment), measure))
  }
  rows.push(...keyValue('Manual review', run.needs_manual_review ? 'Yes' : 'No', measure))
  if (run.review_flags.length > 0) {
    rows.push(spacer(4), { height: LEADING, items: [line('Review flags', PAGE.margin, SIZE, { bold: true })], keep: LEADING })
    for (const flag of run.review_flags) rows.push(...paragraph(`• ${flag}`, measure, { x: PAGE.margin + 10 }))
  }
  rows.push(spacer(), ...paragraph(run.next, measure, { bold: true }))
  return rows
}

// Two passes (RESEARCH Pattern 6): place rows on pages, then stamp the header and `Page N of M` footer.
export function paginate(rows: Row[]): WorksheetPage[] {
  const bodies: Array<WorksheetPage['lines']> = [[]]
  let y = BODY_TOP
  for (const row of rows) {
    let page = bodies[bodies.length - 1]
    if (row.items.length === 0 && page.length === 0) continue
    if (y - row.height - (row.keep ?? 0) < BODY_BOTTOM && page.length > 0) {
      if (row.items.length === 0) continue
      bodies.push((page = []))
      y = BODY_TOP
    }
    y -= row.height
    for (const item of row.items) page.push({ ...item, y })
  }
  const n = bodies.length
  return bodies.map((body, i) => ({
    lines: [
      { ...line(HEADER_TEXT, PAGE.margin, 10, { bold: true }), y: HEADER_Y },
      ...body,
      { ...line(`${FOOTER_TEXT} Page ${i + 1} of ${n}`, PAGE.margin, 8), y: FOOTER_Y },
    ],
  }))
}

export function layoutWorksheet(input: WorksheetInput, measure: Measure): WorksheetPage[] {
  return paginate([...titleRows(input, measure), spacer(), ...recommendationRows(input, measure)])
}
