import { describe, it, expect } from "vitest";
import { checkGuardrail, type ElementDescriptor } from "../src/guardrails.js";

function baseEl(overrides: Partial<ElementDescriptor> = {}): ElementDescriptor {
  return {
    tagName: "button",
    text: "Salva",
    currentOrigin: "http://localhost:3000",
    ...overrides,
  };
}

describe("checkGuardrail", () => {
  it("allows a harmless button", () => {
    expect(checkGuardrail(baseEl()).allowed).toBe(true);
  });

  it("blocks a delete button by text", () => {
    const result = checkGuardrail(baseEl({ text: "Elimina account" }));
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/distruttiv/);
  });

  it("blocks a pay button by aria-label", () => {
    const result = checkGuardrail(baseEl({ text: "", ariaLabel: "Pay now" }));
    expect(result.allowed).toBe(false);
  });

  it("blocks a link to an external origin", () => {
    const result = checkGuardrail(
      baseEl({ tagName: "a", text: "Visita", href: "https://external.example.com/page" })
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/link esterno/);
  });

  it("allows a link to the same origin", () => {
    const result = checkGuardrail(
      baseEl({ tagName: "a", text: "Prodotti", href: "http://localhost:3000/prodotti" })
    );
    expect(result.allowed).toBe(true);
  });

  it("blocks a password input", () => {
    const result = checkGuardrail(baseEl({ tagName: "input", text: "", type: "password" }));
    expect(result.allowed).toBe(false);
  });

  it("blocks an email input when the form also has a password field", () => {
    const result = checkGuardrail(
      baseEl({ tagName: "input", text: "", type: "email", formHasPasswordField: true })
    );
    expect(result.allowed).toBe(false);
  });

  it("allows an email input when the form has no password field", () => {
    const result = checkGuardrail(
      baseEl({ tagName: "input", text: "", type: "email", formHasPasswordField: false })
    );
    expect(result.allowed).toBe(true);
  });

  it("blocks a submit button when the form has a sensitive field", () => {
    const result = checkGuardrail(
      baseEl({ tagName: "input", text: "", type: "submit", formHasSensitiveField: true })
    );
    expect(result.allowed).toBe(false);
  });
});
