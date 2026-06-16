import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Archaeologist } from "./archaeologist.js";

// REPO_PATH lets users point the server at any local repo.
const repoPath = process.env.REPO_PATH || process.cwd();
const dig = new Archaeologist(repoPath);

const server = new McpServer({ name: "git-archaeologist", version: "0.1.0" });

server.tool(
  "why_does_this_exist",
  {
    file: z.string().describe("Path to the file, relative to the repo root"),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
  },
  async ({ file, startLine, endLine }) => {
    const story = await dig.explain(file, startLine, endLine);
    return { content: [{ type: "text", text: story }] };
  }
);

await server.connect(new StdioServerTransport());
