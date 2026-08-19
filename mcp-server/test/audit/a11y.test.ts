import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runA11yAudit } from "../../src/audit/a11y.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "..", "fixtures");

describe("runA11yAudit", () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
    context = await browser.newContext();
    page = await context.newPage();
  });

  afterAll(async () => {
    await context.close();
    await browser.close();
  });

  it("reports an image-alt violation on the fixture page", async () => {
    await page.goto(`file://${join(fixturesDir, "a11y-missing-alt.html")}`);
    const issues = await runA11yAudit(page);
    expect(issues.some((i) => i.id === "image-alt")).toBe(true);
  });
});
