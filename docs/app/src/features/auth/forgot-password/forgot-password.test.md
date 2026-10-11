# `app/src/features/auth/forgot-password/forgot-password.test.tsx`

Submits an email and checks that:
- the request body is `{ email }`;
- the page switches to "Check your email" with the neutral "If an account exists for …" wording;
- the Settings → Team fallback is mentioned.
