// Text helpers for the worksheet PDF. Standard fonts encode WinAnsi (Windows-1252) only (RESEARCH Pattern 6).

// The 27 printable Windows-1252 characters in 0x80-0x9F.
const CP1252_SPECIALS = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ')

// Characters outside Windows-1252 become '?'; control characters (tabs, newlines) become a space.
export function toWinAnsi(s: string): string {
  let out = ''
  for (const ch of s.normalize('NFC')) {
    const c = ch.codePointAt(0) as number
    if (c < 0x20 || (c >= 0x7f && c < 0xa0 && !CP1252_SPECIALS.has(ch))) out += ' '
    else if (c <= 0xff || CP1252_SPECIALS.has(ch)) out += ch
    else out += '?'
  }
  return out
}

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export const money = (n: number): string => USD.format(n)
