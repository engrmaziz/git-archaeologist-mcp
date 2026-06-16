import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "git-archaeologist", version: "0.1.0" });

// A trivial tool first, just to prove the server works end-to-end.
server.tool(
  "ping",
  { message: z.string() },
  async ({ message }) => ({
    content: [{ type: "text", text: `pong: ${message}` }],
  })
);

const transport = new StdioServerTransport();
await server.connect(transport);
