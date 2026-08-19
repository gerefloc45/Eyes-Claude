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
