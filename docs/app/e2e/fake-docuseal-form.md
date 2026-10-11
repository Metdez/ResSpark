# `app/e2e/fake-docuseal-form.ts`

`FAKE_FORM_JS`: the JavaScript source that `e2e/portal-mock.ts` serves in place of `https://cdn.docuseal.com/js/form.js`.

It defines the `docuseal-form` custom element the way the real script does: `connectedCallback` attaches an **open** shadow root (skipped if one exists). Inside it puts:

1. A `<style>` whose text is the host's `data-custom-css` attribute. So when the spec measures font sizes inside the shadow root it measures the effect of our `customCss` (`input,textarea,select{font-size:16px!important}`), not a size hard-coded here. Chromium's default input size is about 13.3 px, so the check fails if `customCss` stops reaching the embed.
2. A label and an `<input data-testid="signature-field">`: the "first signature field" the tap tests wait for.
3. A `<button data-testid="fake-sign">Sign</button>` that dispatches a `completed` `CustomEvent` on the host element, which `@docuseal/react` turns into `onComplete`.

The element is upgraded after React has rendered `<docuseal-form>`, as with the real script, so the wrapper's event listener on that element still receives the event.

It is a string, not a module, because it runs in the browser page, not in the Playwright test process.
