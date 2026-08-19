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
      reason: `azione bloccata dal guardrail: "${label.trim()}" sembra un'azione distruttiva`,
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
          reason: `azione bloccata dal guardrail: link esterno verso ${target.origin}`,
        };
      }
    } catch {
      // href relativo o non valido: consentito
    }
  }

  if (tag === "input" && el.type === "password") {
    return { allowed: false, reason: "azione bloccata dal guardrail: campo password" };
  }

  if (tag === "input" && el.type === "email" && el.formHasPasswordField) {
    return {
      allowed: false,
      reason: "azione bloccata dal guardrail: campo email in un form di login/signup",
    };
  }

  if (el.type === "submit" && el.formHasSensitiveField) {
    return {
      allowed: false,
      reason: "azione bloccata dal guardrail: submit di un form con campi sensibili",
    };
  }

  return { allowed: true };
}
