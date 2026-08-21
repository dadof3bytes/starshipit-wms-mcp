import axios, { type AxiosRequestConfig, type Method } from "axios";
import { MIN_REQUEST_INTERVAL_MS, MAX_RETRIES, REQUEST_TIMEOUT_MS, WMS_BASE_URL } from "../constants.js";
import { WmsApiError } from "../types.js";
import { getApiKey } from "./context.js";
import { isWmsFailurePayload } from "./errors.js";

const client = axios.create({
  baseURL: WMS_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: {
    Accept: "application/json"
  },
  validateStatus: (status) => status >= 200 && status < 300
});

let gate: Promise<void> = Promise.resolve();
let nextAllowedAt = 0;

async function throttle(): Promise<void> {
  const previous = gate;
  let release: () => void = () => undefined;
  gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    const wait = Math.max(0, nextAllowedAt - Date.now());
    if (wait > 0) {
      await sleep(wait);
    }
    nextAllowedAt = Date.now() + MIN_REQUEST_INTERVAL_MS;
  } finally {
    release();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function wmsRequest<T>(
  method: Method,
  path: string,
  options?: {
    params?: Record<string, unknown>;
    data?: unknown;
  }
): Promise<T> {
  const apiKey = getApiKey();
  const config: AxiosRequestConfig = {
    method,
    url: path,
    params: compactParams(options?.params),
    data: options?.data,
    headers: {
      "starshipit-api-key": apiKey,
      ...(options?.data !== undefined ? { "Content-Type": "application/json" } : {})
    }
  };

  let attempt = 0;
  while (true) {
    await throttle();
    try {
      const response = await client.request<T>(config);
      if (isWmsFailurePayload(response.data)) {
        const message = extractMessage(response.data) || "WMS returned success=false";
        throw new WmsApiError(message, {
          status: response.status,
          body: response.data,
          suggestion: "Correct the problem in the message before retrying. Some WMS workflow failures use HTTP 200 with success=false."
        });
      }
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 429 && attempt < MAX_RETRIES) {
        attempt += 1;
        const backoff = Math.min(8_000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
        await sleep(backoff);
        continue;
      }
      throw error;
    }
  }
}

export async function wmsGet<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  return wmsRequest<T>("GET", path, { params });
}

export async function wmsPost<T>(path: string, data?: unknown, params?: Record<string, unknown>): Promise<T> {
  return wmsRequest<T>("POST", path, { data, params });
}

export async function wmsPut<T>(path: string, data?: unknown): Promise<T> {
  return wmsRequest<T>("PUT", path, { data });
}

export async function wmsPatch<T>(path: string, data?: unknown): Promise<T> {
  return wmsRequest<T>("PATCH", path, { data });
}

export async function wmsDelete<T>(path: string, data?: unknown): Promise<T> {
  return wmsRequest<T>("DELETE", path, { data });
}

function compactParams(params?: Record<string, unknown>): Record<string, string | number | boolean> | undefined {
  if (!params) {
    return undefined;
  }
  const result: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      result[key] = value;
    }
  }
  return result;
}

function extractMessage(data: unknown): string | undefined {
  if (!data || typeof data !== "object") {
    return undefined;
  }
  const record = data as { message?: unknown };
  return typeof record.message === "string" ? record.message : undefined;
}
