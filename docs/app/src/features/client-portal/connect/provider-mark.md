# `app/src/features/client-portal/connect/provider-mark.tsx`

`ProviderMark({ id })`: the one-line provider trust line the bank and payroll sheets show under their message. Added for the Oct 12 2026 ValorTax call: "I would want Plaid's logo or Truv's logo where it's more clear to the client." Text only (nominative use of the name); no logo assets, so there is no trademark artwork to manage.

## Props

| Prop | Type | Meaning |
| --- | --- | --- |
| `id` | `'plaid' \| 'truv' \| 'teller' \| null \| undefined` | `ItemConnection.provider.id` as the Worker sends it |

## What renders

| `id` | Output |
| --- | --- |
| `plaid` | Secure connection powered by Plaid |
| `truv` | Secure connection powered by Truv |
| `teller` | Secure connection powered by Teller |
| `null`, `undefined`, or any other value | nothing (`null`) |

Markup: `<p data-provider-mark class="flex items-center gap-1.5 text-sm text-muted-foreground">` with a lucide `ShieldCheck` (`size-4 shrink-0`, `aria-hidden`) followed by `CONNECT_COPY.poweredBy(name)`. The icon is decorative; the sentence carries the meaning.

## Why it does not break D-11

D-11 says the sheets branch only on `provider.capabilities`, never on which provider is behind them, so Teller can replace Plaid without touching the sheets. That still holds: `provider.id` feeds this display name and nothing else. `BankStep` and `PayrollStep` render the mark when `data && !isError && !notConfigured`; the choice of connect button, intro copy, and month cells is unchanged.

## Tests

`provider-mark.test.tsx`: `plaid` renders the Plaid sentence with an `aria-hidden` icon; `null` renders nothing. The sheets' own tests check the Plaid and Truv lines in place (`bank-step.test.md`, `payroll-step.test.md`).
