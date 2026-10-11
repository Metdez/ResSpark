import { createFileRoute } from '@tanstack/react-router'
import { SignPage } from '@/features/client-portal/sign/sign-page'

// D-14: full-bleed signing page, outside the client card.
export const Route = createFileRoute('/c/sign/$itemId')({
  component: function SignRoute() {
    return <SignPage itemId={Route.useParams().itemId} />
  },
})
