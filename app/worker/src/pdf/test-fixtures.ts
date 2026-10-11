import {
  PDFDict,
  PDFDocument,
  PDFName,
  type PDFPage,
  PDFStream,
} from '@cantoo/pdf-lib'

const PAD = PDFName.of('RsPad')

function randomPad(size: number, index: number): Uint8Array {
  const pad = new Uint8Array(Math.max(size, 4))
  for (let at = 0; at < pad.length; at += 65_536) {
    crypto.getRandomValues(pad.subarray(at, at + 65_536))
  }
  new DataView(pad.buffer).setUint32(0, index)
  return pad
}

export async function makeMultiPagePdf(
  pages: number,
  bytesPerPage: number | ((index: number) => number)
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) {
    const size =
      typeof bytesPerPage === 'number' ? bytesPerPage : bytesPerPage(i)
    const ref = doc.context.register(doc.context.stream(randomPad(size, i)))
    doc.addPage([612, 792]).node.setXObject(PAD, ref)
  }
  return doc.save({ useObjectStreams: false })
}

export async function makeOversizedPagePdf(bytes: number): Promise<Uint8Array> {
  return makeMultiPagePdf(1, bytes)
}

export async function makeEncryptedPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.addPage([612, 792])
  doc.encrypt({ userPassword: 'secret', ownerPassword: 'owner' })
  return doc.save()
}

export function readPadIndex(page: PDFPage): number {
  const xobjects = page.node.Resources()?.lookup(PDFName.of('XObject'), PDFDict)
  const pad = xobjects?.lookup(PAD, PDFStream)
  if (!pad) throw new Error('fixture page has no pad')
  const { buffer, byteOffset } = pad.getContents()
  return new DataView(buffer, byteOffset).getUint32(0)
}

const fromHex = (hex: string) =>
  Uint8Array.from(hex.match(/../g)!, (byte) => parseInt(byte, 16))

// 1x1 grayscale baseline (SOF0) JPEG, 332 bytes.
export const TINY_JPEG = fromHex(
  'ffd8ffe000104a46494600010100000100010000ffdb004300100b0c0e0c0a100e0d0e1211101318281a181616183123251d283a333d3c3933383740485c4e404457453738506d51575f626768673e4d71797064785c656763ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffda0008010100003f00f40affd9'
)

// 1x1 8-bit grayscale PNG with valid CRCs, 67 bytes.
export const TINY_PNG = fromHex(
  '89504e470d0a1a0a0000000d49484452000000010000000108000000003a7e9b550000000a49444154789c63f80f0001010100b138f6140000000049454e44ae426082'
)

// 00 00 00 18 'ftypheic': the ISO-BMFF box header an iPhone HEIC starts with.
export const HEIC_STUB = new Uint8Array([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
])
