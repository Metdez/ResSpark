import {
  button,
  cleanup,
  click,
  postedBody,
  renderWithQuery,
  waitFor,
  type Reply,
} from '@/test-utils/query-render'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import { RequestLinkActions } from './request-link-actions'
import type { RequestDetail } from './requests-api'

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const SENT: RequestDetail = {
  id: 'r1',
  status: 'sent',
  template_name: 'Standard resolution packet',
  agent_display_name: 'Avery Agent',
  contact_email: 'jordan.rivera@example.com',
  contact_phone_e164: '+15550100001',
  sent_at: '2026-10-10T12:00:00Z',
  opened_at: null,
  created_at: '2026-10-10T11:00:00Z',
  case: {
    case_id: 'c1',
    logics_case_id: 900001,
    first_name: 'Jordan',
    last_name: 'Rivera',
    email: 'jordan.rivera@example.com',
    phone_e164: '+15550100001',
  },
  items: [],
  link: {
    url: 'https://x/c/tok',
    version: 1,
    expires_at: '2026-10-24T15:00:00Z',
    revoked_at: null,
    opened_at: null,
  },
}

const P = '/api/admin/requests/r1'
const CONSENT_LABEL =
  'Client agreed on this call to receive a text at (•••) •••-0001'
let onChanged: Mock<() => void>

async function render(
  replies: Record<string, Reply> = {},
  request: RequestDetail = SENT
) {
  onChanged = vi.fn<() => void>()
  return renderWithQuery(
    <RequestLinkActions request={request} onChanged={onChanged} />,
    replies
  )
}
const dialog = () =>
  document.querySelector<HTMLElement>('[role="alertdialog"]') ?? undefined
const checkbox = () =>
  document.querySelector<HTMLButtonElement>('[role="checkbox"]')

