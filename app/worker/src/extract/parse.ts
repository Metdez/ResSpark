// Port of parse_texts / parse_pdf / _parse_document / _from_kind in src/document_parse.py.
// No LLM fallback: a failed template throws the Python ValueError text as ExtractError.
import { health, investment, life, retirement } from './accounts'
import { bankStatement } from './bank-statement'
import { business } from './business'
import { classify } from './classify'
import { ExtractError, StopIteration, strip, type Rows } from './fields'
import { lease, mortgage, utility } from './housing'
import { payStub } from './pay-stub'
import { pageText } from './pdf-text'
import { accountTranscript, wageTranscript } from './transcript'
import { auto, valuation } from './vehicle'

export { ExtractError } from './fields'

export type ParsedDocument = Record<string, unknown> & { _kind?: string }

const READERS: Record<string, (texts: readonly string[]) => ParsedDocument> = {
  pay_stub: (texts) => ({ _kind: 'pay_stub', ...payStub(texts) }),
  lease,
  mortgage,
  auto,
  health,
  utility,
  business,
  retirement,
  life,
  investment,
  valuation,
}

const fromKind = (kind: string, texts: readonly string[], rows: Rows): ParsedDocument => {
  if (kind === 'account') return { _kind: 'account', ...accountTranscript(texts) }
  if (kind === 'wage') return { _kind: 'wage', ...wageTranscript(texts) }
  if (kind === 'bank') return { _kind: 'bank', ...bankStatement(texts, rows) }
  if (kind === 'bankruptcy') {
    if (!texts.some((text) => strip(text))) throw new ExtractError('No template matched')
    return { _kind: 'bankruptcy' }
  }
  const read = READERS[kind]
  if (!read) throw new ExtractError('No template matched')
  return read(texts)
}

const parseDocument = (
  texts: readonly string[],
  rows: Rows,
  documentType: string | null,
  label: string,
): ParsedDocument => {
  const kind = classify(texts, documentType)
  try {
    if (!kind) throw new ExtractError(`No template matched ${label}`)
    return fromKind(kind, texts, rows)
  } catch (caught) {
    if (!(caught instanceof ExtractError || caught instanceof StopIteration)) throw caught
    // _fields_for has no 'bankruptcy' entry, so Python raises KeyError there before the model.
    if (kind === 'bankruptcy') throw new Error("KeyError: 'bankruptcy'", { cause: caught })
    throw caught instanceof ExtractError ? caught : new ExtractError(`No template matched ${label}`, { cause: caught })
  }
}

export function parseTexts(texts: string[], rows: Rows, documentType: string | null): ParsedDocument {
  return parseDocument(texts, rows, documentType, 'document')
}

export async function parsePdf(bytes: Uint8Array, documentType: string | null, label = 'document'): Promise<ParsedDocument> {
  const { texts, rows } = await pageText(bytes)
  return parseDocument(texts, rows, documentType, label)
}
