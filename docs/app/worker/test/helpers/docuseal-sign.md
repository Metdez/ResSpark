# `app/worker/test/helpers/docuseal-sign.ts`

`signDocuseal(raw, secret, ts?)`: produces the `X-Docuseal-Signature` value DocuSeal would send for `raw`: `<ts>.` followed by the hex HMAC-SHA256 of `<ts>.<raw>` under the secret. `ts` defaults to the current Unix time in seconds; tests pass an older or future `ts` to exercise the 300-second window. Tests sign the same string they post, so any byte change fails verification.
