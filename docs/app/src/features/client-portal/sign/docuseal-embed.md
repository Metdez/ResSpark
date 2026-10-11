# `app/src/features/client-portal/sign/docuseal-embed.tsx`

`DocusealEmbed({ src, onComplete })`: DocuSeal's signing form inside the signing page (D-13, D-14).

## Lazy loading

`DocusealForm` is `React.lazy(() => import('@docuseal/react').then((m) => ({ default: m.DocusealForm })))`. The package exports named components only, so the `then` picks the named export. This is the only file that imports `@docuseal/react` (the plan's verify step counts it), so the wrapper lands in its own chunk and stays out of the client entry chunk. While the chunk loads, `Suspense` shows three `Skeleton` rows with `aria-busy`.

The wrapper then injects `<script id="docuseal-form-script" src="https://cdn.docuseal.com/js/form.js">` once and renders a `<docuseal-form>` custom element with an open shadow root (no iframe). The client CSP allows those hosts (see `worker/src/middleware/client-csp.md`).

## Props and why

| Prop | Value | Why |
|---|---|---|
| `src` | the `embed_src` from `startSigning` | The submitter's own `https://docuseal.com/s/{slug}` page. The caller renders this component only when the prefix matches |
| `withTitle` | `false` | The page has its own header; saves vertical space on a phone |
| `onlyRequiredFields` | `true` | The client only fills what the form needs |
| `withSendCopyButton` | `false` | No DocuSeal email the firm does not track (RESEARCH Pitfall 8, T-06-26) |
| `sendCopyEmail` | `false` | Same: no signed-copy email from DocuSeal |
| `allowToResubmit` | `false` | The default `true` shows a Resubmit button for 14 days that creates an untracked submission (Pitfall 1) |
| `language` | `'en'` | Fixed English, matching the rest of the portal |
| `expand` | `true` | Already the default; passed so the reader sees it |
| `goToLast` | `true` | Already the default; resumes at the last unfilled field |
| `customCss` | `input,textarea,select{font-size:16px!important}` | Our 16 px rule cannot reach the shadow root; inputs under 16 px make iOS Safari zoom on focus (Pitfall 3) |
| `onComplete` | the caller's callback | Fired on the element's `completed` DOM event |

`allowTypedSignature` keeps its default (`true`), so the client can type a signature instead of drawing one.

## Attribute names the wrapper writes (1.0.75)

Read from `node_modules/@docuseal/react/dist/index.esm.js`: `data-src`, `data-with-title`, `data-only-required-fields`, `data-with-send-copy-button`, `data-send-copy-email`, `data-allow-to-resubmit`, `data-language`, `data-expand`, `data-go-to-last`, `data-allow-typed-signature`, `data-custom-css`. Booleans render as the strings `"true"` and `"false"`. The unit and Playwright tests assert these.

## React 19

The package has no peer dependencies and uses only `createElement`, `useRef`, and `useEffect`; it renders under React 19.2 without changes (RESEARCH assumption A5 holds).
