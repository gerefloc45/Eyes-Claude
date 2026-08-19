import { describe, it, expect, afterEach } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { clickElement, fillElement } from "../../src/tools/interact.js";
import { getSession, resetSessionForTests } from "../../src/session.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "..", "fixtures");

afterEach(async () => {
  await getSession().teardown();
  resetSessionForTests();
});

describe("clickElement", () => {
  it("blocks a click on a destructively-labeled button", async () => {
    const page = await getSession().getPage();
    await page.goto(`file://${join(fixturesDir, "guardrail-buttons.html")}`);

    const result = await clickElement({ selector: "#delete-btn" });
    expect(result.performed).toBe(false);
    expect(result.reason).toMatch(/destructive/);
  });

  it("blocks a click on an external link", async () => {
    const page = await getSession().getPage();
    await page.goto(`file://${join(fixturesDir, "guardrail-buttons.html")}`);

    const result = await clickElement({ selector: "#external-link" });
    expect(result.performed).toBe(false);
  });

  it("allows a click on a harmless button", async () => {
    const page = await getSession().getPage();
    await page.goto(`file://${join(fixturesDir, "guardrail-buttons.html")}`);

    const result = await clickElement({ selector: "#save-btn" });
    expect(result.performed).toBe(true);
  });

  it("blocks submit of a form that has a password field", async () => {
    const page = await getSession().getPage();
    await page.goto(`file://${join(fixturesDir, "login-form.html")}`);

    const result = await clickElement({ selector: "#submit-btn" });
    expect(result.performed).toBe(false);
  });

  it("allows submit of a form with only an email field", async () => {
    const page = await getSession().getPage();
    await page.goto(`file://${join(fixturesDir, "login-form.html")}`);

    const result = await clickElement({ selector: "#newsletter-submit" });
    expect(result.performed).toBe(true);
  });

  it("blocks a <button> with no explicit type attribute inside a form with a password field (implicit submit)", async () => {
    const page = await getSession().getPage();
    await page.goto(`file://${join(fixturesDir, "login-form.html")}`);

    const result = await clickElement({ selector: "#implicit-submit-btn" });
    expect(result.performed).toBe(false);
  });

  it("returns a structured result instead of throwing when the selector no longer matches", async () => {
    const page = await getSession().getPage();
    await page.goto(`file://${join(fixturesDir, "login-form.html")}`);

    const result = await clickElement({ selector: "#does-not-exist-anywhere" });
    expect(result.performed).toBe(false);
    expect(result.reason).toMatch(/selector|page/);
  });
});

describe("fillElement", () => {
  it("blocks filling a password field", async () => {
    const page = await getSession().getPage();
    await page.goto(`file://${join(fixturesDir, "login-form.html")}`);

    const result = await fillElement({ selector: "#password", value: "secret" });
    expect(result.performed).toBe(false);
  });

  it("blocks filling an email field that shares a form with a password field", async () => {
    const page = await getSession().getPage();
    await page.goto(`file://${join(fixturesDir, "login-form.html")}`);

    const result = await fillElement({ selector: "#email", value: "a@b.com" });
    expect(result.performed).toBe(false);
  });

  it("allows filling an email field with no sibling password field", async () => {
    const page = await getSession().getPage();
    await page.goto(`file://${join(fixturesDir, "login-form.html")}`);

    const result = await fillElement({ selector: "#newsletter-email", value: "a@b.com" });
    expect(result.performed).toBe(true);
  });
});
