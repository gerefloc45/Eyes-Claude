import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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
    "Starts a local app by auto-detecting its stack, or uses an already-running URL.",
    { cwd: z.string().optional(), url: z.string().optional(), timeoutMs: z.number().optional() },
    async ({ cwd, url, timeoutMs }) => {
      const result = await startApp({ cwd, url, timeoutMs });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    "open_page",
    "Navigates to a page and returns a screenshot, console/network errors, accessibility and visual audits, and interactive elements.",
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
    "Takes a screenshot of the current page at a specific viewport.",
    { viewport: z.object({ width: z.number(), height: z.number() }) },
    async ({ viewport }) => {
      const result = await takeScreenshot({ viewport });
      return { content: [{ type: "image", data: result.screenshotBase64, mimeType: "image/png" }] };
    }
  );

  server.tool(
    "click",
    "Clicks an element on the current page; blocked by the guardrail if it looks destructive.",
    { selector: z.string() },
    async ({ selector }) => {
      const result = await clickElement({ selector });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    "fill",
    "Fills a field on the current page; blocked by the guardrail if it's sensitive.",
    { selector: z.string(), value: z.string() },
    async ({ selector, value }) => {
      const result = await fillElement({ selector, value });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool("stop_app", "Stops the started app and closes the browser.", {}, async () => {
    const result = await stopApp();
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  return server;
}
