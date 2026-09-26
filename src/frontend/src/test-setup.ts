import { vi } from "vitest";

vi.mock("@material/web/select/outlined-select.js", () => {
  class TestOutlinedSelect extends HTMLElement {
    private selectedValue = "";

    connectedCallback(): void {
      this.selectedValue = this.querySelector("md-select-option[selected]")?.getAttribute("value") ?? "";
    }

    get value(): string {
      return this.selectedValue;
    }

    set value(value: string) {
      this.selectedValue = value;
      this.querySelectorAll("md-select-option").forEach((option) => {
        option.toggleAttribute("selected", option.getAttribute("value") === value);
      });
    }
  }

  if (!customElements.get("md-outlined-select")) {
    customElements.define("md-outlined-select", TestOutlinedSelect);
  }
  return { MdOutlinedSelect: TestOutlinedSelect };
});

vi.mock("@material/web/select/select-option.js", () => ({}));
