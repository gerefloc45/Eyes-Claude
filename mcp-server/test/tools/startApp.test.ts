import { describe, it, expect, afterEach } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { startApp, waitForStartupUrl } from "../../src/tools/startApp.js";
import { getSession, resetSessionForTests } from "../../src/session.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, "..", "fixtures", "fake-node-app");
const silentFixtureDir = join(here, "..", "fixtures", "fake-node-app-silent");
const crashFixtureDir = join(here, "..", "fixtures", "fake-node-app-crash");
const SILENT_FIXTURE_PORT = 47813;

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

  it("kills the spawned process tree on timeout instead of leaking it (finding 1)", async () => {
    // fake-node-app-silent listens on a fixed port but never prints a
    // "Local: http://..." line, so parseStartupUrl never matches and the
    // wait always times out. Crucially, because the timeout fires before
    // startApp ever reaches `session.appProcess = child`, the session's
    // teardown() (called in afterEach) has nothing to clean up here -- if
    // waitForStartupUrl's timeout branch didn't kill the child itself, this
    // process would leak permanently and keep answering on its port.
    await expect(startApp({ cwd: silentFixtureDir, timeoutMs: 2000 })).rejects.toThrow(
      /timeout.*attesa/i
    );

    // Give the OS a brief moment to finish tearing down the killed process
    // tree before we probe the port it was listening on.
    await new Promise((r) => setTimeout(r, 500));

    await expect(
      fetch(`http://localhost:${SILENT_FIXTURE_PORT}`, { signal: AbortSignal.timeout(1000) })
    ).rejects.toThrow();
  }, 15000);

  it("rejects (not throws) when the spawned child emits a spawn-level 'error' event (finding 2)", async () => {
    // Simulates the failure mode Node produces when spawn() fails
    // asynchronously (e.g. EACCES) -- an unhandled 'error' event on the
    // ChildProcess, which without a listener would crash the process
    // instead of surfacing as a promise rejection. Tested in isolation
    // against waitForStartupUrl directly, since shell:true masks a real
    // ENOENT (the shell itself still launches fine).
    const fakeChild = new EventEmitter() as unknown as ChildProcess;
    Object.assign(fakeChild, {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      killed: false,
      pid: 999999,
    });

    const promise = waitForStartupUrl(fakeChild, 5000);
    fakeChild.emit("error", new Error("spawn ENOENT"));

    await expect(promise).rejects.toThrow(/spawn ENOENT/);
  });

  it("rejects immediately with a clear error for a Docker Compose project instead of attempting to spawn+wait", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "eyes-compose-"));
    writeFileSync(join(tempDir, "docker-compose.yml"), "services: {}");

    const start = Date.now();
    await expect(startApp({ cwd: tempDir, timeoutMs: 30000 })).rejects.toThrow(/Docker Compose/i);
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it("fails fast with a clear error (not a generic timeout) when the spawned app process exits immediately", async () => {
    const start = Date.now();
    let caught: Error | null = null;
    try {
      await startApp({ cwd: crashFixtureDir, timeoutMs: 30000 });
    } catch (error) {
      caught = error as Error;
    }
    const elapsed = Date.now() - start;

    expect(caught).not.toBeNull();
    expect(caught!.message).toMatch(/terminato|exit|codice/i);
    expect(caught!.message).not.toMatch(/timeout/i);
    expect(elapsed).toBeLessThan(10000);
  }, 15000);
});
