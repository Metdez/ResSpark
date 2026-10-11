import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createSubmission, getSubmission, getSubmitter, getTemplate, listTemplates } from '../src/integrations/esign/docuseal'

// Opt-in contract check against DocuSeal Test Mode (RESEARCH A3): the real POST /submissions array
// response, ISO 8601 `expire_at`, and the embed_src host. Test Mode submissions are free; no cleanup.
const { DOCUSEAL_API_KEY, DOCUSEAL_CONTRACT_TEMPLATE_ID, DOCUSEAL_API_URL } = process.env
const templateId = Number(DOCUSEAL_CONTRACT_TEMPLATE_ID)
const live = Boolean(DOCUSEAL_API_KEY && Number.isInteger(templateId) && templateId > 0)
// eslint-disable-next-line no-console -- the skip reason must be visible in the run output
if (!live) console.warn('docuseal contract skipped: missing DOCUSEAL_API_KEY or DOCUSEAL_CONTRACT_TEMPLATE_ID')

const env = { DOCUSEAL_API_KEY, DOCUSEAL_API_URL: DOCUSEAL_API_URL ?? 'https://api.docuseal.com' } as Env
// eslint-disable-next-line no-console -- ids and statuses only; never a slug, URL or key
const report = (line: string) => console.info(`docuseal contract: ${line}`)

describe.skipIf(!live)('DocuSeal Test Mode contract (live; needs DOCUSEAL_API_KEY, DOCUSEAL_CONTRACT_TEMPLATE_ID)', () => {
  it('lists, reads, creates with ISO expire_at, and reads back a pending submission', { timeout: 30_000 }, async () => {
    expect((await listTemplates(env)).some((t) => t.id === templateId)).toBe(true)
    const template = await getTemplate(env, templateId)
    expect(template.submitters).toHaveLength(1)
    report(`template ${templateId} has 1 submitter role`)

    const created = await createSubmission(env, {
      template_id: templateId,
      send_email: false,
      send_sms: false,
      expire_at: new Date(Date.now() + 86_400_000).toISOString(),
      submitters: [
        {
          role: template.submitters[0].name,
          name: 'Contract Test',
          email: 'contract.test@example.com',
          external_id: randomUUID(),
          send_email: false,
        },
      ],
    })
    expect(Array.isArray(created)).toBe(true)
    const [first] = created
    expect(typeof first.submission_id).toBe('number')
    expect(typeof first.slug).toBe('string')
    expect(first.embed_src.startsWith('https://docuseal.com/s/')).toBe(true)
    report(`created submission ${first.submission_id} submitter ${first.id} (ISO expire_at accepted)`)

    expect((await getSubmitter(env, first.id)).slug).toBe(first.slug)
    const submission = await getSubmission(env, first.submission_id)
    expect(submission.status).toBe('pending')
    report(`submission ${submission.id} status ${submission.status}`)
  })
})
