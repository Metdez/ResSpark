import { describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '@/lib/api'
import {
  emailLink,
  isCaseInfo,
  isRequestDetail,
  isRequestList,
  isSendResult,
  isTemplates,
  sendErrorExtras,
} from './requests-api'

vi.mock('@/lib/api', async (orig) => ({ ...(await orig<typeof import('@/lib/api')>()), api: vi.fn() }))

const DETAIL = {
  id: 'r1',
  firm_id: 'f1',
  status: 'draft',
  template_name: 'Standard resolution packet',
  agent_display_name: 'Avery Agent',
  contact_email: null,
  contact_phone_e164: null,
  sent_at: null,
  opened_at: null,
  created_at: '2026-10-11T12:00:00Z',
  case: {
    case_id: 'c1',
    logics_case_id: 900001,
    first_name: 'Jordan',
    last_name: 'Rivera',
    email: 'jordan.rivera@example.com',
    phone_e164: '+15550100001',
  },
  items: [
    {
      id: 'i1',
      position: 1,
      kind: 'bank_connect',
      label: 'Connect your bank',
      required: true,
      status: 'pending',
      config: {},
      rejection_note: null,
    },
  ],
  link: null,
}

describe('guards', () => {
  it('isRequestDetail accepts the documented shape', () => {
    expect(isRequestDetail(DETAIL)).toBe(true)
    expect(
      isRequestDetail({
        ...DETAIL,
        link: {
          url: 'https://x/c/t',
          version: 1,
          expires_at: '2026-10-24T15:00:00Z',
          revoked_at: null,
          opened_at: null,
        },
      })
    ).toBe(true)
  })

  it('isRequestDetail rejects a missing items array or a non-string status', () => {
    const { items: _items, ...noItems } = DETAIL
    expect(isRequestDetail(noItems)).toBe(false)
    expect(isRequestDetail({ ...DETAIL, status: 3 })).toBe(false)
  })

  it('isSendResult requires string url and expires_at and a number version', () => {
    expect(
      isSendResult({ url: 'u', expires_at: '2026-10-24T15:00:00Z', version: 1 })
    ).toBe(true)
    expect(isSendResult({ url: 'u', expires_at: 'e', version: '1' })).toBe(
      false
    )
    expect(isSendResult({ expires_at: 'e', version: 1 })).toBe(false)
  })

  it('isCaseInfo takes an optional requests list and rejects a bad row', () => {
    const row = {
      id: 'r7',
      status: 'sent',
      agent_display_name: 'Avery Agent',
      sent_at: '2026-10-12T10:00:00Z',
      created_at: '2026-10-12T09:00:00Z',
    }
    expect(isCaseInfo(DETAIL.case)).toBe(true)
    expect(isCaseInfo({ ...DETAIL.case, requests: [] })).toBe(true)
    expect(isCaseInfo({ ...DETAIL.case, requests: [row] })).toBe(true)
    expect(
      isCaseInfo({ ...DETAIL.case, requests: [{ ...row, created_at: null }] })
    ).toBe(false)
    expect(isCaseInfo({ ...DETAIL.case, requests: 'none' })).toBe(false)
  })

  it('isRequestList needs agent_display_name as a string or null', () => {
    const row = {
      id: 'r1',
      status: 'sent',
      client_name: 'Ann Lee',
      agent_display_name: 'Zack',
      sent_at: null,
      expires_at: null,
      created_at: '2026-10-12T09:00:00Z',
    }
    expect(isRequestList({ requests: [row] })).toBe(true)
    expect(
      isRequestList({ requests: [{ ...row, agent_display_name: null }] })
    ).toBe(true)
    const { agent_display_name: _agent, ...noAgent } = row
    expect(isRequestList({ requests: [noAgent] })).toBe(false)
  })

  it('isTemplates requires an items array on every template', () => {
    expect(
      isTemplates({ templates: [{ id: 't', name: 'n', items: [] }] })
    ).toBe(true)
    expect(isTemplates({ templates: [{ id: 't', name: 'n' }] })).toBe(false)
  })
})

describe('sendErrorExtras', () => {
  it('reads the 409 extras from ApiError.body', () => {
    const err = new ApiError(409, 'contact_flagged', 'x', {
      error: { code: 'contact_flagged', message: 'x' },
      email_suggestion: 'a@gmail.com',
      differs: ['email'],
    })
    expect(sendErrorExtras(err)).toEqual({
      email_suggestion: 'a@gmail.com',
      differs: ['email'],
    })
  })

  it('returns {} when there is no body', () => {
    expect(sendErrorExtras(new ApiError(500, 'internal', 'x'))).toEqual({})
  })

  it('drops differs entries outside email|phone and reads field errors and changed', () => {
    const err = new ApiError(400, 'contact_invalid', 'x', {
      email_error: 'bad',
      phone_error: 'bad phone',
      differs: ['email', 'name', 3],
      changed: ['first_name', 7],
    })
    expect(sendErrorExtras(err)).toEqual({
      email_error: 'bad',
      phone_error: 'bad phone',
      differs: ['email'],
      changed: ['first_name'],
    })
  })
})

describe('emailLink', () => {
  const body = () => JSON.parse(String((vi.mocked(api).mock.lastCall![1] as RequestInit).body))

  it('sends the step in the JSON body (D-17)', () => {
    void emailLink('r1', 's1')
    expect(vi.mocked(api).mock.lastCall![0]).toBe('/api/admin/requests/r1/email')
    expect(body()).toEqual({ step: 's1' })
  })

  it('sends an empty body without a step (Phase 2 behavior)', () => {
    void emailLink('r1')
    expect(body()).toEqual({})
  })
})
