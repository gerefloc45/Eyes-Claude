import { spawn, execSync, type ChildProcess } from "node:child_process";
import { detectStartCommand } from "../detect/appDetectors.js";
import { parseStartupUrl } from "../detect/urlDetection.js";
import { getSession } from "../session.js";

export interface StartAppOptions {
  cwd?: string;
  url?: string;
  timeoutMs?: number;
}

export interface StartAppResult {
  baseUrl: string;
  pid: number | null;
  detectedStack: string;
}

export async function startApp(options: StartAppOptions): Promise<StartAppResult> {
  if (options.url) {
    return { baseUrl: options.url, pid: null, detectedStack: "external" };
  }

  const cwd = options.cwd ?? process.cwd();
  const detection = detectStartCommand(cwd);
  if (!detection) {
    throw new Error(
      `Eyes: impossibile rilevare come avviare il progetto in ${cwd}. Specifica un URL esplicito con il parametro "url".`
    );
  }

  const child = spawn(detection.command, detection.args, { cwd, shell: true });
  const timeoutMs = options.timeoutMs ?? 30000;
  const baseUrl = await waitForStartupUrl(child, timeoutMs);

  const session = getSession();
  session.appProcess = child;
  session.appCwd = cwd;
  session.detectedStack = detection.stack;

  return { baseUrl, pid: child.pid ?? null, detectedStack: detection.stack };
}

// Exported (in addition to `startApp`) so tests can exercise its error-handling
// wiring in isolation, e.g. simulating a spawn-level `'error'` event without
// needing a real OS-level spawn failure to occur.
export function waitForStartupUrl(child: ChildProcess, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = "";

    const timer = setTimeout(() => {
      cleanup();
      killOrphanedChild();
      reject(new Error(`Eyes: timeout (${timeoutMs}ms) in attesa che l'app stampasse un URL di avvio`));
    }, timeoutMs);

    function onData(chunk: Buffer) {
      buffer += chunk.toString();
      const url = parseStartupUrl(buffer);
      if (url) {
        cleanup();
        resolve(url);
      }
    }

    function onError(err: Error) {
      cleanup();
      reject(err);
    }

    function cleanup() {
      clearTimeout(timer);
      child.stdout?.off("data", onData);
      child.stderr?.off("data", onData);
      child.off("error", onError);
    }

    // On timeout, the caller never gets a reference to `child` (startApp only
    // records it on the session after this promise resolves), so if we don't
    // kill it here it becomes permanently unkillable garbage.
    function killOrphanedChild() {
      try {
        if (!child.killed) {
          if (process.platform === "win32" && child.pid) {
            execSync(`taskkill /pid ${child.pid} /t /f`);
          } else {
            child.kill();
          }
        }
      } catch (error) {
        console.error("Failed to kill timed-out app process:", error);
      }
    }

    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("error", onError);
  });
}
