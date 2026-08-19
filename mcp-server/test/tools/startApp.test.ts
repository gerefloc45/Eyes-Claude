import { describe, it, expect, afterEach } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { startApp } from "../../src/tools/startApp.js";
import { getSession, resetSessionForTests } from "../../src/session.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, "..", "fixtures", "fake-node-app");

afterEach(async () => {
  await getSession().teardown();
  resetSessionForTests();
});

describe("startApp", () => {
  it("returns the given url directly without spawning anything", async () => {
    const result = await startApp({ url: "http://example.test" });
    expect(result).toEqual({ baseUrl: "http://example.test", pid: null, detectedStack: "external" });
  });

  it("detects, spawns and waits for a URL from a node project", async () => {
    const result = await startApp({ cwd: fixtureDir, timeoutMs: 15000 });
    expect(result.baseUrl).toMatch(/^http:\/\/localhost:\d+\/$/);
    expect(result.pid).not.toBeNull();
    expect(result.detectedStack).toBe("node:dev");

    const response = await fetch(result.baseUrl);
    expect(response.status).toBe(200);
  });

  it("records the spawned process on the session for later teardown", async () => {
    await startApp({ cwd: fixtureDir, timeoutMs: 15000 });
    expect(getSession().appProcess).not.toBeNull();
    expect(getSession().appCwd).toBe(fixtureDir);
    expect(getSession().detectedStack).toBe("node:dev");
  });

  it("throws a clear error when nothing can be detected", async () => {
    await expect(startApp({ cwd: here, timeoutMs: 2000 })).rejects.toThrow(/impossibile rilevare/);
  });
});
