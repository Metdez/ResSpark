import { createFileRoute } from '@tanstack/react-router'
import { ReturnPage } from '@/features/client-portal/connect/return-page'

// The Worker redeems the bank's ?nonce= and redirects here; a static segment wins over $token.
export const Route = createFileRoute('/c/return')({
  component: ReturnPage,
})
