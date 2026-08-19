import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { evaluateVisualIssues, collectVisualIssues, type ElementBox } from "../../src/audit/visualChecks.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "..", "fixtures");

describe("evaluateVisualIssues (pure)", () => {
  it("flags overflow when scrollWidth exceeds clientWidth", () => {
    const boxes: ElementBox[] = [
      {
        selector: "#box",
        scrollWidth: 400,
        clientWidth: 100,
        scrollHeight: 20,
        clientHeight: 20,
        color: "rgb(0,0,0)",
        backgroundColor: "rgb(255,255,255)",
        contrastRatio: 21,
        offscreen: false,
      },
    ];
    const issues = evaluateVisualIssues(boxes);
    expect(issues).toEqual([
      expect.objectContaining({ selector: "#box", kind: "overflow" }),
    ]);
  });

  it("flags low contrast below 4.5:1", () => {
    const boxes: ElementBox[] = [
      {
        selector: "#low",
        scrollWidth: 100,
        clientWidth: 100,
        scrollHeight: 20,
        clientHeight: 20,
        color: "rgb(200,200,200)",
        backgroundColor: "rgb(220,220,220)",
        contrastRatio: 1.3,
        offscreen: false,
      },
    ];
    const issues = evaluateVisualIssues(boxes);
    expect(issues).toEqual([expect.objectContaining({ selector: "#low", kind: "low-contrast" })]);
  });

  it("reports no issues for a clean box", () => {
    const boxes: ElementBox[] = [
      {
        selector: "#ok",
        scrollWidth: 100,
        clientWidth: 100,
        scrollHeight: 20,
        clientHeight: 20,
        color: "rgb(0,0,0)",
        backgroundColor: "rgb(255,255,255)",
        contrastRatio: 21,
        offscreen: false,
      },
    ];
    expect(evaluateVisualIssues(boxes)).toEqual([]);
  });
});

describe("collectVisualIssues (Playwright integration)", () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser.close();
  });

  it("detects overflow on the fixture page", async () => {
    await page.goto(`file://${join(fixturesDir, "overflow.html")}`);
    const issues = await collectVisualIssues(page);
    expect(issues.some((i) => i.kind === "overflow")).toBe(true);
  });

  it("detects low contrast on the fixture page", async () => {
    await page.goto(`file://${join(fixturesDir, "contrast.html")}`);
    const issues = await collectVisualIssues(page);
    expect(issues.some((i) => i.kind === "low-contrast")).toBe(true);
  });

  it("correctly resolves inherited background for contrast calculation", async () => {
    await page.goto(`file://${join(fixturesDir, "contrast.html")}`);
    const issues = await collectVisualIssues(page);
    const inheritedId = await page.locator("#inherited").getAttribute("data-eyes-visual-id");
    const expectedSelector = `[data-eyes-visual-id="${inheritedId}"]`;
    const inheritedIssue = issues.find((i) => i.kind === "low-contrast" && i.selector === expectedSelector);
    expect(inheritedIssue).toBeUndefined();
  });

  it("correctly parses fractional alpha in rgba backgrounds", async () => {
    await page.goto(`file://${join(fixturesDir, "contrast.html")}`);
    const issues = await collectVisualIssues(page);
    const translucentId = await page.locator("#translucent").getAttribute("data-eyes-visual-id");
    const expectedSelector = `[data-eyes-visual-id="${translucentId}"]`;
    // With fractional alpha (0.5) correctly parsed, black text on white (from semi-transparent white layer) has high contrast
    // Without the fix, alpha would be parsed as 0, causing the walk to skip past the translucent layer to the black parent,
    // resulting in black-on-black being incorrectly flagged as low-contrast
    const translucentIssue = issues.find((i) => i.kind === "low-contrast" && i.selector === expectedSelector);
    expect(translucentIssue).toBeUndefined();
  });
});
