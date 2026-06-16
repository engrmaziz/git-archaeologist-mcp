#!/usr/bin/env node

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
    try {
      const story = await dig.explain(file, startLine, endLine);
      return { content: [{ type: "text", text: story }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "who_knows_about",
  { path: z.string().describe("File path to find expert contributors for") },
  async ({ path }) => {
    try {
      const result = await dig.experts(path);
      return { content: [{ type: "text", text: result }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
    }
  }
);



await server.connect(new StdioServerTransport());


