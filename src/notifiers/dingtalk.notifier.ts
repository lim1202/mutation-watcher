import crypto from "node:crypto";
import type { DingTalkConfig, NotificationChannel } from "../config/schema.js";
import { httpPost } from "../utils/http.js";
import { logger } from "../utils/logger.js";
import { BaseNotifier, type NotificationPayload, type NotificationResult } from "./base.js";

/**
 * DingTalk API response
 */
interface DingTalkResponse {
  errcode: number;
  errmsg: string;
}

/**
 * DingTalk notifier implementation
 */
export class DingTalkNotifier extends BaseNotifier<DingTalkConfig> {
  get channel(): NotificationChannel {
    return "dingtalk";
  }

  isEnabled(): boolean {
    return this.config.enabled ?? true;
  }

  validateConfig(): boolean {
    if (!this.config.webhook) {
      throw new Error("DingTalk webhook URL is required");
    }

    if (!this.config.webhook.startsWith("https://oapi.dingtalk.com/")) {
      throw new Error("Invalid DingTalk webhook URL");
    }

    return true;
  }

  async send(payload: NotificationPayload): Promise<NotificationResult> {
    const startTime = Date.now();

    try {
      const webhookUrl = this.buildWebhookUrl();
      const message = this.buildMessage(payload);

      logger.debug(`Sending DingTalk notification for: ${payload.targetId}`);

      const response = await httpPost(webhookUrl, message, {
        timeout: 10000,
      });

      const data = response.data as DingTalkResponse;

      if (data.errcode !== 0) {
        return this.createErrorResult(`DingTalk API error: ${data.errmsg}`, Date.now() - startTime);
      }

      return this.createSuccessResult(Date.now() - startTime);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.debug(`DingTalk notification failed: ${errorMessage}`);
      return this.createErrorResult(errorMessage, Date.now() - startTime);
    }
  }

  async test(): Promise<NotificationResult> {
    const testPayload: NotificationPayload = {
      targetId: "test",
      targetName: "Test Target",
      url: "https://example.com",
      hasChanges: false,
      monitorResult: {
        targetId: "test",
        targetName: "Test Target",
        url: "https://example.com",
        timestamp: new Date().toISOString(),
        success: true,
        content: "",
        contentHash: "",
        duration: 0,
      },
      timestamp: new Date().toISOString(),
    };

    return this.send(testPayload);
  }

  /**
   * Build webhook URL with signature if secret is configured
   */
  private buildWebhookUrl(): string {
    let url = this.config.webhook;

    if (this.config.secret) {
      const timestamp = Date.now();
      const stringToSign = `${timestamp}\n${this.config.secret}`;
      const hmac = crypto.createHmac("sha256", this.config.secret);
      hmac.update(stringToSign);
      const sign = encodeURIComponent(hmac.digest("base64"));
      url = `${url}&timestamp=${timestamp}&sign=${sign}`;
    }

    return url;
  }

  /**
   * Build message body based on configured message type
   */
  private buildMessage(payload: NotificationPayload): Record<string, unknown> {
    const msgType = this.config.msgType ?? "markdown";

    switch (msgType) {
      case "text":
        return this.buildTextMessage(payload);
      case "markdown":
        return this.buildMarkdownMessage(payload);
      case "actionCard":
        return this.buildActionCardMessage(payload);
      default:
        return this.buildMarkdownMessage(payload);
    }
  }

  /**
   * Build text message
   */
  private buildTextMessage(payload: NotificationPayload): Record<string, unknown> {
    const title = this.formatTitle(payload);
    const body = this.formatBody(payload);

    return {
      msgtype: "text",
      text: {
        content: `${title}\n\n${body}`,
      },
      at: this.buildAtConfig(),
    };
  }

  /**
   * Build markdown message
   */
  private buildMarkdownMessage(payload: NotificationPayload): Record<string, unknown> {
    const title = this.formatTitle(payload);
    const body = this.formatBody(payload);

    return {
      msgtype: "markdown",
      markdown: {
        title,
        text: this.renderMarkdown(`### ${title}\n\n${body}`),
      },
      at: this.buildAtConfig(),
    };
  }

  /**
   * Build action card message
   */
  private buildActionCardMessage(payload: NotificationPayload): Record<string, unknown> {
    const title = this.formatTitle(payload);
    const body = this.formatBody(payload);
    const jumpUrl = payload.webUrl ?? payload.url;

    return {
      msgtype: "actionCard",
      actionCard: {
        title,
        text: this.renderMarkdown(`### ${title}\n\n${body}`),
        singleTitle: "View Details",
        singleURL: jumpUrl,
      },
    };
  }

  /**
   * DingTalk markdown collapses a bare newline inside a paragraph into a
   * space. Only CommonMark hard breaks (two trailing spaces before the
   * newline) render as line breaks. Convert each soft break to a hard break,
   * but leave the content of fenced code blocks untouched.
   */
  private renderMarkdown(text: string): string {
    const lines = text.split("\n");
    const rendered: string[] = [];
    let inCodeBlock = false;

    for (const line of lines) {
      if (/^```/.test(line.trim())) {
        inCodeBlock = !inCodeBlock;
        rendered.push(line);
        continue;
      }
      if (inCodeBlock) {
        if (line.startsWith("- ")) {
          rendered.push(`🔴 Removed | ${line.slice(2)}`);
        } else if (line.startsWith("+ ")) {
          rendered.push(`🟢 Added | ${line.slice(2)}`);
        } else {
          rendered.push(line);
        }
      } else {
        rendered.push(`${line}  `);
      }
    }

    return rendered.join("\n");
  }

  /**
   * Build @mention configuration
   */
  private buildAtConfig(): Record<string, unknown> {
    const at: Record<string, unknown> = {};

    if (this.config.atAll) {
      at.isAtAll = true;
    }

    if (this.config.atMobiles && this.config.atMobiles.length > 0) {
      at.atMobiles = this.config.atMobiles;
    }

    return at;
  }
}
