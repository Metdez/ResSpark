// Stands in for https://cdn.docuseal.com/js/form.js: a <docuseal-form> with an open shadow root, like
// the real one. It applies data-custom-css, so the 16 px check measures our customCss, not this file.
export const FAKE_FORM_JS = `
customElements.define('docuseal-form', class extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return
    const root = this.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = this.dataset.customCss || ''
    const label = document.createElement('label')
    label.textContent = 'Signature '
    const input = document.createElement('input')
    input.dataset.testid = 'signature-field'
    label.append(input)
    const sign = document.createElement('button')
    sign.type = 'button'
    sign.dataset.testid = 'fake-sign'
    sign.textContent = 'Sign'
    sign.addEventListener('click', () => this.dispatchEvent(new CustomEvent('completed', { detail: {} })))
    root.append(style, label, sign)
  }
})
`
