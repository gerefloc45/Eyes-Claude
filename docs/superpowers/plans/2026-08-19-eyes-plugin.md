# Eyes Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Eyes Claude Code plugin: an MCP server (Node.js + TypeScript + Playwright + axe-core) plus a `/eyes` skill that launches or connects to a web app, navigates and interacts with it, and reports layout/accessibility/console/network bugs.

**Architecture:** A stateful MCP server holds one Playwright browser/page and one spawned app process per Eyes run (`session.ts` singleton). Six MCP tools (`start_app`, `open_page`, `screenshot`, `click`, `fill`, `stop_app`) wrap pure, independently-testable modules (`detect/appDetectors.ts`, `detect/urlDetection.ts`, `guardrails.ts`, `audit/visualChecks.ts`, `audit/a11y.ts`). The `SKILL.md` instructs Claude to drive exploration turn-by-turn using these tools.

**Tech Stack:** Node.js + TypeScript (NodeNext modules), `@modelcontextprotocol/sdk` (McpServer + zod schemas), Playwright (chromium), `@axe-core/playwright`, Vitest for tests.

**Spec:** `docs/superpowers/specs/2026-08-19-eyes-plugin-design.md`

## Global Constraints

- Detection/launch scripts must work on Windows (no POSIX-only shell syntax); subprocess spawns use `shell: true`.
- `start_app` default timeout: 30000ms. Default viewports: desktop 1280×800, mobile 375×667, tablet 768×1024.
- Guardrail destructive-word pattern (case-insensitive, IT/EN): `delete|elimina|cancella|remove|rimuovi|pay|paga|checkout|purchase|acquista|logout.*all|unsubscribe|disdici`.
- Guardrail blocks: external-origin link clicks, `password` inputs always, `email` inputs when the same form also has a password field, form submit when the form has a password field.
- Contrast threshold: WCAG AA 4.5:1 (relative-luminance formula).
- Skill budget defaults: max 8 pages visited, max 15 interactions per `/eyes` run.
- No hardcoded secrets or external telemetry anywhere in the codebase.
- This plan implements a single subsystem (the plugin itself); it is not decomposed further per the spec's non-goals (no separate Artifact report, no auto-fix, no autonomous marketplace submission).

---

## File Structure

```
EyesClaude/
  .claude-plugin/
    plugin.json
  skills/
    eyes/
      SKILL.md
  mcp-server/
    package.json
    tsconfig.json
    vitest.config.ts
    src/
      index.ts
      session.ts
      guardrails.ts
      detect/
        appDetectors.ts
        urlDetection.ts
      audit/
        a11y.ts
        visualChecks.ts
      tools/
        startApp.ts
        openPage.ts
        screenshot.ts
        interact.ts
        stopApp.ts
    test/
      guardrails.test.ts
      detect/
        appDetectors.test.ts
        urlDetection.test.ts
      session.test.ts
      audit/
        visualChecks.test.ts
        a11y.test.ts
      tools/
        startApp.test.ts
        openPage.test.ts
        interact.test.ts
      fixtures/
        fake-node-app/
          package.json
          server.js
        overflow.html
        contrast.html
        a11y-missing-alt.html
        guardrail-buttons.html
        login-form.html
      index.test.ts
  README.md
  LICENSE
```

`session.ts` is an addition not enumerated in the spec's file list — it is the shared-state module the spec's tools implicitly need (a single browser/page/app-process per Eyes run). It has no separate spec section because it is pure implementation plumbing, not user-facing behavior.

---

### Task 1: Project scaffolding + guardrails module

**Files:**
- Create: `mcp-server/package.json`
- Create: `mcp-server/tsconfig.json`
- Create: `mcp-server/vitest.config.ts`
- Create: `mcp-server/src/guardrails.ts`
- Test: `mcp-server/test/guardrails.test.ts`

**Interfaces:**
- Produces: `ElementDescriptor` interface, `GuardrailResult` interface, `checkGuardrail(el: ElementDescriptor): GuardrailResult` — consumed by Task 9 (`interact.ts`).

- [ ] **Step 1: Create `mcp-server/package.json`**

```json
{
  "name": "eyes-mcp-server",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "build": "tsc -p .",
    "test": "vitest run",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "playwright": "^1.47.0",
    "@axe-core/playwright": "^4.10.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: Create `mcp-server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `mcp-server/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 30000,
  },
});
```

- [ ] **Step 4: Install dependencies**

Run (from `mcp-server/`): `npm install`
Then install Playwright's browser binary: `npx playwright install chromium`

- [ ] **Step 5: Write the failing test for guardrails**

`mcp-server/test/guardrails.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { checkGuardrail, type ElementDescriptor } from "../src/guardrails.js";

function baseEl(overrides: Partial<ElementDescriptor> = {}): ElementDescriptor {
  return {
    tagName: "button",
    text: "Salva",
    currentOrigin: "http://localhost:3000",
    ...overrides,
  };
}

describe("checkGuardrail", () => {
  it("allows a harmless button", () => {
    expect(checkGuardrail(baseEl()).allowed).toBe(true);
  });

  it("blocks a delete button by text", () => {
    const result = checkGuardrail(baseEl({ text: "Elimina account" }));
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/distruttiv/);
  });

  it("blocks a pay button by aria-label", () => {
    const result = checkGuardrail(baseEl({ text: "", ariaLabel: "Pay now" }));
    expect(result.allowed).toBe(false);
  });

  it("blocks a link to an external origin", () => {
    const result = checkGuardrail(
      baseEl({ tagName: "a", text: "Visita", href: "https://external.example.com/page" })
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/link esterno/);
  });

  it("allows a link to the same origin", () => {
    const result = checkGuardrail(
      baseEl({ tagName: "a", text: "Prodotti", href: "http://localhost:3000/prodotti" })
    );
    expect(result.allowed).toBe(true);
  });

  it("blocks a password input", () => {
    const result = checkGuardrail(baseEl({ tagName: "input", text: "", type: "password" }));
    expect(result.allowed).toBe(false);
  });

  it("blocks an email input when the form also has a password field", () => {
    const result = checkGuardrail(
      baseEl({ tagName: "input", text: "", type: "email", formHasPasswordField: true })
    );
    expect(result.allowed).toBe(false);
  });

  it("allows an email input when the form has no password field", () => {
    const result = checkGuardrail(
      baseEl({ tagName: "input", text: "", type: "email", formHasPasswordField: false })
    );
    expect(result.allowed).toBe(true);
  });

  it("blocks a submit button when the form has a sensitive field", () => {
    const result = checkGuardrail(
      baseEl({ tagName: "input", text: "", type: "submit", formHasSensitiveField: true })
    );
    expect(result.allowed).toBe(false);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run test/guardrails.test.ts` (from `mcp-server/`)
