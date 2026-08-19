import { spawn, type ChildProcess } from "node:child_process";
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

function waitForStartupUrl(child: ChildProcess, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = "";

    const timer = setTimeout(() => {
      cleanup();
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

    function cleanup() {
      clearTimeout(timer);
      child.stdout?.off("data", onData);
      child.stderr?.off("data", onData);
    }

    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
  });
}
