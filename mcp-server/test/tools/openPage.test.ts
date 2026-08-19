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
    expect(typeof result.url).toBe("string");
    expect(result.url.length).toBeGreaterThan(0);
    expect(result.url).toMatch(/^file:\/\/.*open-page\.html$/);
    const link = result.interactiveElements.find((el) => el.tagName === "a");
    expect(link?.href).toBeDefined();
  });

  it("assigns a stable selector that can be used to find the element again", async () => {
    const result = await openPage({ url: fixtureUrl });
    const button = result.interactiveElements.find((el) => el.tagName === "button");
    expect(button?.selector).toMatch(/data-eyes-id/);

    const page = await getSession().getPage();
    const count = await page.locator(button!.selector).count();
    expect(count).toBe(1);
  });

  it("does not stack event listeners across repeated calls on the same session page", async () => {
    await openPage({ url: fixtureUrl });
    await openPage({ url: fixtureUrl });

    const page = await getSession().getPage();
    expect(page.listenerCount("console")).toBe(1);
    expect(page.listenerCount("requestfailed")).toBe(1);
    expect(page.listenerCount("response")).toBe(1);
  });

  it("rejects with a clear error instead of hanging or throwing a raw Playwright error on an unreachable URL", async () => {
    await expect(openPage({ url: "http://localhost:1/" })).rejects.toThrow(/Eyes:.*navigazione.*localhost:1/);
  }, 10000);
});
