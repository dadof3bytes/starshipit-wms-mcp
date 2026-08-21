export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json"
}

export interface RequestContext {
  apiKey: string;
}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface PaginationMeta {
  page?: number;
  limit?: number;
  pageSize?: number;
  total_count?: number;
  total_pages?: number;
  has_more?: boolean;
  next_page?: number;
}

export interface ToolOutput {
  [key: string]: unknown;
  truncated?: boolean;
  truncation_message?: string;
}

export class WmsApiError extends Error {
  readonly status?: number;
  readonly body?: unknown;
  readonly suggestion: string;

  constructor(message: string, options?: { status?: number; body?: unknown; suggestion?: string }) {
    super(message);
    this.name = "WmsApiError";
    this.status = options?.status;
    this.body = options?.body;
    this.suggestion = options?.suggestion ?? "";
  }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}
