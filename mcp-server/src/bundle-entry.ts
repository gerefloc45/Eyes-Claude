import { createServer } from "./index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

(async () => {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
})();
