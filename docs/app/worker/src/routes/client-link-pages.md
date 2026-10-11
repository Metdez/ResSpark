# `app/worker/src/routes/client-link-pages.ts`

The two static HTML pages the Worker serves on `/c/:token` (UI-SPEC S7).

| Export | Status | Heading | Body |
|--------|--------|---------|------|
| `INVALID_LINK_HTML` | 404 | This link isn't active | It may have expired or been replaced with a new one. Ask your agent for a new link. |
| `RATE_LIMITED_HTML` | 429 | Too many attempts | Wait a minute and open the link from your message again. |

## `page(title, heading, body)`

Builds a complete HTML document from three constant strings:

- `<meta name="viewport">` for phones and `<meta name="robots" content="noindex">` as a backup to the `X-Robots-Tag` header.
- One inline `<style>` with the S7 tokens: body `#f8fafc`, text `#0f172a`, muted `#64748b`, card `#ffffff` with a 1 px `#e2e8f0` border, 10 px radius and 24 px padding, a `max-width: 30rem` column with 64 px top padding, 16 px / 1.5 body text, 20 px / 600 heading, and the A-3 font stack with no webfont request.
- No `<script>`, no external stylesheet, no link, and no request data. Both pages are built once at module load, so every failure returns byte-identical bytes.

The invalid-link wording is identical to the SPA fallback in `app/src/features/client-link/invalid-link-page.tsx` (PORT-06).
