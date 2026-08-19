import { describe, it, expect, afterEach } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { takeScreenshot } from "../../src/tools/screenshot.js";
import { getSession, resetSessionForTests } from "../../src/session.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureUrl = `file://${join(here, "..", "fixtures", "open-page.html")}`;

afterEach(async () => {
  await getSession().teardown();
  resetSessionForTests();
});

describe("takeScreenshot", () => {
  it("captures a screenshot at the requested viewport", async () => {
    const page = await getSession().getPage();
    await page.goto(fixtureUrl);

    const mobile = await takeScreenshot({ viewport: { width: 375, height: 667 } });
    expect(mobile.screenshotBase64.length).toBeGreaterThan(0);

    const desktop = await takeScreenshot({ viewport: { width: 1280, height: 800 } });
    expect(desktop.screenshotBase64.length).toBeGreaterThan(0);
    expect(desktop.screenshotBase64).not.toBe(mobile.screenshotBase64);
  });
});