Expected: FAIL — `../src/guardrails.js` does not exist.

- [ ] **Step 7: Implement `mcp-server/src/guardrails.ts`**

```ts
const DESTRUCTIVE_PATTERN =
  /delete|elimina|cancella|remove|rimuovi|pay|paga|checkout|purchase|acquista|logout.*all|unsubscribe|disdici/i;

export interface ElementDescriptor {
  tagName: string;
  text?: string;
  ariaLabel?: string;
  name?: string;
  id?: string;
  href?: string;
  type?: string;
  currentOrigin: string;
  formHasPasswordField?: boolean;
  formHasSensitiveField?: boolean;
}

export interface GuardrailResult {
  allowed: boolean;
  reason?: string;
}

export function checkGuardrail(el: ElementDescriptor): GuardrailResult {
  const label = [el.text, el.ariaLabel, el.name, el.id].filter(Boolean).join(" ");
  if (DESTRUCTIVE_PATTERN.test(label)) {
    return {
      allowed: false,
      reason: `azione bloccata dal guardrail: "${label.trim()}" sembra un'azione distruttiva`,
    };
  }

  const tag = el.tagName.toLowerCase();

  if (tag === "a" && el.href) {
    try {
      const target = new URL(el.href, el.currentOrigin);
      const current = new URL(el.currentOrigin);
      if (target.origin !== current.origin) {
        return {
          allowed: false,
          reason: `azione bloccata dal guardrail: link esterno verso ${target.origin}`,
        };
      }
    } catch {
      // href relativo o non valido: consentito
    }
  }

  if (tag === "input" && el.type === "password") {
    return { allowed: false, reason: "azione bloccata dal guardrail: campo password" };
  }

  if (tag === "input" && el.type === "email" && el.formHasPasswordField) {
    return {
      allowed: false,
      reason: "azione bloccata dal guardrail: campo email in un form di login/signup",
    };
  }

  if (el.type === "submit" && el.formHasSensitiveField) {
    return {
      allowed: false,
      reason: "azione bloccata dal guardrail: submit di un form con campi sensibili",
    };
  }

  return { allowed: true };
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run test/guardrails.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 9: Commit**

```bash
git add mcp-server/package.json mcp-server/tsconfig.json mcp-server/vitest.config.ts mcp-server/src/guardrails.ts mcp-server/test/guardrails.test.ts
git commit -m "feat: scaffold mcp-server and add guardrails module"
```

---

### Task 2: App detection heuristics

**Files:**
- Create: `mcp-server/src/detect/appDetectors.ts`
- Test: `mcp-server/test/detect/appDetectors.test.ts`

**Interfaces:**
- Produces: `StartCommand` interface, `detectStartCommand(cwd: string): StartCommand | null` — consumed by Task 5 (`startApp.ts`).

- [ ] **Step 1: Write the failing test**

`mcp-server/test/detect/appDetectors.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectStartCommand } from "../../src/detect/appDetectors.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "eyes-detect-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("detectStartCommand", () => {
  it("returns null for an empty directory", () => {
    expect(detectStartCommand(dir)).toBeNull();
  });

  it("detects docker-compose.yml first", () => {
    writeFileSync(join(dir, "docker-compose.yml"), "services: {}");
    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { dev: "vite" } }));
    const result = detectStartCommand(dir);
    expect(result).toEqual({ command: "docker", args: ["compose", "up"], stack: "docker-compose" });
  });

  it("detects npm dev script", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { dev: "vite" } }));
    expect(detectStartCommand(dir)).toEqual({ command: "npm", args: ["run", "dev"], stack: "node:dev" });
  });

  it("falls back to start script when dev is absent", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { start: "node server.js" } }));
    expect(detectStartCommand(dir)).toEqual({ command: "npm", args: ["run", "start"], stack: "node:start" });
  });

  it("detects Django via manage.py", () => {
    writeFileSync(join(dir, "manage.py"), "");
    expect(detectStartCommand(dir)).toEqual({
      command: "python",
      args: ["manage.py", "runserver"],
      stack: "django",
    });
  });

  it("detects FastAPI via requirements.txt", () => {
    writeFileSync(join(dir, "requirements.txt"), "fastapi\nuvicorn\n");
    expect(detectStartCommand(dir)).toEqual({
      command: "uvicorn",
      args: ["main:app", "--reload"],
      stack: "fastapi",
    });
  });

  it("detects Flask via requirements.txt", () => {
    writeFileSync(join(dir, "requirements.txt"), "flask\n");
    expect(detectStartCommand(dir)).toEqual({ command: "flask", args: ["run"], stack: "flask" });
  });

  it("detects Rails via Gemfile", () => {
    writeFileSync(join(dir, "Gemfile"), "");
    expect(detectStartCommand(dir)).toEqual({
      command: "rails",
      args: ["server"],
      stack: "rails",
    });
  });

  it("falls back to a static server for plain index.html", () => {
    writeFileSync(join(dir, "index.html"), "<html></html>");
    expect(detectStartCommand(dir)).toEqual({ command: "npx", args: ["serve", "."], stack: "static" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/detect/appDetectors.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `mcp-server/src/detect/appDetectors.ts`**

```ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface StartCommand {
  command: string;
  args: string[];
  stack: string;
}

