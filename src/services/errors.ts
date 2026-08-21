import axios from "axios";
import { AuthError, WmsApiError } from "../types.js";

export function handleApiError(error: unknown): string {
  if (error instanceof AuthError) {
    return `Error: ${error.message}`;
  }

  if (error instanceof WmsApiError) {
    const parts = [`Error: ${error.message}`];
    if (error.suggestion) {
      parts.push(error.suggestion);
    }
    return parts.join(" ");
  }

  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const body = summarizeBody(error.response?.data);

    switch (status) {
      case 400:
        return `Error: Invalid request (400). ${body} Correct the parameters or body and do not retry unchanged.`;
      case 401:
        return "Error: Authentication failed (401). Replace or correct the Starshipit API key. Stop retries.";
      case 403:
        return `Error: Permission denied (403). ${body} Confirm the key belongs to a WMS account and has this permission.`;
      case 404:
        return `Error: Resource not found (404). ${body} Confirm the WMS record ID (not SKU, barcode, name, or order number) and that the key is for this account.`;
      case 409:
        return `Error: Warehouse state conflict (409). ${body} Re-read the record, then decide whether to skip, correct, or send for manual review. Do not blindly retry.`;
      case 422:
        return `Error: Validation failed (422). ${body} Correct the payload before retrying.`;
      case 429:
        return "Error: Rate limit exceeded (429). Wait and retry with backoff. Developer access is limited to 2 requests per second.";
      default:
        if (status && status >= 500) {
          return `Error: WMS server error (${status}). ${body} Re-read current state before retrying. Alert if failures continue.`;
        }
        if (error.code === "ECONNABORTED") {
          return "Error: Request timed out. Re-read the record before retrying a write. Writes have no idempotency key.";
        }
        return `Error: API request failed${status ? ` with status ${status}` : ""}. ${body}`;
    }
  }

  return `Error: Unexpected error occurred: ${error instanceof Error ? error.message : String(error)}`;
}

export function isWmsFailurePayload(data: unknown): boolean {
  if (!data || typeof data !== "object") {
    return false;
  }
  const record = data as { success?: unknown };
  return record.success === false;
}

function summarizeBody(data: unknown): string {
  if (data == null) {
    return "";
  }
  if (typeof data === "string") {
    return data.slice(0, 400);
  }
  if (typeof data === "object") {
    const record = data as { message?: unknown; error?: unknown; errors?: unknown };
    if (typeof record.message === "string") {
      return record.message;
    }
    if (typeof record.error === "string") {
      return record.error;
    }
    try {
      return JSON.stringify(data).slice(0, 400);
    } catch {
      return "";
    }
  }
  return String(data);
}
