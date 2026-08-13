import pLimit from "p-limit";
import type { Config, TargetConfig } from "../config/index.js";
import { loadConfig } from "../config/index.js";
import { createMonitor } from "../monitors/index.js";
import { type NotificationPayload, createNotifiers } from "../notifiers/index.js";
import { createTargetState } from "../storage/base.js";
import { createStorage } from "../storage/index.js";
import { logger } from "../utils/logger.js";
import { ChangeDetector } from "./detector.js";
import { type ExecutionSummary, type ProcessedResult, ResultHandler } from "./result-handler.js";

/**
 * Engine options
 */
export interface EngineOptions {
  configPath?: string;
  dryRun?: boolean;
  targetId?: string;
  concurrency?: number;
}

/**
 * Monitoring engine - orchestrates all components
 */
export class Engine {
  private config: Config | null = null;
  private storage = createStorage();
  private changeDetector = new ChangeDetector();
  private resultHandler = new ResultHandler();

  /**
   * Load configuration
   */
  async loadConfiguration(options?: EngineOptions): Promise<Config> {
    if (!this.config) {
      const loaderOptions = options?.configPath ? { configPath: options.configPath } : {};
      this.config = await loadConfig(loaderOptions);
    }
    return this.config;
  }

  /**
   * Run monitoring for all targets
   */
  async run(options?: EngineOptions): Promise<ExecutionSummary> {
    const startTime = Date.now();

    // Load configuration
    const config = await this.loadConfiguration(options);

    // Initialize storage
    await this.storage.init();

    // Get targets to check
    const targets = this.getTargetsToCheck(config, options?.targetId);

    if (targets.length === 0) {
      logger.warn("No targets to check");
      return this.createEmptySummary(Date.now() - startTime);
    }

    logger.info(`Starting monitoring for ${targets.length} targets`);
    logger.separator();

    // Run checks with concurrency control
    const concurrency = options?.concurrency ?? config.global?.concurrency ?? 5;
    const limit = pLimit(concurrency);

    const results = await Promise.all(
      targets.map((target) =>
        limit(() => this.checkTarget(target, options?.dryRun ?? config.global?.dryRun))
      )
    );

    const duration = Date.now() - startTime;

    // Process results
    const processedResults: ProcessedResult[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result) {
        const target = targets[i];
        if (target) {
          processedResults.push(result);
        }
      }
    }

    // Log summary
    logger.separator();
    const summary = this.resultHandler.createSummary(processedResults, duration);
    logger.info(this.resultHandler.formatSummary(summary));

    return summary;
  }

  /**
   * Check a single target
   */
  private async checkTarget(target: TargetConfig, dryRun = false): Promise<ProcessedResult | null> {
    const monitor = createMonitor(target);

    try {
      // Validate configuration
      monitor.validateConfig();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Invalid config for ${target.id}: ${errorMessage}`);
      return null;
    }

    // Get previous state
    const previousState = await this.storage.getTargetState(target.id);

    // Run check
    const monitorResult = await monitor.check();

    // Detect changes by diffing against the last stored content so the
    // notification can include a change summary and diff text
    const previousContent = previousState?.lastContent ?? null;
    const changeResult = this.changeDetector.detect(previousContent, monitorResult.content ?? "");

    // Create new state
    const newState = createTargetState(monitorResult, previousState);

    // Save state (unless dry run)
    if (!dryRun) {
      await this.storage.updateTargetState(target.id, newState);
    }

    // Process result
    const processedResult = this.resultHandler.processResult(
      target,
      monitorResult,
      previousState,
      newState,
      changeResult
    );

    // Log result
    logger.monitorResult(target.id, target.name, changeResult.hasChanges, monitorResult.error);

    // Send notifications
    if (processedResult.shouldNotify && !dryRun) {
      await this.sendNotification(processedResult);
    }

    return processedResult;
  }

  /**
   * Send notification for a processed result
   */
  private async sendNotification(result: ProcessedResult): Promise<void> {
    if (!this.config?.notifications) {
      return;
    }

    const payload: NotificationPayload = {
      targetId: result.target.id,
      targetName: result.target.name,
      url: result.target.url,
      webUrl: result.target.webUrl,
      hasChanges: result.changeResult.hasChanges,
      changeResult: result.changeResult,
      monitorResult: result.monitorResult,
      timestamp: new Date().toISOString(),
    };

    const notifiers = createNotifiers(this.config.notifications);

    await Promise.all(
      notifiers.map(async (notifier) => {
        try {
          const notificationResult = await notifier.send(payload);
          logger.notificationSent(notifier.channel, notificationResult.success);
        } catch (error) {
          logger.error(
            `Failed to send ${notifier.channel} notification: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      })
    );
  }

  /**
   * Get targets to check based on options
   */
  private getTargetsToCheck(config: Config, targetId?: string): TargetConfig[] {
    let targets = config.targets.filter((t) => t.enabled !== false);

    if (targetId) {
      targets = targets.filter((t) => t.id === targetId);
    }

    return targets;
  }

  /**
   * Create empty summary
   */
  private createEmptySummary(duration: number): ExecutionSummary {
    return {
      totalTargets: 0,
      successful: 0,
      failed: 0,
      changed: 0,
      unchanged: 0,
      firstChecks: 0,
      duration,
      results: [],
    };
  }
}
