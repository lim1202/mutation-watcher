import axios, { type AxiosError, type AxiosRequestConfig } from "axios";
import { logger } from "./logger.js";

/**
 * HTTP response wrapper
 */
export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: unknown;
  duration: number;
}

/**
 * HTTP request options
 */
export interface HttpOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  headers?: Record<string, string>;
  followRedirects?: boolean;
  validateStatus?: (status: number) => boolean;
}

/**
 * Default HTTP options
 */
const DEFAULT_OPTIONS: Required<Omit<HttpOptions, "headers" | "validateStatus">> = {
  timeout: 30000,
  retries: 3,
  retryDelay: 1000,
  followRedirects: true,
};

/**
 * Check if an error is retryable
 */
function isRetryableError(error: AxiosError): boolean {
  // Network errors
  if (error.code === "ECONNRESET" || error.code === "ETIMEDOUT" || error.code === "ENOTFOUND") {
    return true;
  }

  // Server errors (5xx)
  if (error.response?.status && error.response.status >= 500) {
    return true;
  }

  // Rate limiting
  if (error.response?.status === 429) {
    return true;
  }

  return false;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Make an HTTP GET request with retry support
 */
export async function httpGet(url: string, options: HttpOptions = {}): Promise<HttpResponse> {
  const opts = {
    timeout: options.timeout ?? DEFAULT_OPTIONS.timeout,
    retries: options.retries ?? DEFAULT_OPTIONS.retries,
    retryDelay: options.retryDelay ?? DEFAULT_OPTIONS.retryDelay,
    followRedirects: options.followRedirects ?? DEFAULT_OPTIONS.followRedirects,
  };

  const axiosConfig: AxiosRequestConfig = {
    method: "GET",
    url,
    timeout: opts.timeout,
    headers: {
      "User-Agent": "MutationWatcher/1.0",
      Accept: "*/*",
      ...options.headers,
    },
    maxRedirects: opts.followRedirects ? 10 : 0,
    validateStatus: options.validateStatus ?? ((status) => status < 400),
  };

  let lastError: AxiosError | null = null;

  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    const startTime = Date.now();

    try {
      const response = await axios(axiosConfig);
      const duration = Date.now() - startTime;

      return {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers as Record<string, string>,
        data: response.data,
        duration,
      };
    } catch (error) {
      lastError = error as AxiosError;
      const duration = Date.now() - startTime;

      if (attempt < opts.retries && lastError && isRetryableError(lastError)) {
        logger.debug(
          `HTTP request failed (attempt ${attempt + 1}/${opts.retries + 1}), retrying in ${opts.retryDelay}ms...`,
          lastError.message
        );
        await sleep(opts.retryDelay * (attempt + 1)); // Exponential backoff
        continue;
      }

      // Non-retryable error or max retries reached
      if (lastError?.response) {
        return {
          status: lastError.response.status,
          statusText: lastError.response.statusText,
          headers: lastError.response.headers as Record<string, string>,
          data: lastError.response.data,
          duration,
        };
      }

      throw new HttpError(
        lastError?.message?.trim() || lastError?.code || "Unknown HTTP error",
        lastError?.code,
        url
      );
    }
  }

  throw new HttpError(
    lastError?.message?.trim() || lastError?.code || "Max retries exceeded",
    lastError?.code,
    url
  );
}

/**
 * Make an HTTP POST request
 */
export async function httpPost(
  url: string,
  data?: unknown,
  options: HttpOptions = {}
): Promise<HttpResponse> {
  const opts = {
    timeout: options.timeout ?? DEFAULT_OPTIONS.timeout,
    retries: options.retries ?? DEFAULT_OPTIONS.retries,
    retryDelay: options.retryDelay ?? DEFAULT_OPTIONS.retryDelay,
    followRedirects: options.followRedirects ?? DEFAULT_OPTIONS.followRedirects,
  };

  const axiosConfig: AxiosRequestConfig = {
    method: "POST",
    url,
    timeout: opts.timeout,
    data,
    headers: {
      "User-Agent": "MutationWatcher/1.0",
      "Content-Type": "application/json",
      ...options.headers,
    },
    maxRedirects: opts.followRedirects ? 10 : 0,
    validateStatus: options.validateStatus ?? ((status) => status < 400),
  };

  let lastError: AxiosError | null = null;

  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    const startTime = Date.now();

    try {
      const response = await axios(axiosConfig);
      const duration = Date.now() - startTime;

      return {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers as Record<string, string>,
        data: response.data,
        duration,
      };
    } catch (error) {
      lastError = error as AxiosError;
      const duration = Date.now() - startTime;

      if (attempt < opts.retries && lastError && isRetryableError(lastError)) {
        logger.debug(
          `HTTP POST request failed (attempt ${attempt + 1}/${opts.retries + 1}), retrying...`,
          lastError.message
        );
        await sleep(opts.retryDelay * (attempt + 1));
        continue;
      }

      if (lastError?.response) {
        return {
          status: lastError.response.status,
          statusText: lastError.response.statusText,
          headers: lastError.response.headers as Record<string, string>,
          data: lastError.response.data,
          duration,
        };
      }

      throw new HttpError(
        lastError?.message?.trim() || lastError?.code || "Unknown HTTP error",
        lastError?.code,
        url
      );
    }
  }

  throw new HttpError(
    lastError?.message?.trim() || lastError?.code || "Max retries exceeded",
    lastError?.code,
    url
  );
}

/**
 * Custom HTTP error class
 */
export class HttpError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly url?: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}
