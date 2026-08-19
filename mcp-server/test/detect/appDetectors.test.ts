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
