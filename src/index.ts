#!/usr/bin/env node
import express, { type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DEFAULT_HOST, DEFAULT_PORT, SERVER_NAME, SERVER_VERSION } from "./constants.js";
import { createMcpServer } from "./server.js";
import { extractApiKey, isReadOnlyMode, runWithContext } from "./services/context.js";

function allowedHosts(): string[] {
  const configured = process.env.ALLOWED_HOSTS?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
  const host = process.env.HOST ?? DEFAULT_HOST;
  if (configured.length > 0) {
    return configured;
  }
  if (host === "127.0.0.1" || host === "localhost") {
    return ["127.0.0.1", "localhost"];
  }
  return [];
}

function isAllowedHost(req: Request): boolean {
  const hosts = allowedHosts();
  if (hosts.length === 0) {
    return true;
  }
  const raw = req.headers.host;
  if (!raw) {
    return false;
  }
  const hostname = raw.split(":")[0];
  return hosts.includes(raw) || hosts.includes(hostname);
}

function sendUnauthorized(res: Response): void {
  res.setHeader("WWW-Authenticate", 'Bearer realm="starshipit-wms"');
  res.status(401).json({
    error: "unauthorized",
    message: "Provide a Starshipit API key via Authorization: Bearer <key>, x-api-key, or starshipit-api-key."
  });
}

async function handleMcp(
  req: Request,
  res: Response,
  body: unknown
): Promise<void> {
  if (!isAllowedHost(req)) {
    res.status(403).json({ error: "forbidden", message: "Invalid Host header." });
    return;
  }

  const apiKey = extractApiKey(req.headers);
  if (!apiKey) {
    sendUnauthorized(res);
    return;
  }

  await runWithContext({ apiKey }, async () => {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  });
}

async function runHttp(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, x-api-key, starshipit-api-key, Mcp-Session-Id, MCP-Protocol-Version");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      name: SERVER_NAME,
      version: SERVER_VERSION,
      read_only: isReadOnlyMode()
    });
  });

  app.all("/mcp", async (req, res) => {
    try {
      await handleMcp(req, res, req.body);
    } catch (error) {
      console.error("MCP request failed", error instanceof Error ? error.message : error);
      if (!res.headersSent) {
        res.status(500).json({ error: "internal_error" });
      }
    }
  });

  const port = Number.parseInt(process.env.PORT ?? String(DEFAULT_PORT), 10);
  const host = process.env.HOST ?? DEFAULT_HOST;
  app.listen(port, host, () => {
    console.error(`${SERVER_NAME} listening on http://${host}:${port}/mcp`);
    console.error(`Read-only mode: ${isReadOnlyMode()}`);
  });
}

async function runStdio(): Promise<void> {
  if (!process.env.STARSHIPIT_API_KEY) {
    console.error("ERROR: STARSHIPIT_API_KEY is required for stdio transport");
    process.exit(1);
  }
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} running via stdio`);
}

const transport = process.env.TRANSPORT ?? "http";
if (transport === "stdio") {
  runStdio().catch((error: unknown) => {
    console.error("Server error:", error);
    process.exit(1);
  });
} else {
  runHttp().catch((error: unknown) => {
    console.error("Server error:", error);
    process.exit(1);
  });
}
