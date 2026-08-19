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
});
