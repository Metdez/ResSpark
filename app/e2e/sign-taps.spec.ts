import { expect, test, type Locator, type Page } from '@playwright/test'
import { EMBED_SRC, mockPortal, SIG_ID } from './portal-mock'

// SIGN-04: the "senior on the phone" budget, measured at 390×844 (playwright.config.ts).
const noSideScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

function counter(page: Page) {
  let taps = 0
  return {
    count: () => taps,
    async tap(l: Locator) {
      taps++
      await l.tap()
      expect(await noSideScroll(page)).toBe(true)
    },
  }
}

const field = (page: Page) => page.locator('docuseal-form [data-testid="signature-field"]')
const signRow = (page: Page) => page.getByRole('button', { name: 'Sign Sign your engagement letter' })
const agree = (page: Page) => page.getByRole('button', { name: 'I agree' })

test('fresh link: first signature field in at most 3 taps, no sideways scroll', async ({ page }) => {
  await mockPortal(page)
  const t = counter(page)
  await page.goto('/c/')
  await t.tap(page.getByRole('button', { name: 'Start' }))
  await t.tap(signRow(page))
  await t.tap(agree(page))
  await expect(field(page)).toBeVisible()
  expect(t.count()).toBeLessThanOrEqual(3)
  expect(await noSideScroll(page)).toBe(true)
})

test('copied signing link: first signature field in at most 2 taps', async ({ page }) => {
  await mockPortal(page)
  const t = counter(page)
  await page.goto(`/c/?step=${SIG_ID}`)
  await t.tap(page.getByRole('button', { name: 'Start' }))
  await t.tap(agree(page))
  await expect(field(page)).toBeVisible()
  expect(t.count()).toBeLessThanOrEqual(2)
  expect(await noSideScroll(page)).toBe(true)
})

test('the consent sheet I agree is on screen without scrolling', async ({ page }) => {
  await mockPortal(page, { opened: true })
  await page.goto(`/c/sign/${SIG_ID}`)
  await expect(agree(page)).toBeInViewport({ ratio: 1 })
  await expect(page.getByRole('dialog').getByRole('listitem')).toHaveCount(5)
})

test('the embed gets the D-13 attributes', async ({ page }) => {
  await mockPortal(page, { opened: true, consented: true })
  await page.goto(`/c/sign/${SIG_ID}`)
  const form = page.locator('docuseal-form')
  await expect(form).toHaveAttribute('data-src', EMBED_SRC)
  await expect(form).toHaveAttribute('data-allow-to-resubmit', 'false')
  await expect(form).toHaveAttribute('data-with-send-copy-button', 'false')
  await expect(form).toHaveAttribute('data-send-copy-email', 'false')
  await expect(form).toHaveAttribute('data-custom-css', /font-size:16px/)
})

test('every input on the signing page, light DOM and the embed, is at least 16 px', async ({ page }) => {
  await mockPortal(page, { opened: true, consented: true })
  await page.goto(`/c/sign/${SIG_ID}`)
  await expect(field(page)).toBeVisible()
  const sizes = await page.evaluate(() => {
    const roots: ParentNode[] = [document, ...[...document.querySelectorAll('docuseal-form')].map((f) => f.shadowRoot!)]
    return roots.flatMap((r) =>
      [...r.querySelectorAll('input, select, textarea')].map((el) => parseFloat(getComputedStyle(el).fontSize))
    )
  })
  expect(sizes.length).toBeGreaterThan(0)
  for (const s of sizes) expect(s).toBeGreaterThanOrEqual(16)
})

test('not configured: the agent will send it another way, no embed', async ({ page }) => {
  // the start mock answers 503 provider_not_configured
  await mockPortal(page, { opened: true, configured: false })
  await page.goto(`/c/sign/${SIG_ID}`)
  await expect(page.getByText('Your agent will send this form another way.')).toBeVisible()
  await expect(page.locator('docuseal-form')).toHaveCount(0)
})

test('completing returns to the steps with Signed. Your agent has it.', async ({ page }) => {
  const calls = await mockPortal(page, { opened: true, consented: true })
  await page.goto(`/c/sign/${SIG_ID}`)
  await expect(field(page)).toBeVisible()
  await page.getByTestId('fake-sign').tap()
  await expect(page.getByText('Signed. Your agent has it.')).toBeVisible()
  await expect(page).toHaveURL(/\/c\/?$/)
  expect(calls).toContain('POST /api/c/connections/C1/reconcile')
})
