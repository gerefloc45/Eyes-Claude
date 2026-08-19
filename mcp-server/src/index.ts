import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
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

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