export function detectStartCommand(cwd: string): StartCommand | null {
  if (existsSync(join(cwd, "docker-compose.yml")) || existsSync(join(cwd, "compose.yaml"))) {
    return { command: "docker", args: ["compose", "up"], stack: "docker-compose" };
  }

  const packageJsonPath = join(cwd, "package.json");
  if (existsSync(packageJsonPath)) {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    const scripts: Record<string, string> = pkg.scripts ?? {};
    for (const scriptName of ["dev", "start", "serve"]) {
      if (scripts[scriptName]) {
        return { command: "npm", args: ["run", scriptName], stack: `node:${scriptName}` };
      }
    }
  }

  if (existsSync(join(cwd, "manage.py"))) {
    return { command: "python", args: ["manage.py", "runserver"], stack: "django" };
  }

  const pyDeps =
    readTextIfExists(join(cwd, "requirements.txt")) ?? readTextIfExists(join(cwd, "pyproject.toml")) ?? "";
  if (/fastapi/i.test(pyDeps)) {
    return { command: "uvicorn", args: ["main:app", "--reload"], stack: "fastapi" };
  }
  if (/flask/i.test(pyDeps)) {
    return { command: "flask", args: ["run"], stack: "flask" };
  }

  if (existsSync(join(cwd, "Gemfile"))) {
    return { command: "rails", args: ["server"], stack: "rails" };
  }

  if (existsSync(join(cwd, "index.html"))) {
    return { command: "npx", args: ["serve", "."], stack: "static" };
  }

  return null;
}

function readTextIfExists(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf-8") : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/detect/appDetectors.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/detect/appDetectors.ts mcp-server/test/detect/appDetectors.test.ts
git commit -m "feat: add app start-command detection heuristics"
```

---

### Task 3: Startup URL parsing

**Files:**
- Create: `mcp-server/src/detect/urlDetection.ts`
- Test: `mcp-server/test/detect/urlDetection.test.ts`

**Interfaces:**
- Produces: `parseStartupUrl(output: string): string | null` — consumed by Task 5 (`startApp.ts`).

- [ ] **Step 1: Write the failing test**

`mcp-server/test/detect/urlDetection.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseStartupUrl } from "../../src/detect/urlDetection.js";

