import { describe, expect, it } from 'vitest'
import { actionLabel } from './labels'

describe('actionLabel', () => {
  it.each([
    ['request.sent', {}, 'Sent the link'],
    ['request.opened', {}, 'Client opened the link'],
    ['request.email_sent', {}, 'Emailed the link'],
    ['case.looked_up', {}, 'Looked up the case'],
    ['staff.signed_in', {}, 'Signed in'],
    ['address.confirmed', { verified: true }, 'Client confirmed their address'],
    ['address.confirmed', { verified: false }, 'Client entered their address (unverified)'],
    ['document.uploaded', { mime_type: 'application/pdf' }, 'Client uploaded a PDF'],
    ['document.uploaded', { mime_type: 'image/jpeg' }, 'Client uploaded a photo'],
    ['item.approved', { label: 'ID' }, 'Approved ID'],
    ['item.rejected', { label: 'ID', note: 'blurry' }, 'Rejected ID — blurry'],
    ['item.rejected', { label: 'ID' }, 'Rejected ID'],
    ['document.viewed', { disposition: 'attachment' }, 'Downloaded a file'],
    ['document.viewed', { disposition: 'inline' }, 'Previewed a file'],
    ['provider.plaid.item_added', {}, 'provider plaid item added'],
  ])('%s %o → %s', (action, payload, label) => {
    expect(actionLabel(action, payload)).toBe(label)
  })

  it('never interpolates a non-string payload value', () => {
    expect(actionLabel('item.approved', { label: { evil: 1 } })).toBe('Approved an item')
  })
})
