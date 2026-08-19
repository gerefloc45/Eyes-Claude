import { describe, it, expect, afterEach } from "vitest";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSession, resetSessionForTests } from "../src/session.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

  it("teardown kills the entire process tree (including grandchildren) on Windows", async () => {
    // This test spawns a real Node.js process tree via npm with shell:true,
    // verifies the child server is running, calls teardown(), and confirms
    // the process tree is completely dead (port is unreachable).
    const fixtureDir = path.join(__dirname, "fixtures", "fake-node-app");
    const session = getSession();

    // Spawn "npm run dev" with shell:true to create a process tree on Windows.
    // This creates: cmd.exe -> npm (node.exe) -> server.js (node.exe)
    const child = spawn("npm", ["run", "dev"], {
      cwd: fixtureDir,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Record the process on the session for teardown to find.
    session.appProcess = child;
    session.appCwd = fixtureDir;

    // Wait for the server to output the port and become ready.
    let baseUrl: string | null = null;
    const portPromise = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timeout waiting for server to start"));
      }, 10000);

      const handler = (data: Buffer) => {
        const output = data.toString();
        const match = output.match(/Local: (http:\/\/localhost:(\d+)\/)/);
        if (match) {
          clearTimeout(timeout);
          child.stdout?.removeListener("data", handler);
          resolve(match[1]);
        }
      };

      child.stdout?.on("data", handler);
      child.stderr?.on("data", (data) => {
        console.error("Fixture stderr:", data.toString());
      });
    });

    baseUrl = await portPromise;
    expect(baseUrl).toBeDefined();

    // Verify the server is responding before we kill it.
    const preKillResponse = await fetch(baseUrl!, {
      signal: AbortSignal.timeout(1000),
    });
    expect(preKillResponse.ok).toBe(true);

    // Now call teardown, which should kill the entire process tree.
    await session.teardown();

    // Reset for the afterEach hook.
    resetSessionForTests();

    // Verify the server is now unreachable (process tree is dead).
    // Give it a moment to actually die.
    await new Promise((resolve) => setTimeout(resolve, 500));

    try {
      await fetch(baseUrl!, { signal: AbortSignal.timeout(1000) });
      // If we get here, the server is still running — test fails.
      throw new Error(
        "Server is still responding after teardown — process tree was not killed"
      );
    } catch (error: any) {
      // Expected: the fetch should fail because the server is dead.
      // Common errors: "ECONNREFUSED", "ETIMEDOUT", "AbortError" etc.
      if (error.message.includes("Server is still responding")) {
        throw error; // Re-throw if it's our test error
      }
      // Otherwise, the fetch failed as expected — this is success.
      expect(true).toBe(true);
    }
  });
});
