import type { Page } from "playwright";
import { runA11yAudit, type A11yIssue } from "../audit/a11y.js";
import { collectVisualIssues, type VisualIssue } from "../audit/visualChecks.js";
import { getSession } from "../session.js";

export interface OpenPageOptions {
  url: string;
  viewport?: { width: number; height: number };
}

export interface InteractiveElement {
  selector: string;
  tagName: string;
  text: string;
  href?: string;
}

export interface OpenPageResult {
  url: string;
  screenshotBase64: string;
  consoleMessages: { type: string; text: string }[];
  failedRequests: { url: string; status: number | null; errorText?: string }[];
  a11yIssues: A11yIssue[];
  visualIssues: VisualIssue[];
  interactiveElements: InteractiveElement[];
}

export async function openPage(options: OpenPageOptions): Promise<OpenPageResult> {
  const session = getSession();
  const page = await session.getPage();
  const viewport = options.viewport ?? { width: 1280, height: 800 };
  await page.setViewportSize(viewport);

  const consoleMessages: OpenPageResult["consoleMessages"] = [];
  const failedRequests: OpenPageResult["failedRequests"] = [];

  // Remove listeners left by a previous openPage() call on this same session page
  // (the session's Page is reused across calls) so they don't stack up and keep
  // pushing into stale, already-returned arrays.
  page.removeAllListeners("console");
  page.removeAllListeners("requestfailed");
  page.removeAllListeners("response");

  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      consoleMessages.push({ type: msg.type(), text: msg.text() });
    }
  });
  page.on("requestfailed", (req) => {
    failedRequests.push({ url: req.url(), status: null, errorText: req.failure()?.errorText });
  });
  page.on("response", (res) => {
    if (res.status() >= 400) {
      failedRequests.push({ url: res.url(), status: res.status() });
    }
  });

  try {
    await page.goto(options.url, { waitUntil: "load" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Eyes: navigazione a ${options.url} fallita: ${message}`);
  }

  const screenshotBuffer = await page.screenshot();
  const [a11yIssues, visualIssues, interactiveElements] = await Promise.all([
    runA11yAudit(page),
    collectVisualIssues(page),
    collectInteractiveElements(page),
  ]);

  return {
    url: page.url(),
    screenshotBase64: screenshotBuffer.toString("base64"),
    consoleMessages,
    failedRequests,
    a11yIssues,
    visualIssues,
    interactiveElements,
  };
}

async function collectInteractiveElements(page: Page): Promise<InteractiveElement[]> {
  return page.$$eval("a, button, input, select, textarea", (elements) =>
    elements.slice(0, 50).map((el, i) => {
      el.setAttribute("data-eyes-id", String(i));
      const tagName = el.tagName.toLowerCase();
      const text = (el.textContent || (el as HTMLInputElement).value || "").trim().slice(0, 80);
      const href = el.getAttribute("href") ?? undefined;
      return { selector: `[data-eyes-id="${i}"]`, tagName, text, href };
    })
  );
}
