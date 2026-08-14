import { JSONPath } from "jsonpath-plus";
import type { TargetConfig } from "../config/schema.js";
import { hashContent } from "../utils/hash.js";
import { httpGet } from "../utils/http.js";
import { logger } from "../utils/logger.js";
import { BaseMonitor, type MonitorCheckOptions, type MonitorResult } from "./base.js";

/**
 * API monitor - monitors JSON API responses
 */
export class ApiMonitor extends BaseMonitor {
  private apiConfig: TargetConfig & { type: "api" };

  constructor(config: TargetConfig & { type: "api" }) {
    super(config);
    this.apiConfig = config;
  }

  get type(): string {
    return "api";
  }

  async check(options?: MonitorCheckOptions): Promise<MonitorResult> {
    const startTime = Date.now();
    const timeout = this.getTimeout(options);

    try {
      logger.debug(`Fetching API: ${this.url}`);

      const response = await httpGet(this.url, {
        timeout,
        headers: {
          Accept: "application/json",
          ...this.apiConfig.http?.headers,
        },
        retries: this.apiConfig.http?.retries,
        retryDelay: this.apiConfig.http?.retryDelay,
      });

      if (response.status >= 400) {
        return this.createErrorResult(
          `HTTP ${response.status}: ${response.statusText}`,
          Date.now() - startTime
        );
      }

      // Parse JSON response
      let data: unknown;
      if (typeof response.data === "string") {
        try {
          data = JSON.parse(response.data);
        } catch {
          return this.createErrorResult("Response is not valid JSON", Date.now() - startTime);
        }
      } else {
        data = response.data;
      }

      // Extract specific data using JSONPath if configured
      const extractedData = this.extractData(data);
      const content = JSON.stringify(extractedData, null, 2);
      const contentHash = hashContent(content);

      return this.createSuccessResult(content, contentHash, Date.now() - startTime, {
        jsonPath: this.apiConfig.jsonPath,
        responseStatus: response.status,
        dataType: Array.isArray(extractedData) ? "array" : typeof extractedData,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error && error.message.trim()
          ? error.message
          : `Request failed for ${this.url}: ${String(error) || "unknown error"}`;
      logger.debug(`API check failed for ${this.id}: ${errorMessage}`);
      return this.createErrorResult(errorMessage, Date.now() - startTime);
    }
  }

  /**
   * Extract data using JSONPath if configured
   */
  private extractData(data: unknown): unknown {
    if (!this.apiConfig.jsonPath) {
      return data;
    }

    const result = JSONPath({
      path: this.apiConfig.jsonPath,
      json: data as Record<string, unknown>,
      wrap: false,
    });

    if (result === undefined) {
      throw new Error(
        `JSONPath '${this.apiConfig.jsonPath}' returned no results for target ${this.id}`
      );
    }

    return result;
  }
}
