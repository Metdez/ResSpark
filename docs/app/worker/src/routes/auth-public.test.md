# `app/worker/src/routes/auth-public.test.ts`

Route tests with `accounts/service` and the email module mocked. The rate-limit window is reset before each test.

- **Sign-up:**
  - Normalized input reaches `signUpFirm`, and the answer is `no-store`.
  - Each invalid field returns its own 400 code without calling the service.
  - `email_exists` returns 409.
  - A `text/plain` post returns 415.
  - The 21st call in a minute from one IP returns 429.
- **Invites:**
  - An open invite is described; anything else returns 404 `invite_invalid`.
  - Accept returns the email.
  - A closed invite returns 404, and a weak password returns 400.
- **Forgot password:**
  - Sends the link when an account exists.
  - An unknown email gets the same 200 and nothing is sent.
  - The fourth request for one address within 15 minutes builds no link.
