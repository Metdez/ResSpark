// Port of parse_texts / parse_pdf / _parse_document / _from_kind in src/document_parse.py.
// No LLM fallback: a failed template throws the Python ValueError text as ExtractError.
import { classify } from './classify'
import { ExtractError, StopIteration, type Rows } from './fields'
import { pageText } from './pdf-text'
import { accountTranscript, wageTranscript } from './transcript'

export { ExtractError } from './fields'

export type ParsedDocument = Record<string, unknown> & { _kind?: string }

const fromKind = (kind: string, texts: readonly string[], _rows: Rows): ParsedDocument => {
  if (kind === 'account') return { _kind: 'account', ...accountTranscript(texts) }
  if (kind === 'wage') return { _kind: 'wage', ...wageTranscript(texts) }
  throw new ExtractError('No template matched')
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
