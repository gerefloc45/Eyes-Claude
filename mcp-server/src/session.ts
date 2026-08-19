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
    try {
      if (this.appProcess && !this.appProcess.killed) {
        if (this.detectedStack === "docker-compose" && this.appCwd) {
          execSync("docker compose down", { cwd: this.appCwd });
        } else {
          this.appProcess.kill();
        }
      }
    } catch (error) {
      // Swallow errors from app-process cleanup to ensure page/browser cleanup always runs
      console.error("Failed to clean up app process:", error);
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
