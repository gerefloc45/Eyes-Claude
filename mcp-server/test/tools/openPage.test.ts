import { describe, it, expect, afterEach } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { openPage } from "../../src/tools/openPage.js";
import { getSession, resetSessionForTests } from "../../src/session.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureUrl = `file://${join(here, "..", "fixtures", "open-page.html")}`;

afterEach(async () => {
  await getSession().teardown();
  resetSessionForTests();
});

describe("openPage", () => {
  it("returns a screenshot, console errors, failed requests and interactive elements", async () => {
    const result = await openPage({ url: fixtureUrl });

    expect(result.screenshotBase64.length).toBeGreaterThan(0);
    expect(result.consoleMessages.some((m) => m.text.includes("errore di test"))).toBe(true);
    expect(result.failedRequests.some((r) => r.url.includes("does-not-exist.png"))).toBe(true);
    expect(result.interactiveElements.some((el) => el.tagName === "button")).toBe(true);
    expect(result.interactiveElements.some((el) => el.tagName === "a")).toBe(true);
    expect(Array.isArray(result.a11yIssues)).toBe(true);
    expect(Array.isArray(result.visualIssues)).toBe(true);
  });

  it("assigns a stable selector that can be used to find the element again", async () => {
    const result = await openPage({ url: fixtureUrl });
    const button = result.interactiveElements.find((el) => el.tagName === "button");
    expect(button?.selector).toMatch(/data-eyes-id/);

    const page = await getSession().getPage();
    const count = await page.locator(button!.selector).count();
    expect(count).toBe(1);
  });
});
