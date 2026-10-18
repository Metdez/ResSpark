# `app/src/features/client-portal/connect/provider-mark.test.tsx`

Renders `ProviderMark` through `renderWithQuery` and reads `[data-provider-mark]`.

1. `id='plaid'`: the mark reads "Secure connection powered by Plaid" and its `svg` is `aria-hidden="true"`.
2. `id={null}`: no mark and an empty container.
