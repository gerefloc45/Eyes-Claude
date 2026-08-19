import { describe, it, expect, afterEach } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { startApp } from "../../src/tools/startApp.js";
import { stopApp } from "../../src/tools/stopApp.js";
import { getSession, resetSessionForTests } from "../../src/session.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, "..", "fixtures", "fake-node-app");

afterEach(async () => {
  await getSession().teardown();
  resetSessionForTests();
});

describe("stopApp", () => {
  it("kills the spawned app process and the app stops responding", async () => {
    const { baseUrl } = await startApp({ cwd: fixtureDir, timeoutMs: 15000 });

    const result = await stopApp();
    expect(result.stopped).toBe(true);

    await expect(fetch(baseUrl, { signal: AbortSignal.timeout(1000) })).rejects.toThrow();
  });
});
