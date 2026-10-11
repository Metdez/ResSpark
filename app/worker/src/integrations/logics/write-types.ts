import { z } from 'zod'

// 5.5 MiB (D-05): below both readings of the vendor's "6 MB" limit, 6,000,000 (SI) and
// 6,291,456 (MiB), with room for ~300 bytes of multipart framing.
export const LOGICS_MAX_PART_BYTES = 5_767_168

// Every Logics write ends in one of three outcomes; `unknown` means the request may have been
// dispatched and nobody can tell whether Logics stored it (PUSH-04).
export type DocResult =
  | { kind: 'sent'; logicsDocumentId: number }
  | { kind: 'failed'; status: number; code: string }
  | { kind: 'unknown'; code: string }

export type ActivityResult =
  | { kind: 'sent'; activityId: number }
  | { kind: 'failed'; status: number; code: string }
  | { kind: 'unknown'; code: string }

// The only proof of success (Pitfall 2): `message` is never read.
const CaseDocumentCreated = z.object({
  Success: z.literal(true),
  data: z.object({ CaseDocumentID: z.number().int() }),
})
const ActivityCreated = z.object({
  Success: z.literal(true),
  data: z.object({ ActivityID: z.number().int() }),
})

export const isCaseDocumentCreated = (x: unknown): x is z.infer<typeof CaseDocumentCreated> =>
  CaseDocumentCreated.safeParse(x).success
export const isActivityCreated = (x: unknown): x is z.infer<typeof ActivityCreated> =>
  ActivityCreated.safeParse(x).success

export interface LogicsWriteClient {
  createCaseDocument(p: {
    caseId: number
    comment: string
    fileCategoryId?: number
    fileName: string
    bytes: Uint8Array
  }): Promise<DocResult>
  createActivity(p: { caseId: number; activityType: string; subject: string; comment: string }): Promise<ActivityResult>
  listActivities(caseId: number): Promise<{ activityTypes: string[] } | { kind: 'failed'; status: number }>
}

export interface FakeWriteOptions {
  outcome?: 'sent' | 'unknown' | 'auth' | 'scope' | 'rejected'
  delayMs?: number
}