describe('RequestLinkActions', () => {
  afterEach(cleanup)

  it('offers Email, Regenerate, Revoke and the SMS consent checkbox', async () => {
    const { el } = await render()
    expect(button('Email link')).toBeDefined()
    expect(button('Regenerate link')).toBeDefined()
    expect(button('Revoke link')).toBeDefined()
    expect(el.textContent).toContain(CONSENT_LABEL)
    expect(checkbox()?.getAttribute('aria-checked')).toBe('false')
  })

  it('posts /email and reads Emailing… while pending', async () => {
    const { el, fetchMock } = await render({ [`POST ${P}/email`]: 'pending' })
    await click(button('Email link')!)
    await waitFor(() => fetchMock.mock.calls.length > 0)
    expect(fetchMock.mock.calls[0][0]).toBe(`${P}/email`)
    expect(el.textContent).toContain('Emailing…')
    expect(button('Emailing…')?.disabled).toBe(true)
  })

  it('shows who the email went to on success', async () => {
    const { el } = await render({
      [`POST ${P}/email`]: { status: 200, body: { ok: true, id: 'em_1' } },
    })
    await click(button('Email link')!)
    await waitFor(() => el.textContent!.includes('Email sent to'))
    expect(el.textContent).toContain('Email sent to jordan.rivera@example.com')
  })

  it('says email is not configured instead of failing', async () => {
    const { el } = await render({
      [`POST ${P}/email`]: {
        status: 200,
        body: { ok: false, reason: 'not_configured' },
      },
    })
    await click(button('Email link')!)
    await waitFor(() => el.textContent!.includes('Email not configured'))
    expect(el.textContent).toContain(
      'Email not configured — copy the link and send it yourself'
    )
  })

  it('says the email failed when the provider refused it', async () => {
    const { el } = await render({
      [`POST ${P}/email`]: {
        status: 200,
        body: { ok: false, reason: 'send_failed' },
      },
    })
    await click(button('Email link')!)
    await waitFor(() => el.textContent!.includes('Email failed'))
    expect(el.textContent).toContain(
      'Email failed — copy the link and send it yourself'
    )
  })

  it('asks before regenerating the link', async () => {
    const { fetchMock } = await render()
    await click(button('Regenerate link')!)
    const d = dialog()!
    expect(d.textContent).toContain('Regenerate this link?')
    expect(d.textContent).toContain(
      'The link you already sent stops working. Copy and send the new one.'
    )
    expect(button('Regenerate link', d)?.className).not.toContain(
      'bg-destructive'
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('regenerates on confirm and reports the change', async () => {
    const { fetchMock } = await render({
      [`POST ${P}/regenerate`]: {
        status: 200,
        body: {
          url: 'https://x/c/new',
          expires_at: '2026-10-25T15:00:00Z',
          version: 2,
        },
      },
    })
    await click(button('Regenerate link')!)
    await click(button('Regenerate link', dialog())!)
    await waitFor(() => onChanged.mock.calls.length > 0)
    expect(postedBody(fetchMock, `${P}/regenerate`)).toEqual({})
    await waitFor(() => !dialog())
  })

  it('asks before revoking with a destructive confirm and focus on Cancel', async () => {
    await render()
    await click(button('Revoke link')!)
    const d = dialog()!
    expect(d.textContent).toContain('Revoke this link?')
    expect(d.textContent).toContain(
      "The client's current link stops working immediately. You can send a new one."
    )
    expect(button('Revoke link', d)?.className).toContain('bg-destructive')
    await waitFor(() => document.activeElement?.textContent === 'Cancel')
  })

  it('closes on Cancel without a request', async () => {
    const { fetchMock } = await render()
    await click(button('Revoke link')!)
    await click(button('Cancel', dialog())!)
    await waitFor(() => !dialog())
    expect(fetchMock).not.toHaveBeenCalled()
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('revokes on confirm and reports the change', async () => {
    const { fetchMock } = await render({
      [`POST ${P}/revoke`]: { status: 200, body: { ok: true } },
    })
    await click(button('Revoke link')!)
    await click(button('Revoke link', dialog())!)
    await waitFor(() => onChanged.mock.calls.length > 0)
    expect(postedBody(fetchMock, `${P}/revoke`)).toEqual({})
  })

  it('explains a 409 from revoke and refetches', async () => {
    const { el } = await render({
      [`POST ${P}/revoke`]: {
        status: 409,
        body: { error: { code: 'request_revoked', message: 'x' } },
      },
    })
    await click(button('Revoke link')!)
    await click(button('Revoke link', dialog())!)
    await waitFor(() =>
      el.textContent!.includes('This link was already changed')
    )
    expect(el.textContent).toContain('Reload the page to see the latest state.')
    expect(onChanged).toHaveBeenCalled()
  })

  it('explains a 409 from regenerate the same way', async () => {
    const { el } = await render({
      [`POST ${P}/regenerate`]: {
        status: 409,
        body: { error: { code: 'request_not_active', message: 'x' } },
      },
    })
    await click(button('Regenerate link')!)
    await click(button('Regenerate link', dialog())!)
    await waitFor(() =>
      el.textContent!.includes('This link was already changed')
    )
    expect(onChanged).toHaveBeenCalled()
  })

  it('records SMS consent once, then locks the checkbox', async () => {
    const { el, fetchMock } = await render({
      [`POST ${P}/consent`]: {
        status: 200,
        body: { ok: true, event_id: 'e1' },
      },
    })
    await click(checkbox()!)
    await waitFor(() => el.textContent!.includes('Recorded'))
    expect(postedBody(fetchMock, `${P}/consent`)).toEqual({ agreed: true })
    expect(checkbox()?.getAttribute('aria-checked')).toBe('true')
    expect(checkbox()?.disabled).toBe(true)
    await click(checkbox()!)
    expect(
      fetchMock.mock.calls.filter(([p]) => p === `${P}/consent`)
    ).toHaveLength(1)
  })

  it('shows only the consent control once the link is revoked', async () => {
    const { el } = await render({}, { ...SENT, status: 'revoked' })
    expect(button('Email link')).toBeUndefined()
    expect(button('Regenerate link')).toBeUndefined()
    expect(button('Revoke link')).toBeUndefined()
    expect(el.textContent).toContain(CONSENT_LABEL)
  })

  it('omits the consent control when no phone is on file', async () => {
    const { el } = await render(
      {},
      {
        ...SENT,
        contact_phone_e164: null,
        case: { ...SENT.case, phone_e164: null },
      }
    )
    expect(el.textContent).not.toContain('receive a text')
    expect(button('Email link')).toBeDefined()
  })
})
