import { CHARACTER_LIMIT } from "../constants.js";
import { ResponseFormat, type PaginationMeta, type ToolOutput } from "../types.js";

export function paginationFromWms(data: unknown, requestedPage?: number): PaginationMeta {
  if (!data || typeof data !== "object") {
    return {};
  }
  const record = data as Record<string, unknown>;
  const pagination = (record.pagination ?? record) as Record<string, unknown>;

  const page = asNumber(pagination.page) ?? requestedPage;
  const limit = asNumber(pagination.limit) ?? asNumber(pagination.pageSize);
  const totalCount = asNumber(pagination.totalCount) ?? asNumber(record.totalCount);
  const totalPages = asNumber(pagination.totalPages) ?? asNumber(record.totalPages);
  const hasNext = typeof pagination.hasNext === "boolean"
    ? pagination.hasNext
    : totalPages !== undefined && page !== undefined
      ? page < totalPages
      : undefined;

  return {
    ...(page !== undefined ? { page } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(asNumber(pagination.pageSize) !== undefined ? { pageSize: asNumber(pagination.pageSize) } : {}),
    ...(totalCount !== undefined ? { total_count: totalCount } : {}),
    ...(totalPages !== undefined ? { total_pages: totalPages } : {}),
    ...(hasNext !== undefined ? { has_more: hasNext } : {}),
    ...(hasNext && page !== undefined ? { next_page: page + 1 } : {})
  };
}

export function formatToolResult(output: ToolOutput, responseFormat: ResponseFormat, markdown?: string): {
  text: string;
  structured: ToolOutput;
} {
  const limited = applyCharacterLimit(output, responseFormat === ResponseFormat.MARKDOWN
    ? markdown ?? toMarkdown(output)
    : JSON.stringify(output, null, 2));

  return {
    text: limited.text,
    structured: limited.output
  };
}

export function toMarkdown(value: unknown, title?: string): string {
  const lines: string[] = [];
  if (title) {
    lines.push(`# ${title}`, "");
  }
  renderMarkdown(value, lines, 0);
  return lines.join("\n").trim();
}

function applyCharacterLimit(output: ToolOutput, text: string): { text: string; output: ToolOutput } {
  if (text.length <= CHARACTER_LIMIT) {
    return { text, output };
  }

  const items = findLargestArray(output);
  if (items && Array.isArray(items.value) && items.value.length > 1) {
    const reduced = Math.max(1, Math.floor(items.value.length / 2));
    const next: ToolOutput = {
      ...output,
      [items.key]: items.value.slice(0, reduced),
      truncated: true,
      truncation_message:
        `Response truncated from ${items.value.length} to ${reduced} items. Use page/limit filters to request a smaller set.`
    };
    const retryText = JSON.stringify(next, null, 2);
    if (retryText.length > CHARACTER_LIMIT) {
      const hard: ToolOutput = {
        truncated: true,
        truncation_message: "Response exceeded the 25000 character limit. Add filters or request a single record by ID."
      };
      return { text: JSON.stringify(hard, null, 2), output: hard };
    }
    return { text: retryText, output: next };
  }

  const hard: ToolOutput = {
    truncated: true,
    truncation_message: "Response exceeded the 25000 character limit. Add filters or request a single record by ID."
  };
  return { text: JSON.stringify(hard, null, 2), output: hard };
}

function findLargestArray(output: ToolOutput): { key: string; value: unknown[] } | undefined {
  let best: { key: string; value: unknown[] } | undefined;
  for (const [key, value] of Object.entries(output)) {
    if (Array.isArray(value) && value.length > (best?.value.length ?? 0)) {
      best = { key, value };
    }
  }
  return best;
}

function renderMarkdown(value: unknown, lines: string[], depth: number): void {
  if (value == null) {
    lines.push("null");
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      lines.push("_No items_");
      return;
    }
    for (const item of value) {
      if (item && typeof item === "object") {
        const heading = headingFor(item);
        lines.push(`${"#".repeat(Math.min(depth + 2, 6))} ${heading}`);
        renderObject(item as Record<string, unknown>, lines);
        lines.push("");
      } else {
        lines.push(`- ${String(item)}`);
      }
    }
    return;
  }
  if (typeof value === "object") {
    renderObject(value as Record<string, unknown>, lines);
    return;
  }
  lines.push(String(value));
}

function renderObject(record: Record<string, unknown>, lines: string[]): void {
  for (const [key, value] of Object.entries(record)) {
    if (value == null || value === "") {
      continue;
    }
    if (Array.isArray(value)) {
      lines.push(`- **${key}**: ${value.length} item(s)`);
      continue;
    }
    if (typeof value === "object") {
      lines.push(`- **${key}**:`);
      for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
        if (childValue == null || typeof childValue === "object") {
          continue;
        }
        lines.push(`  - ${childKey}: ${String(childValue)}`);
      }
      continue;
    }
    lines.push(`- **${key}**: ${String(value)}`);
  }
}

function headingFor(item: unknown): string {
  if (!item || typeof item !== "object") {
    return "Item";
  }
  const record = item as Record<string, unknown>;
  const name = pickString(record, ["displayName", "name", "sku", "poNumber", "orderNumber"]);
  const id = pickString(record, ["id", "productId", "jobId"]);
  if (name && id) {
    return `${name} (${id})`;
  }
  return name ?? id ?? "Item";
}

function pickString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
