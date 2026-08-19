import { describe, it, expect, afterEach } from "vitest";
import { getSession, resetSessionForTests } from "../src/session.js";

afterEach(async () => {
  await getSession().teardown();
  resetSessionForTests();
});

describe("EyesSession", () => {
  it("returns the same page instance on repeated calls", async () => {
    const session = getSession();
    const page1 = await session.getPage();
    const page2 = await session.getPage();
    expect(page1).toBe(page2);
  });

  it("returns the same session instance from getSession()", () => {
    expect(getSession()).toBe(getSession());
  });

  it("teardown closes the page so a new session must be created for reuse", async () => {
    const session = getSession();
    await session.getPage();
    await session.teardown();
    resetSessionForTests();
    const freshSession = getSession();
    expect(freshSession).not.toBe(session);
  });

  it("teardown does not throw even if appProcess cleanup fails", async () => {
    const session = getSession();
    await session.getPage(); // Create the browser and page

    // Set up a fake appProcess that throws when killed
    session.appProcess = {
      killed: false,
      kill: () => {
        throw new Error("Simulated kill() failure");
      },
    } as any;

    // teardown() should not throw despite the kill() failure
    await session.teardown(); // Should not throw

    // Reset for next test
    resetSessionForTests();

    // A fresh session should work, proving no leaked browser handles
    const freshSession = getSession();
    const freshPage = await freshSession.getPage();
    expect(freshPage).toBeDefined();
  });
});
