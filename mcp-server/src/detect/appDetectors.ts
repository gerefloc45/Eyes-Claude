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
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      const scripts: Record<string, string> = pkg.scripts ?? {};
      for (const scriptName of ["dev", "start", "serve"]) {
        if (scripts[scriptName]) {
          return { command: "npm", args: ["run", scriptName], stack: `node:${scriptName}` };
        }
      }
    } catch {
      // Malformed JSON, skip this heuristic and continue to the next
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
