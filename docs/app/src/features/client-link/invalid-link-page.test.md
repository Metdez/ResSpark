# `app/src/features/client-link/no-link-page.test.tsx`

Component tests for the two client pages, run in the `web` (jsdom) Vitest project. They render with `react-dom/client` and `act`, the same pattern as `features/layout/sandbox-banner.test.tsx`.

| Test | Proves |
|------|--------|
| NoLinkPage shows the placeholder copy | "Nothing to do yet" and the full placeholder sentence. |
| InvalidLinkPage shows the invalid-link copy | The body sentence and "This link isn't active". The apostrophe-free sentence is asserted first because the TAP reporter used for RED evidence escapes apostrophes in failure messages. |
| renders no admin chrome | Neither page contains `nav`, `aside` or `[data-sidebar]`. |
| sets the tab title to the firm name only | `document.title` equals `VITE_APP_NAME ?? 'ResSpark'`. |
| adds a robots noindex meta tag | `<meta name="robots" content="noindex">` is in `<head>`. |

`afterEach` unmounts, removes the container and clears `document.title`, so the title test cannot pass on leftovers.
