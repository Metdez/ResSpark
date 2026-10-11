// Plaid amounts are positive when money leaves the account, so display flips the sign.
export function formatMoney(amount: number, currency: string | null): string {
  const text = new Intl.NumberFormat('en-US', { style: 'currency', currency: currency ?? 'USD' }).format(Math.abs(amount))
  return amount > 0 ? `−${text}` : amount < 0 ? `+${text}` : text
}
