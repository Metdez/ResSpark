// Static pages for GET /c/:token (UI-SPEC S7). No script, no external CSS, no font request,
// and no interpolation: nothing request-specific can ever reach the body.
const page = (title: string, heading: string, body: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<style>
body { margin: 0; background: #f8fafc; color: #0f172a; font: 16px/1.5 Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 30rem; margin: 0 auto; padding: 64px 16px 32px; }
.card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 24px; }
h1 { margin: 0 0 8px; font-size: 20px; font-weight: 600; line-height: 1.25; }
p { margin: 0; color: #64748b; }
</style>
</head>
<body>
<main><div class="card"><h1>${heading}</h1><p>${body}</p></div></main>
</body>
</html>
`

export const INVALID_LINK_HTML = page(
  'Link not active',
  "This link isn't active",
  'It may have expired or been replaced with a new one. Ask your agent for a new link.'
)

export const RATE_LIMITED_HTML = page(
  'Too many attempts',
  'Too many attempts',
  'Wait a minute and open the link from your message again.'
)
