import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatToolResult, paginationFromWms, toMarkdown } from "../services/format.js";
import { handleApiError } from "../services/errors.js";
import { isReadOnlyMode } from "../services/context.js";
import { ResponseFormat, type ToolOutput } from "../types.js";

export interface ToolDefinition<TSchema extends z.ZodTypeAny> {
  name: string;
  title: string;
  description: string;
  inputSchema: TSchema;
  readOnly: boolean;
  destructive?: boolean;
  idempotent?: boolean;
  handler: (params: z.infer<TSchema>) => Promise<{
    output: ToolOutput;
    markdown?: string;
    responseFormat: ResponseFormat;
  }>;
}

export function registerDefinedTool<TSchema extends z.ZodTypeAny>(
  server: McpServer,
  definition: ToolDefinition<TSchema>
): void {
  if (!definition.readOnly && isReadOnlyMode()) {
    return;
  }

  const shape = definition.inputSchema instanceof z.ZodObject
    ? definition.inputSchema.shape
    : {};

  server.registerTool(
    definition.name,
    {
      title: definition.title,
      description: definition.description,
      inputSchema: shape,
      annotations: {
        readOnlyHint: definition.readOnly,
        destructiveHint: definition.destructive ?? !definition.readOnly,
        idempotentHint: definition.idempotent ?? definition.readOnly,
        openWorldHint: true
      }
    },
    async (params: Record<string, unknown>) => {
      try {
        const parsed = definition.inputSchema.parse(params) as z.infer<TSchema>;
        const result = await definition.handler(parsed);
        const formatted = formatToolResult(result.output, result.responseFormat, result.markdown);
        return {
          content: [{ type: "text" as const, text: formatted.text }],
          structuredContent: formatted.structured
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: handleApiError(error)
          }]
        };
      }
    }
  );
}

export function wrapList(
  data: unknown,
  itemsKey: string,
  items: unknown[],
  responseFormat: ResponseFormat,
  title: string,
  page?: number
): { output: ToolOutput; markdown: string; responseFormat: ResponseFormat } {
  const output: ToolOutput = {
    [itemsKey]: items,
    ...paginationFromWms(data, page)
  };
  return {
    output,
    markdown: toMarkdown(output, title),
    responseFormat
  };
}

export function wrapRecord(
  data: unknown,
  responseFormat: ResponseFormat,
  title: string
): { output: ToolOutput; markdown: string; responseFormat: ResponseFormat } {
  const output = (data && typeof data === "object" ? data : { result: data }) as ToolOutput;
  return {
    output,
    markdown: toMarkdown(output, title),
    responseFormat
  };
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function pickItems(data: unknown, keys: string[]): unknown[] {
  if (Array.isArray(data)) {
    return data;
  }
  if (!data || typeof data !== "object") {
    return [];
  }
  const record = data as Record<string, unknown>;
  for (const key of keys) {
    if (Array.isArray(record[key])) {
      return record[key];
    }
  }
  return [];
}
