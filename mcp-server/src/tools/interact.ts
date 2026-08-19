import type { Page } from "playwright";
import { checkGuardrail, type ElementDescriptor } from "../guardrails.js";
import { getSession } from "../session.js";

export interface InteractOptions {
  selector: string;
  value?: string;
}

export interface InteractResult {
  performed: boolean;
  reason?: string;
}

export async function clickElement(options: InteractOptions): Promise<InteractResult> {
  const session = getSession();
  const page = await session.getPage();
  const descriptor = await describeElement(page, options.selector);
  const guard = checkGuardrail(descriptor);
  if (!guard.allowed) {
    return { performed: false, reason: guard.reason };
  }
  await page.click(options.selector);
  return { performed: true };
}

export async function fillElement(options: InteractOptions): Promise<InteractResult> {
  const session = getSession();
  const page = await session.getPage();
  const descriptor = await describeElement(page, options.selector);
  const guard = checkGuardrail(descriptor);
  if (!guard.allowed) {
    return { performed: false, reason: guard.reason };
  }
  await page.fill(options.selector, options.value ?? "");
  return { performed: true };
}

async function describeElement(page: Page, selector: string): Promise<ElementDescriptor> {
  return page.$eval(selector, (el) => {
    const form = el.closest("form");
    const formHasPasswordField = !!form?.querySelector('input[type="password"]');
    return {
      tagName: el.tagName,
      text: el.textContent?.trim() ?? "",
      ariaLabel: el.getAttribute("aria-label") ?? undefined,
      name: el.getAttribute("name") ?? undefined,
      id: el.getAttribute("id") ?? undefined,
      href: el.getAttribute("href") ?? undefined,
      type: el.getAttribute("type") ?? undefined,
      currentOrigin: window.location.origin,
      formHasPasswordField,
      formHasSensitiveField: formHasPasswordField,
    };
  });
}
