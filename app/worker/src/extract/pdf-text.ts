// Port of _page_text in src/document_parse.py: ReportLab text-show operators, no PDF library.
import { strip, type Rows } from './fields'

export interface PageText {
  texts: string[]
  rows: Rows // Python dict insertion order: [y, [[x, text], …]]
}

// One char per byte, like bytes.decode('latin1'); TextDecoder('latin1') is really windows-1252.
const latin1 = (bytes: Uint8Array): string => {
  let out = ''
  for (let start = 0; start < bytes.length; start += 0x8000)
    out += String.fromCharCode(...bytes.subarray(start, start + 0x8000))
  return out
}

const toBytes = (text: string): Uint8Array => Uint8Array.from(text, (char) => char.charCodeAt(0))

const stripCrLf = (text: string): string => text.replace(/^[\r\n]+|[\r\n]+$/g, '')

// base64.a85decode(body, adobe=True) of Python 3.11, including where it raises.
const a85decode = (text: string): Uint8Array | null => {
  if (!text.endsWith('~>')) return null
  const body = text.startsWith('<~') ? text.slice(2, -2) : text.slice(0, -2)
  const decoded: number[] = []
  let current: number[] = []
  for (const char of body + 'uuuu') {
    const code = char.charCodeAt(0)
    if (code >= 33 && code <= 117) {
      current.push(code)
      if (current.length === 5) {
        let acc = 0
        for (const digit of current) acc = 85 * acc + (digit - 33)
        if (acc > 0xffffffff) return null // Ascii85 overflow
        decoded.push(acc >>> 24, (acc >>> 16) & 0xff, (acc >>> 8) & 0xff, acc & 0xff)
        current = []
      }
    } else if (char === 'z') {
      if (current.length) return null
      decoded.push(0, 0, 0, 0)
    } else if (!' \t\n\r\v'.includes(char)) {
      return null // Non-Ascii85 digit found
    }
  }
  const padding = 4 - current.length
  return Uint8Array.from(padding ? decoded.slice(0, -padding) : decoded)
}

// zlib.decompress: a stream that fails to inflate is skipped (null), like zlib.error.
const inflate = async (bytes: Uint8Array): Promise<Uint8Array | null> => {
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  } catch {
    return null
  }
}

// Python \s on bytes is ASCII whitespace only, and bytes `.` excludes just \n.
const SHOW = /\(((?:\\[^\n]|[^)])*)\)[ \t\n\r\f\v]*Tj/g
const PLACED = /([\d.]+) ([\d.]+) Tm \(((?:\\[^\n]|[^)])*)\) Tj/g
const ESCAPES: Record<string, string> = { n: '\n', r: '\r', t: '\t', '(': '(', ')': ')', '\\': '\\' }

export const unescape = (raw: string): string =>
  raw.replace(/\\([0-7]{1,3}|[^\n])/g, (_match, token: string) =>
    '01234567'.includes(token[0]) ? String.fromCharCode(parseInt(token, 8)) : (ESCAPES[token] ?? token),
  )

// float() of a [\d.]+ run; "1.2.3" raises in Python and is not caught there either.
const pyFloat = (text: string): number => {
  if (!/^(\d+\.?\d*|\.\d+)$/.test(text)) throw new Error(`could not convert string to float: '${text}'`)
  return Number(text)
}

export async function pageText(bytes: Uint8Array): Promise<PageText> {
  const data = latin1(bytes)
  const texts: string[] = []
  const rows = new Map<number, Array<[number, string]>>()
  // Like re.finditer(rb"stream\r?\n"): "endstream\n" matches too, exactly as in Python.
  for (const match of data.matchAll(/stream\r?\n/g)) {
    const start = (match.index ?? 0) + match[0].length
    const end = data.indexOf('endstream', start)
    let body = stripCrLf(data.slice(start, end < 0 ? data.length - 1 : end))
    if (body.endsWith('~>')) {
      const decoded = a85decode(body)
      if (!decoded) continue
      body = latin1(decoded)
    }
    if (body.startsWith('\x78')) {
      const inflated = await inflate(toBytes(body))
      if (!inflated) continue
      body = latin1(inflated)
    }
    for (const found of body.matchAll(SHOW)) {
      const text = strip(unescape(found[1]))
      if (text) texts.push(text)
    }
    // Bank columns are the draws that put x y straight on Tm.
    for (const found of body.matchAll(PLACED)) {
      const text = strip(unescape(found[3]))
      if (!text) continue
      const y = pyFloat(found[2])
      const x = pyFloat(found[1])
      const row = rows.get(y)
      if (row) row.push([x, text])
      else rows.set(y, [[x, text]])
    }
  }
  return { texts, rows: [...rows.entries()] }
}
