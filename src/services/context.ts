import { AsyncLocalStorage } from "node:async_hooks";
import type { IncomingHttpHeaders } from "node:http";
import { AuthError, type RequestContext } from "../types.js";

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(context: RequestContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(context, fn);
}

export function getApiKey(): string {
  const fromStore = storage.getStore()?.apiKey;
  if (fromStore) {
    return fromStore;
  }

  const fromEnv = process.env.STARSHIPIT_API_KEY?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  throw new AuthError(
    "Missing Starshipit API key. Send Authorization: Bearer <key>, x-api-key, or starshipit-api-key. For local Inspector, set STARSHIPIT_API_KEY."
  );
}

export function extractApiKey(headers: IncomingHttpHeaders): string | undefined {
  const authorization = headerValue(headers.authorization);
  if (authorization) {
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  const xApiKey = headerValue(headers["x-api-key"]);
  if (xApiKey) {
    return xApiKey;
  }

  const starshipit = headerValue(headers["starshipit-api-key"]);
  if (starshipit) {
    return starshipit;
  }

  return process.env.STARSHIPIT_API_KEY?.trim() || undefined;
}

export function isReadOnlyMode(): boolean {
  const value = process.env.STARSHIPIT_WMS_READ_ONLY?.trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0]?.trim() || undefined;
  }
  return value?.trim() || undefined;
}