describe("parseStartupUrl", () => {
  it("extracts a Vite-style local URL", () => {
    expect(parseStartupUrl("  ➜  Local:   http://localhost:5173/\n")).toBe("http://localhost:5173/");
  });

  it("extracts a Flask-style URL", () => {
    expect(parseStartupUrl("Running on http://127.0.0.1:5000")).toBe("http://127.0.0.1:5000");
  });

  it("normalizes 0.0.0.0 to localhost", () => {
    expect(parseStartupUrl("Listening on http://0.0.0.0:8000")).toBe("http://localhost:8000");
  });

  it("returns null when no URL is present", () => {
    expect(parseStartupUrl("Compiling...\nDone.")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/detect/urlDetection.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `mcp-server/src/detect/urlDetection.ts`**

```ts
const URL_REGEX = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?[^\s"'<>]*/i;

export function parseStartupUrl(output: string): string | null {
  const match = output.match(URL_REGEX);
  if (!match) return null;
  return match[0].replace("0.0.0.0", "localhost");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/detect/urlDetection.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/detect/urlDetection.ts mcp-server/test/detect/urlDetection.test.ts
git commit -m "feat: add startup URL parser"
```

---

### Task 4: Browser/process session singleton

**Files:**
- Create: `mcp-server/src/session.ts`
- Test: `mcp-server/test/session.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `getSession(): EyesSession` with `session.getPage(): Promise<Page>`, `session.teardown(): Promise<void>`, and public fields `appProcess: ChildProcess | null`, `appCwd: string | null`, `detectedStack: string | null`; plus `resetSessionForTests(): void`. Consumed by Task 5 (`startApp.ts`), Task 6 (`index.ts`), Tasks 9–13 (`openPage.ts`, `screenshot.ts`, `interact.ts`, `stopApp.ts`).

- [ ] **Step 1: Write the failing test**

`mcp-server/test/session.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/session.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `mcp-server/src/session.ts`**

```ts
import { chromium, type Browser, type Page } from "playwright";
import { execSync, type ChildProcess } from "node:child_process";

class EyesSession {
  private browser: Browser | null = null;
  private page: Page | null = null;
  appProcess: ChildProcess | null = null;
  appCwd: string | null = null;
  detectedStack: string | null = null;

  async getPage(): Promise<Page> {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: true });
    }
    if (!this.page) {
      this.page = await this.browser.newPage();
    }
    return this.page;
  }

  async teardown(): Promise<void> {
    if (this.appProcess && !this.appProcess.killed) {
      if (this.detectedStack === "docker-compose" && this.appCwd) {
        execSync("docker compose down", { cwd: this.appCwd });
      } else {
        this.appProcess.kill();
      }
    }
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    this.appProcess = null;
  }
}

let instance: EyesSession | null = null;

export function getSession(): EyesSession {
  if (!instance) instance = new EyesSession();
  return instance;
}

export function resetSessionForTests(): void {
  instance = null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/session.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/session.ts mcp-server/test/session.test.ts
git commit -m "feat: add browser/process session singleton"
```

---

### Task 5: `start_app` tool

**Files:**
- Create: `mcp-server/src/tools/startApp.ts`
- Create: `mcp-server/test/fixtures/fake-node-app/package.json`
- Create: `mcp-server/test/fixtures/fake-node-app/server.js`
- Test: `mcp-server/test/tools/startApp.test.ts`

**Interfaces:**
- Consumes: `detectStartCommand` (Task 2), `parseStartupUrl` (Task 3), `getSession`/`resetSessionForTests` (Task 4).
- Produces: `StartAppOptions`, `StartAppResult`, `startApp(options: StartAppOptions): Promise<StartAppResult>` — consumed by Task 6 (`index.ts`).

- [ ] **Step 1: Create the fake dev-server fixture**

`mcp-server/test/fixtures/fake-node-app/package.json`:

```json
{
  "name": "fake-node-app",
  "private": true,
  "scripts": {
    "dev": "node server.js"
  }
}
```

`mcp-server/test/fixtures/fake-node-app/server.js`:

```js
const http = require("node:http");

const server = http.createServer((req, res) => {
  res.end("<html><body>fake app</body></html>");
});

server.listen(0, () => {
  const port = server.address().port;
  console.log(`Local: http://localhost:${port}/`);
});
```

- [ ] **Step 2: Write the failing test**

`mcp-server/test/tools/startApp.test.ts`:

```ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/tools/startApp.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 4: Implement `mcp-server/src/tools/startApp.ts`**

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/tools/startApp.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add mcp-server/src/tools/startApp.ts mcp-server/test/tools/startApp.test.ts mcp-server/test/fixtures/fake-node-app
git commit -m "feat: add start_app tool with fake-node-app fixture"
```

---

### Task 6: Visual checks (pure evaluator + Playwright collector)

**Files:**
- Create: `mcp-server/src/audit/visualChecks.ts`
- Create: `mcp-server/test/fixtures/overflow.html`
- Create: `mcp-server/test/fixtures/contrast.html`
- Test: `mcp-server/test/audit/visualChecks.test.ts`

**Interfaces:**
- Produces: `ElementBox`, `VisualIssue`, `evaluateVisualIssues(boxes: ElementBox[]): VisualIssue[]`, `collectVisualIssues(page: Page): Promise<VisualIssue[]>` — consumed by Task 9 (`openPage.ts`).

- [ ] **Step 1: Create fixture HTML files**

`mcp-server/test/fixtures/overflow.html`:

```html
<!DOCTYPE html>
<html>
<body>
  <div id="box" style="width: 100px; overflow: hidden; white-space: nowrap;">
    This text is intentionally much longer than the box so it overflows badly
  </div>
</body>
</html>
```

`mcp-server/test/fixtures/contrast.html`:

```html
<!DOCTYPE html>
<html>
<body>
  <p id="low" style="color: rgb(200,200,200); background-color: rgb(220,220,220);">
    Testo a basso contrasto
  </p>
  <p id="high" style="color: rgb(0,0,0); background-color: rgb(255,255,255);">
    Testo ad alto contrasto
  </p>
</body>
</html>
```

- [ ] **Step 2: Write the failing test**

`mcp-server/test/audit/visualChecks.test.ts`:

```ts
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
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/audit/visualChecks.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 4: Implement `mcp-server/src/audit/visualChecks.ts`**

```ts
import type { Page } from "playwright";

export interface ElementBox {
  selector: string;
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
  color: string;
  backgroundColor: string;
  contrastRatio: number;
  offscreen: boolean;
}

export interface VisualIssue {
  selector: string;
  kind: "overflow" | "low-contrast" | "offscreen";
  detail: string;
}

export function evaluateVisualIssues(boxes: ElementBox[]): VisualIssue[] {
  const issues: VisualIssue[] = [];
  for (const box of boxes) {
    if (box.scrollWidth > box.clientWidth + 2) {
      issues.push({
        selector: box.selector,
        kind: "overflow",
        detail: `contenuto largo ${box.scrollWidth}px in un contenitore di ${box.clientWidth}px`,
      });
    }
    if (box.contrastRatio < 4.5) {
      issues.push({
        selector: box.selector,
        kind: "low-contrast",
        detail: `contrasto ${box.contrastRatio.toFixed(2)}:1 (soglia WCAG AA: 4.5:1)`,
      });
    }
    if (box.offscreen) {
      issues.push({ selector: box.selector, kind: "offscreen", detail: "elemento posizionato fuori dal viewport" });
    }
  }
  return issues;
}

export async function collectVisualIssues(page: Page): Promise<VisualIssue[]> {
  const boxes: ElementBox[] = await page.evaluate(() => {
    function luminance(r: number, g: number, b: number): number {
      const [rs, gs, bs] = [r, g, b].map((c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    }
    function parseRgb(color: string): [number, number, number] {
      const m = color.match(/\d+/g);
      if (!m) return [255, 255, 255];
      return [Number(m[0]), Number(m[1]), Number(m[2])];
    }

    const elements = Array.from(document.querySelectorAll("body *")).slice(0, 300);
    return elements.map((el, i) => {
      el.setAttribute("data-eyes-visual-id", String(i));
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const [r1, g1, b1] = parseRgb(style.color);
      const [r2, g2, b2] = parseRgb(style.backgroundColor);
      const l1 = luminance(r1, g1, b1);
      const l2 = luminance(r2, g2, b2);
      const contrastRatio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      return {
        selector: `[data-eyes-visual-id="${i}"]`,
        scrollWidth: (el as HTMLElement).scrollWidth,
        clientWidth: (el as HTMLElement).clientWidth,
        scrollHeight: (el as HTMLElement).scrollHeight,
        clientHeight: (el as HTMLElement).clientHeight,
        color: style.color,
        backgroundColor: style.backgroundColor,
        contrastRatio,
        offscreen:
          rect.right < 0 || rect.bottom < 0 || rect.left > window.innerWidth || rect.top > window.innerHeight,
      };
    });
  });
  return evaluateVisualIssues(boxes);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/audit/visualChecks.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add mcp-server/src/audit/visualChecks.ts mcp-server/test/audit/visualChecks.test.ts mcp-server/test/fixtures/overflow.html mcp-server/test/fixtures/contrast.html
git commit -m "feat: add visual checks (overflow, contrast, offscreen)"
```

---

### Task 7: Accessibility audit wrapper

**Files:**
- Create: `mcp-server/src/audit/a11y.ts`
- Create: `mcp-server/test/fixtures/a11y-missing-alt.html`
- Test: `mcp-server/test/audit/a11y.test.ts`

**Interfaces:**
- Produces: `A11yIssue`, `runA11yAudit(page: Page): Promise<A11yIssue[]>` — consumed by Task 9 (`openPage.ts`).

- [ ] **Step 1: Create fixture HTML**

`mcp-server/test/fixtures/a11y-missing-alt.html`:

```html
<!DOCTYPE html>
<html>
<body>
  <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" />
</body>
</html>
```

- [ ] **Step 2: Write the failing test**

`mcp-server/test/audit/a11y.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runA11yAudit } from "../../src/audit/a11y.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "..", "fixtures");

describe("runA11yAudit", () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser.close();
  });

  it("reports an image-alt violation on the fixture page", async () => {
    await page.goto(`file://${join(fixturesDir, "a11y-missing-alt.html")}`);
    const issues = await runA11yAudit(page);
    expect(issues.some((i) => i.id === "image-alt")).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/audit/a11y.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 4: Implement `mcp-server/src/audit/a11y.ts`**

```ts
import type { Page } from "playwright";
import AxeBuilder from "@axe-core/playwright";

export interface A11yIssue {
  id: string;
  impact: string | null;
  description: string;
  nodesCount: number;
}

export async function runA11yAudit(page: Page): Promise<A11yIssue[]> {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.map((v) => ({
    id: v.id,
    impact: v.impact ?? null,
    description: v.description,
    nodesCount: v.nodes.length,
  }));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/audit/a11y.test.ts`
Expected: PASS (1 test)

- [ ] **Step 6: Commit**

```bash
git add mcp-server/src/audit/a11y.ts mcp-server/test/audit/a11y.test.ts mcp-server/test/fixtures/a11y-missing-alt.html
git commit -m "feat: add accessibility audit wrapper via axe-core"
```

---

### Task 8: `open_page` tool

**Files:**
- Create: `mcp-server/src/tools/openPage.ts`
- Create: `mcp-server/test/fixtures/open-page.html`
- Test: `mcp-server/test/tools/openPage.test.ts`

**Interfaces:**
- Consumes: `getSession`/`resetSessionForTests` (Task 4), `runA11yAudit` (Task 7), `collectVisualIssues` (Task 6).
- Produces: `OpenPageOptions`, `InteractiveElement`, `OpenPageResult`, `openPage(options: OpenPageOptions): Promise<OpenPageResult>` — consumed by Task 12 (`index.ts`).

- [ ] **Step 1: Create fixture HTML**

`mcp-server/test/fixtures/open-page.html`:

```html
<!DOCTYPE html>
<html>
<body>
  <h1>Pagina di test</h1>
  <a href="#nowhere">Link</a>
  <button>Clicca qui</button>
  <img src="/does-not-exist.png" />
  <script>console.error("errore di test");</script>
</body>
</html>
```

- [ ] **Step 2: Write the failing test**

`mcp-server/test/tools/openPage.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { openPage } from "../../src/tools/openPage.js";
import { getSession, resetSessionForTests } from "../../src/session.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureUrl = `file://${join(here, "..", "fixtures", "open-page.html")}`;

afterEach(async () => {
  await getSession().teardown();
  resetSessionForTests();
});

describe("openPage", () => {
  it("returns a screenshot, console errors, failed requests and interactive elements", async () => {
    const result = await openPage({ url: fixtureUrl });

    expect(result.screenshotBase64.length).toBeGreaterThan(0);
    expect(result.consoleMessages.some((m) => m.text.includes("errore di test"))).toBe(true);
    expect(result.failedRequests.some((r) => r.url.includes("does-not-exist.png"))).toBe(true);
    expect(result.interactiveElements.some((el) => el.tagName === "button")).toBe(true);
    expect(result.interactiveElements.some((el) => el.tagName === "a")).toBe(true);
    expect(Array.isArray(result.a11yIssues)).toBe(true);
    expect(Array.isArray(result.visualIssues)).toBe(true);
  });

  it("assigns a stable selector that can be used to find the element again", async () => {
    const result = await openPage({ url: fixtureUrl });
    const button = result.interactiveElements.find((el) => el.tagName === "button");
    expect(button?.selector).toMatch(/data-eyes-id/);

    const page = await getSession().getPage();
    const count = await page.locator(button!.selector).count();
    expect(count).toBe(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/tools/openPage.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 4: Implement `mcp-server/src/tools/openPage.ts`**

```ts
import type { Page } from "playwright";
import { runA11yAudit, type A11yIssue } from "../audit/a11y.js";
import { collectVisualIssues, type VisualIssue } from "../audit/visualChecks.js";
import { getSession } from "../session.js";

export interface OpenPageOptions {
  url: string;
  viewport?: { width: number; height: number };
}

export interface InteractiveElement {
  selector: string;
  tagName: string;
  text: string;
}

export interface OpenPageResult {
  screenshotBase64: string;
  consoleMessages: { type: string; text: string }[];
  failedRequests: { url: string; status: number | null; errorText?: string }[];
  a11yIssues: A11yIssue[];
  visualIssues: VisualIssue[];
  interactiveElements: InteractiveElement[];
}

export async function openPage(options: OpenPageOptions): Promise<OpenPageResult> {
  const session = getSession();
  const page = await session.getPage();
  const viewport = options.viewport ?? { width: 1280, height: 800 };
  await page.setViewportSize(viewport);

  const consoleMessages: OpenPageResult["consoleMessages"] = [];
  const failedRequests: OpenPageResult["failedRequests"] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      consoleMessages.push({ type: msg.type(), text: msg.text() });
    }
  });
  page.on("requestfailed", (req) => {
    failedRequests.push({ url: req.url(), status: null, errorText: req.failure()?.errorText });
  });
  page.on("response", (res) => {
    if (res.status() >= 400) {
      failedRequests.push({ url: res.url(), status: res.status() });
    }
  });

  await page.goto(options.url, { waitUntil: "networkidle" });

  const screenshotBuffer = await page.screenshot();
  const [a11yIssues, visualIssues, interactiveElements] = await Promise.all([
    runA11yAudit(page),
    collectVisualIssues(page),
    collectInteractiveElements(page),
  ]);

  return {
    screenshotBase64: screenshotBuffer.toString("base64"),
    consoleMessages,
    failedRequests,
    a11yIssues,
    visualIssues,
    interactiveElements,
  };
}

async function collectInteractiveElements(page: Page): Promise<InteractiveElement[]> {
  return page.$$eval("a, button, input, select, textarea", (elements) =>
    elements.slice(0, 50).map((el, i) => {
      el.setAttribute("data-eyes-id", String(i));
      const tagName = el.tagName.toLowerCase();
      const text = (el.textContent || (el as HTMLInputElement).value || "").trim().slice(0, 80);
      return { selector: `[data-eyes-id="${i}"]`, tagName, text };
    })
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/tools/openPage.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add mcp-server/src/tools/openPage.ts mcp-server/test/tools/openPage.test.ts mcp-server/test/fixtures/open-page.html
git commit -m "feat: add open_page tool combining screenshot, console/network capture and audits"
```

---

### Task 9: `screenshot` tool

**Files:**
- Create: `mcp-server/src/tools/screenshot.ts`
- Test: `mcp-server/test/tools/screenshot.test.ts`

**Interfaces:**
- Consumes: `getSession`/`resetSessionForTests` (Task 4).
- Produces: `ScreenshotOptions`, `takeScreenshot(options: ScreenshotOptions): Promise<{ screenshotBase64: string }>` — consumed by Task 12 (`index.ts`).

- [ ] **Step 1: Write the failing test**

`mcp-server/test/tools/screenshot.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { takeScreenshot } from "../../src/tools/screenshot.js";
import { getSession, resetSessionForTests } from "../../src/session.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureUrl = `file://${join(here, "..", "fixtures", "open-page.html")}`;

afterEach(async () => {
  await getSession().teardown();
  resetSessionForTests();
});

describe("takeScreenshot", () => {
  it("captures a screenshot at the requested viewport", async () => {
    const page = await getSession().getPage();
    await page.goto(fixtureUrl);

    const mobile = await takeScreenshot({ viewport: { width: 375, height: 667 } });
    expect(mobile.screenshotBase64.length).toBeGreaterThan(0);

    const desktop = await takeScreenshot({ viewport: { width: 1280, height: 800 } });
    expect(desktop.screenshotBase64.length).toBeGreaterThan(0);
    expect(desktop.screenshotBase64).not.toBe(mobile.screenshotBase64);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/tools/screenshot.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `mcp-server/src/tools/screenshot.ts`**

```ts
import { getSession } from "../session.js";

export interface ScreenshotOptions {
  viewport: { width: number; height: number };
}

export async function takeScreenshot(options: ScreenshotOptions): Promise<{ screenshotBase64: string }> {
  const session = getSession();
  const page = await session.getPage();
  await page.setViewportSize(options.viewport);
  const buffer = await page.screenshot();
  return { screenshotBase64: buffer.toString("base64") };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/tools/screenshot.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/tools/screenshot.ts mcp-server/test/tools/screenshot.test.ts
git commit -m "feat: add multi-viewport screenshot tool"
```

---

### Task 10: `click`/`fill` tools with guardrail enforcement

**Files:**
- Create: `mcp-server/src/tools/interact.ts`
- Create: `mcp-server/test/fixtures/guardrail-buttons.html`
- Create: `mcp-server/test/fixtures/login-form.html`
- Test: `mcp-server/test/tools/interact.test.ts`

**Interfaces:**
- Consumes: `checkGuardrail`/`ElementDescriptor` (Task 1), `getSession`/`resetSessionForTests` (Task 4).
- Produces: `InteractOptions`, `InteractResult`, `clickElement(options: InteractOptions): Promise<InteractResult>`, `fillElement(options: InteractOptions): Promise<InteractResult>` — consumed by Task 12 (`index.ts`).

- [ ] **Step 1: Create fixture HTML files**

`mcp-server/test/fixtures/guardrail-buttons.html`:

```html
<!DOCTYPE html>
<html>
<body>
  <button id="delete-btn">Elimina account</button>
  <button id="save-btn">Salva modifiche</button>
  <a id="external-link" href="https://external.example.com/page">Vai fuori</a>
  <a id="internal-link" href="/altra-pagina">Altra pagina</a>
</body>
</html>
```

`mcp-server/test/fixtures/login-form.html`:

```html
<!DOCTYPE html>
<html>
<body>
  <form id="login">
    <input type="email" id="email" name="email" />
    <input type="password" id="password" name="password" />
    <button type="submit" id="submit-btn">Accedi</button>
  </form>
  <form id="newsletter">
    <input type="email" id="newsletter-email" name="email" />
    <button type="submit" id="newsletter-submit">Iscriviti</button>
  </form>
</body>
</html>
```

- [ ] **Step 2: Write the failing test**

`mcp-server/test/tools/interact.test.ts`:

```ts
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
    expect(result.reason).toMatch(/distruttiv/);
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/tools/interact.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 4: Implement `mcp-server/src/tools/interact.ts`**

```ts
import type { Page } from "playwright";
import { checkGuardrail, type ElementDescriptor } from "../guardrails.js";
import { getSession } from "../session.js";

export interface InteractOptions {
  selector: string;
  value?: string;
}

export interface InteractResult {
  performed: boolean;
  reason?: string;
}

export async function clickElement(options: InteractOptions): Promise<InteractResult> {
  const session = getSession();
  const page = await session.getPage();
  const descriptor = await describeElement(page, options.selector);
  const guard = checkGuardrail(descriptor);
  if (!guard.allowed) {
    return { performed: false, reason: guard.reason };
  }
  await page.click(options.selector);
  return { performed: true };
}

export async function fillElement(options: InteractOptions): Promise<InteractResult> {
  const session = getSession();
  const page = await session.getPage();
  const descriptor = await describeElement(page, options.selector);
  const guard = checkGuardrail(descriptor);
  if (!guard.allowed) {
    return { performed: false, reason: guard.reason };
  }
  await page.fill(options.selector, options.value ?? "");
  return { performed: true };
}

async function describeElement(page: Page, selector: string): Promise<ElementDescriptor> {
  return page.$eval(selector, (el) => {
    const form = el.closest("form");
    const formHasPasswordField = !!form?.querySelector('input[type="password"]');
    return {
      tagName: el.tagName,
      text: el.textContent?.trim() ?? "",
      ariaLabel: el.getAttribute("aria-label") ?? undefined,
      name: el.getAttribute("name") ?? undefined,
      id: el.getAttribute("id") ?? undefined,
      href: el.getAttribute("href") ?? undefined,
      type: el.getAttribute("type") ?? undefined,
      currentOrigin: window.location.origin,
      formHasPasswordField,
      formHasSensitiveField: formHasPasswordField,
    };
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/tools/interact.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 6: Commit**

```bash
git add mcp-server/src/tools/interact.ts mcp-server/test/tools/interact.test.ts mcp-server/test/fixtures/guardrail-buttons.html mcp-server/test/fixtures/login-form.html
git commit -m "feat: add click/fill tools with guardrail enforcement"
```

---

### Task 11: `stop_app` tool

**Files:**
- Create: `mcp-server/src/tools/stopApp.ts`
- Test: `mcp-server/test/tools/stopApp.test.ts`

**Interfaces:**
- Consumes: `getSession`/`resetSessionForTests` (Task 4), `startApp` (Task 5).
- Produces: `stopApp(): Promise<{ stopped: boolean }>` — consumed by Task 12 (`index.ts`).

- [ ] **Step 1: Write the failing test**

`mcp-server/test/tools/stopApp.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/tools/stopApp.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `mcp-server/src/tools/stopApp.ts`**

```ts
import { getSession } from "../session.js";

export async function stopApp(): Promise<{ stopped: boolean }> {
  const session = getSession();
  await session.teardown();
  return { stopped: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/tools/stopApp.test.ts`
Expected: PASS (1 test). Note: allow a brief retry if the port isn't released instantly on Windows — the test's 1000ms fetch timeout already tolerates this.

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/tools/stopApp.ts mcp-server/test/tools/stopApp.test.ts
git commit -m "feat: add stop_app tool"
```

---

### Task 12: MCP server wiring (`index.ts`)

**Files:**
- Create: `mcp-server/src/index.ts`
- Test: `mcp-server/test/index.test.ts`

**Interfaces:**
- Consumes: `startApp` (Task 5), `openPage` (Task 8), `takeScreenshot` (Task 9), `clickElement`/`fillElement` (Task 10), `stopApp` (Task 11).
- Produces: the wired `McpServer` instance exported as default from `index.ts`, used by the plugin manifest (Task 13) as the process entrypoint.

- [ ] **Step 1: Write the failing test**

`mcp-server/test/index.test.ts`:

```ts
import { describe, it, expect, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/index.js";

describe("Eyes MCP server", () => {
  it("exposes all six tools", async () => {
    const server = createServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    const client = new Client({ name: "test-client", version: "0.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();

    expect(names).toEqual(["click", "fill", "open_page", "screenshot", "start_app", "stop_app"]);

    await client.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/index.test.ts`
Expected: FAIL — `createServer` export does not exist.

- [ ] **Step 3: Implement `mcp-server/src/index.ts`**

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { startApp } from "./tools/startApp.js";
import { openPage } from "./tools/openPage.js";
import { takeScreenshot } from "./tools/screenshot.js";
import { clickElement, fillElement } from "./tools/interact.js";
import { stopApp } from "./tools/stopApp.js";

export function createServer(): McpServer {
  const server = new McpServer({ name: "eyes", version: "0.1.0" });

  server.tool(
    "start_app",
    "Avvia un'app locale rilevando automaticamente lo stack, oppure usa un URL già attivo.",
    { cwd: z.string().optional(), url: z.string().optional(), timeoutMs: z.number().optional() },
    async ({ cwd, url, timeoutMs }) => {
      const result = await startApp({ cwd, url, timeoutMs });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    "open_page",
    "Naviga a una pagina e ritorna screenshot, errori console/network, audit accessibilità e visivo, elementi interattivi.",
    { url: z.string(), viewport: z.object({ width: z.number(), height: z.number() }).optional() },
    async ({ url, viewport }) => {
      const result = await openPage({ url, viewport });
      const { screenshotBase64, ...rest } = result;
      return {
        content: [
          { type: "image", data: screenshotBase64, mimeType: "image/png" },
          { type: "text", text: JSON.stringify(rest) },
        ],
      };
    }
  );

  server.tool(
    "screenshot",
    "Scatta uno screenshot della pagina corrente a un viewport specifico.",
    { viewport: z.object({ width: z.number(), height: z.number() }) },
    async ({ viewport }) => {
      const result = await takeScreenshot({ viewport });
      return { content: [{ type: "image", data: result.screenshotBase64, mimeType: "image/png" }] };
    }
  );

  server.tool(
    "click",
    "Clicca un elemento della pagina corrente; bloccato dal guardrail se sembra distruttivo.",
    { selector: z.string() },
    async ({ selector }) => {
      const result = await clickElement({ selector });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    "fill",
    "Compila un campo della pagina corrente; bloccato dal guardrail se sensibile.",
    { selector: z.string(), value: z.string() },
    async ({ selector, value }) => {
      const result = await fillElement({ selector, value });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool("stop_app", "Ferma l'app avviata e chiude il browser.", {}, async () => {
    const result = await stopApp();
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/index.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run` (from `mcp-server/`)
Expected: PASS — all tests from Tasks 1–12.

- [ ] **Step 6: Commit**

```bash
git add mcp-server/src/index.ts mcp-server/test/index.test.ts
git commit -m "feat: wire all tools into the Eyes MCP server"
```

---

### Task 13: Plugin manifest and skill instructions

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `skills/eyes/SKILL.md`
- Test: `mcp-server/test/plugin-manifest.test.ts`

**Interfaces:**
- Consumes: `createServer` (Task 12) as the entrypoint referenced by the manifest.
- Produces: nothing consumed by later tasks — this is the plugin's public surface.

- [ ] **Step 1: Write the failing test for the manifest**

`mcp-server/test/plugin-manifest.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(here, "..", "..", ".claude-plugin", "plugin.json");

describe("plugin.json", () => {
  it("is valid JSON with the required fields", () => {
    const raw = readFileSync(manifestPath, "utf-8");
    const manifest = JSON.parse(raw);

    expect(manifest.name).toBe("eyes");
    expect(typeof manifest.description).toBe("string");
    expect(manifest.description.length).toBeGreaterThan(0);
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.author).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/plugin-manifest.test.ts`
Expected: FAIL — `.claude-plugin/plugin.json` does not exist.

- [ ] **Step 3: Create `.claude-plugin/plugin.json`**

```json
{
  "name": "eyes",
  "description": "Apre e analizza visivamente siti e app web: naviga, interagisce e segnala bug di layout, problemi di accessibilità ed errori console/rete.",
  "version": "0.1.0",
  "author": {
    "name": "gerefloc45",
    "email": "gerefloc45@gmail.com"
  },
  "skills": ["./skills/eyes"],
  "mcpServers": {
    "eyes": {
      "command": "node",
      "args": ["./mcp-server/dist/index.js"]
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/plugin-manifest.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Create `skills/eyes/SKILL.md`**

```markdown
---
name: eyes
description: Apre un sito o un'app web (avviandola automaticamente se necessario), la naviga e ci interagisce come un utente, e produce un report dei bug di layout, accessibilità, console ed errori di rete trovati. Usa quando l'utente chiede di controllare visivamente un sito/app, trovare bug di UI, o fare QA visivo su qualcosa che sta sviluppando.
---

# Eyes

Guida l'esplorazione tu stesso, un passo alla volta, usando i tool MCP
`start_app`, `open_page`, `screenshot`, `click`, `fill`, `stop_app`.

## Budget

- Massimo **8 pagine** visitate per run.
- Massimo **15 interazioni** (click/fill) per run.
- Se un limite viene raggiunto, fermati e segnalalo nel report ("Note").

## Procedura

1. **Avvio.** Se l'utente ha passato un path di progetto, chiama
   `start_app({ cwd: <path> })`. Se ha passato un URL, chiama
   `start_app({ url: <url> })`. Se non ha passato nulla, usa la
   working directory corrente come `cwd`.
2. **Prima pagina.** Chiama `open_page({ url: <baseUrl> })` con
   l'URL restituito da `start_app`. Osserva lo screenshot, gli errori
   console/network, l'audit automatico (accessibilità e problemi
   visivi) e la lista di elementi interattivi.
3. **Responsività.** Per la pagina corrente, chiama anche
   `screenshot({ viewport: { width: 375, height: 667 } })` (mobile) e
   `screenshot({ viewport: { width: 768, height: 1024 } })` (tablet)
   per controllare che il layout regga anche lì.
4. **Esplorazione.** Guardando lo screenshot e la lista di elementi
   interattivi, scegli quali link seguire e quali bottoni/form provare
   — resta sullo stesso dominio, evita già di proporre azioni
   ovviamente distruttive (il guardrail lato server è una rete di
   sicurezza, non la prima linea di giudizio). Per seguire un link
   interno, usa `click` sul suo selettore e poi `open_page` di nuovo
   sulla nuova URL (o osserva la navigazione avvenuta). Per un bottone,
   usa `click`; per un campo, usa `fill`.
5. **Blocchi del guardrail.** Se `click`/`fill` ritorna
   `performed: false`, annota il motivo (`reason`) nel report sotto
   "Azioni bloccate dai guardrail" e prosegui con un'altra azione.
6. **Ripeti** il ciclo osserva → giudica → agisci per ogni pagina
   nuova, fino al budget massimo.
7. **Chiusura.** Chiama `stop_app()` se l'app era stata avviata da
   Eyes (cioè se non era già un `url` esterno).
8. **Report finale.** Componi il report in questo formato:

```
# Eyes — Report analisi: <nome app/URL>

## Riepilogo
N pagine analizzate, X problemi trovati (Y critici, Z minori)

## Problemi per pagina
### /home
- 🔴 [Critico] Bottone "Acquista" non risponde al click
- 🟡 [Minore] Testo del footer troncato su viewport mobile (375px)
- 🟡 [Accessibilità] Contrasto insufficiente su link nel menu (axe-core: color-contrast)
- ⚪ [Console] Errore JS: "Cannot read property 'x' of undefined" in bundle.js:42

### /prodotti
...

## Note
- Pagine/azioni non esplorate per limite budget: ...
- Azioni bloccate dai guardrail: ...
```

Classifica come 🔴 Critico ciò che rompe una funzionalità (bottone
morto, form che non si invia, crash JS); 🟡 Minore ciò che è visibile
ma non blocca l'uso (contrasto, overflow, testo troncato); ⚪ per
errori console/rete che non hanno un impatto visivo osservato
direttamente.
```

- [ ] **Step 6: Commit**

```bash
git add .claude-plugin/plugin.json skills/eyes/SKILL.md mcp-server/test/plugin-manifest.test.ts
git commit -m "feat: add plugin manifest and eyes skill instructions"
```

---

### Task 14: README, LICENSE and marketplace-readiness polish

**Files:**
- Create: `README.md`
- Create: `LICENSE`
- Modify: `mcp-server/package.json` (add `"license": "MIT"`, `"description"`)

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: nothing consumed by other tasks — terminal task of the plan.

- [ ] **Step 1: Create `LICENSE`**

Use the standard MIT license text, with copyright line:

```
MIT License

Copyright (c) 2026 gerefloc45

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Update `mcp-server/package.json`**

Add to the existing JSON object (merge with Task 1's version):

```json
{
  "description": "MCP server that gives Claude Code a browser to open, navigate and QA web apps for the Eyes plugin.",
  "license": "MIT"
}
```

- [ ] **Step 3: Create `README.md`**

```markdown
# Eyes

Plugin Claude Code che dà a Claude una vista visiva "da utente" su
qualsiasi sito o app web che stai sviluppando: la avvia (o si collega a
un URL già attivo), la naviga e ci interagisce come farebbe una
persona, e produce un report dei bug trovati — layout rotto,
accessibilità, errori console/rete.

## Uso

```
/eyes <url>
/eyes <path-al-progetto>
/eyes
```

Senza argomenti, Eyes usa la working directory corrente e prova a
rilevare come avviare il progetto (Node.js, Django, Flask, FastAPI,
Rails, Docker Compose, o un semplice `index.html` statico).

## Requisiti

- Node.js 18+
- Dopo `npm install` in `mcp-server/`, esegui `npx playwright install chromium`

## Come funziona

- Un server MCP (`mcp-server/`) espone i tool `start_app`, `open_page`,
  `screenshot`, `click`, `fill`, `stop_app`, basati su Playwright.
- La skill `/eyes` (`skills/eyes/SKILL.md`) istruisce Claude a guidare
  l'esplorazione passo passo: osserva screenshot e dati automatici
  (errori console/rete, audit di accessibilità con axe-core, controlli
  di overflow/contrasto), decide quali link/bottoni esplorare, e
  compone un report finale.

## Limitazioni note

- Guardrail di sicurezza bloccano click su elementi che sembrano
  distruttivi (es. "Elimina account", pagamenti), link verso domini
  esterni, e l'inserimento di credenziali reali in form di
  login/signup — vedi `docs/superpowers/specs/2026-08-19-eyes-plugin-design.md`.
- Budget di default: massimo 8 pagine e 15 interazioni per run.
- Nessun bypass dei guardrail nella v1.

## Sviluppo

```
cd mcp-server
npm install
npx playwright install chromium
npm test
```
```

- [ ] **Step 4: Run the full test suite one more time to confirm nothing broke**

Run: `npx vitest run` (from `mcp-server/`)
Expected: PASS — all tests from Tasks 1–13.

- [ ] **Step 5: Commit**

```bash
git add README.md LICENSE mcp-server/package.json
git commit -m "docs: add README and LICENSE, mark package metadata for marketplace"
```

- [ ] **Step 6: Manual marketplace-readiness check (not automated)**

Before submitting to the Claude plugins marketplace, manually verify
`.claude-plugin/plugin.json` against the current plugin schema docs
(field names/shape may have evolved since this plan was written), and
run `npm run build` in `mcp-server/` to confirm `dist/index.js` (the
manifest's entrypoint) is produced without errors.
