import type { NotificationChannel } from "../config/schema.js";
import type { ChangeDetectionResult } from "../core/detector.js";
import type { MonitorResult } from "../monitors/base.js";
import { truncateDiffForNotification } from "../utils/diff.js";

/**
 * Notification payload
 */
export interface NotificationPayload {
  targetId: string;
  targetName: string;
  url: string;
  webUrl?: string;
  hasChanges: boolean;
  changeResult?: ChangeDetectionResult;
  monitorResult: MonitorResult;
  timestamp: string;
}

/**
 * Notification result
 */
export interface NotificationResult {
  channel: NotificationChannel;
  success: boolean;
  error?: string;
  duration: number;
}

/**
 * Abstract base class for all notifiers
 */
export abstract class BaseNotifier<TConfig = unknown> {
  protected config: TConfig;

  constructor(config: TConfig) {
    this.config = config;
  }

  /**
   * Get the notification channel type
   */
  abstract get channel(): NotificationChannel;

  /**
   * Send a notification
   */
  abstract send(payload: NotificationPayload): Promise<NotificationResult>;

  /**
   * Validate the notifier configuration
   */
  abstract validateConfig(): boolean;

  /**
   * Test the notification channel
   */
  abstract test(): Promise<NotificationResult>;

  /**
   * Check if the notifier is enabled
   */
  abstract isEnabled(): boolean;

  /**
   * Format a title for the notification
   */
  protected formatTitle(payload: NotificationPayload): string {
    const { targetName, hasChanges, monitorResult } = payload;

    if (!monitorResult.success) {
      return `❌ Error: ${targetName}`;
    }

    if (hasChanges) {
      return `⚡ Change Detected: ${targetName}`;
    }

    return `✓ No Changes: ${targetName}`;
  }

  /**
   * Format a message body for the notification
   */
  protected formatBody(payload: NotificationPayload): string {
    const { targetName, url, webUrl, hasChanges, changeResult, monitorResult } = payload;
    const linkUrl = webUrl ?? url;
    const lines: string[] = [];

    lines.push(`**Target:** ${targetName}`);
    lines.push(`**URL:** ${linkUrl}`);
    lines.push(`**Time:** ${payload.timestamp}`);

    if (!monitorResult.success) {
      lines.push("");
      lines.push("**Error:**");
      lines.push(monitorResult.error ?? "Unknown error");
    } else if (hasChanges && changeResult) {
      lines.push("");
      lines.push("**Change Summary:**");
      if (changeResult.changeSummary) {
        lines.push(changeResult.changeSummary);
      }
      if (changeResult.diffText) {
        lines.push("");
        lines.push("```diff");
        const { text, truncated } = truncateDiffForNotification(changeResult.diffText);
        lines.push(text);
        lines.push("```");
        if (truncated) {
          lines.push(`⚠️ 变更较多，完整内容见：${linkUrl}`);
        }
      }
    }

    return lines.join("\n");
  }

  /**
   * Create a successful notification result
   */
  protected createSuccessResult(duration: number): NotificationResult {
    return {
      channel: this.channel,
      success: true,
      duration,
    };
  }

  /**
   * Create a failed notification result
   */
  protected createErrorResult(error: string, duration: number): NotificationResult {
    return {
      channel: this.channel,
      success: false,
      error,
      duration,
    };
  }
}

/**
 * Custom error for notifier issues
 */
export class NotifierError extends Error {
  constructor(
    message: string,
    public readonly channel: NotificationChannel,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "NotifierError";
  }
}
