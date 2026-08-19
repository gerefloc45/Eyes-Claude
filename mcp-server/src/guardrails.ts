const DESTRUCTIVE_PATTERN =
  /delete|elimina|cancella|remove|rimuovi|pay|paga|checkout|purchase|acquista|logout.*all|unsubscribe|disdici/i;

export interface ElementDescriptor {
  tagName: string;
  text?: string;
  ariaLabel?: string;
  name?: string;
  id?: string;
  href?: string;
  type?: string;
  currentOrigin: string;
  formHasPasswordField?: boolean;
  formHasSensitiveField?: boolean;
}

export interface GuardrailResult {
  allowed: boolean;
  reason?: string;
}

export function checkGuardrail(el: ElementDescriptor): GuardrailResult {
  const label = [el.text, el.ariaLabel, el.name, el.id].filter(Boolean).join(" ");
  if (DESTRUCTIVE_PATTERN.test(label)) {
    return {
      allowed: false,
      reason: `action blocked by the guardrail: "${label.trim()}" looks like a destructive action`,
    };
  }

  const tag = el.tagName.toLowerCase();

  if (tag === "a" && el.href) {
    try {
      const target = new URL(el.href, el.currentOrigin);
      const current = new URL(el.currentOrigin);
      if (target.origin !== current.origin) {
        return {
          allowed: false,
          reason: `action blocked by the guardrail: external link to ${target.origin}`,
        };
      }
    } catch {
      // relative or invalid href: allowed
    }
  }

  if (tag === "input" && el.type === "password") {
    return { allowed: false, reason: "action blocked by the guardrail: password field" };
  }

  if (tag === "input" && el.type === "email" && el.formHasPasswordField) {
    return {
      allowed: false,
      reason: "action blocked by the guardrail: email field in a login/signup form",
    };
  }

  if (el.type === "submit" && el.formHasSensitiveField) {
    return {
      allowed: false,
      reason: "action blocked by the guardrail: submitting a form with sensitive fields",
    };
  }

  return { allowed: true };
}
