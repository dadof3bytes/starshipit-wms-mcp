import { z } from "zod";
import { ResponseFormat } from "../types.js";

export const ResponseFormatSchema = z
  .nativeEnum(ResponseFormat)
  .default(ResponseFormat.MARKDOWN)
  .describe("Output format: markdown for humans, json for programmatic processing");

export const IdSchema = z
  .string()
  .min(1, "Record ID is required")
  .describe("WMS record ID. Do not use SKU, barcode, name, or order number.");

export const PageSchema = z
  .number()
  .int()
  .min(1)
  .default(1)
  .describe("1-based page number");

export const PerformedBySchema = z
  .object({
    userType: z.string().min(1).describe("Actor category. Required when performedBy is supplied."),
    userId: z.number().int().optional().describe("Numeric user ID. Omit for a system actor."),
    userName: z.string().optional().describe("Optional display name for a parent or multiuser actor.")
  })
  .strict()
  .optional()
  .describe("Optional actor context used when the request does not already identify a user.");

export function withResponseFormat<T extends z.ZodRawShape>(shape: T) {
  return z.object({
    ...shape,
    response_format: ResponseFormatSchema
  }).strict();
}

export function omitUndefined<T extends Record<string, unknown>>(record: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

export function omitToolMeta<T extends Record<string, unknown>>(
  params: T
): Omit<T, "response_format"> {
  const { response_format: _responseFormat, ...rest } = params;
  return rest;
}
