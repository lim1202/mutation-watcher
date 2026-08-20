import * as diff from "diff";

/**
 * Diff result
 */
export interface DiffResult {
  added: string[];
  removed: string[];
  unchanged: string[];
  changes: DiffChange[];
  summary: DiffSummary;
}

/**
 * Individual change
 */
export interface DiffChange {
  type: "added" | "removed" | "unchanged";
  value: string;
  lineNumbers?: {
    old?: number;
    new?: number;
  };
}

/**
 * Diff summary
 */
export interface DiffSummary {
  added: number;
  removed: number;
  unchanged: number;
  totalChanges: number;
  hasChanges: boolean;
}

/**
 * Generate a unified diff between two strings
 */
export function generateUnifiedDiff(
  oldContent: string,
  newContent: string,
  filename = "content"
): string {
  const patch = diff.createPatch(filename, oldContent, newContent);
  return patch;
}

/**
 * Compare two strings and get detailed changes
 */
export function compareContent(oldContent: string, newContent: string): DiffResult {
  const changes = diff.diffLines(oldContent, newContent);

  const result: DiffResult = {
    added: [],
    removed: [],
    unchanged: [],
    changes: [],
    summary: {
      added: 0,
      removed: 0,
      unchanged: 0,
      totalChanges: 0,
      hasChanges: false,
    },
  };

  let oldLineNum = 1;
  let newLineNum = 1;

  for (const change of changes) {
    const lines = change.value.split("\n");
    // Remove last empty line if the change ends with newline
    if (lines[lines.length - 1] === "") {
      lines.pop();
    }

    if (change.added) {
      result.summary.added += lines.length;
      result.added.push(...lines);
      result.changes.push(
        ...lines.map((line) => ({
          type: "added" as const,
          value: line,
          lineNumbers: { new: newLineNum++ },
        }))
      );
      result.summary.totalChanges += lines.length;
    } else if (change.removed) {
      result.summary.removed += lines.length;
      result.removed.push(...lines);
      result.changes.push(
        ...lines.map((line) => ({
          type: "removed" as const,
          value: line,
          lineNumbers: { old: oldLineNum++ },
        }))
      );
      result.summary.totalChanges += lines.length;
    } else {
      result.summary.unchanged += lines.length;
      result.unchanged.push(...lines);
      result.changes.push(
        ...lines.map((line) => ({
          type: "unchanged" as const,
          value: line,
          lineNumbers: { old: oldLineNum++, new: newLineNum++ },
        }))
      );
    }
  }

  result.summary.hasChanges = result.summary.totalChanges > 0;

  return result;
}

/**
 * Compare JSON objects
 */
export function compareJson(oldObj: unknown, newObj: unknown): DiffResult {
  const oldContent = JSON.stringify(oldObj, null, 2);
  const newContent = JSON.stringify(newObj, null, 2);
  return compareContent(oldContent, newContent);
}

/**
 * Format diff for display
 */
export function formatDiff(diffResult: DiffResult, contextLines = 3): string {
  const lines: string[] = [];
  let unchangedBuffer: string[] = [];

  const flushBuffer = () => {
    if (unchangedBuffer.length > 0) {
      const start = Math.max(0, unchangedBuffer.length - contextLines);
      for (let i = start; i < unchangedBuffer.length; i++) {
        lines.push(`  ${unchangedBuffer[i]}`);
      }
      unchangedBuffer = [];
    }
  };

  for (const change of diffResult.changes) {
    if (change.type === "unchanged") {
      unchangedBuffer.push(change.value);
    } else {
      flushBuffer();
      if (change.type === "added") {
        lines.push(`+ ${change.value}`);
      } else if (change.type === "removed") {
        lines.push(`- ${change.value}`);
      }
    }
  }

  // Don't show trailing unchanged lines
  return lines.join("\n");
}

/**
 * Trim a diff to a size that keeps notification messages readable, applying
 * both a line limit and a character budget. Returns whether content was cut.
 */
export function truncateDiffForNotification(
  diffText: string,
  options: { maxLines?: number; maxChars?: number } = {}
): { text: string; truncated: boolean } {
  const maxLines = options.maxLines ?? 40;
  const maxChars = options.maxChars ?? 800;

  const lines = diffText.split("\n");
  const original = lines.join("\n");
  if (lines.length <= maxLines && original.length <= maxChars) {
    return { text: original, truncated: false };
  }

  // Keep complete lines from both ends. The tail commonly contains closing
  // JSON braces, so retaining it avoids making a truncated object look
  // accidentally malformed. Never slice through a line.
  const retainedLineLimit = Math.max(0, Math.min(lines.length - 1, maxLines - 1));
  let headCount = Math.ceil(retainedLineLimit / 2);
  let tailCount = Math.floor(retainedLineLimit / 2);

  const render = () => {
    const omitted = lines.length - headCount - tailCount;
    const noun = omitted === 1 ? "line" : "lines";
    return [
      ...lines.slice(0, headCount),
      `... ${omitted} ${noun} omitted ...`,
      ...(tailCount > 0 ? lines.slice(-tailCount) : []),
    ].join("\n");
  };

  let text = render();
  while (text.length > maxChars && headCount + tailCount > 0) {
    if (headCount > 1 && tailCount <= 1) {
      headCount--;
    } else if (tailCount > 1 && headCount <= 1) {
      tailCount--;
    } else if (headCount > 0 && tailCount > 0) {
      const headLength = lines[headCount - 1]?.length ?? 0;
      const tailLength = lines[lines.length - tailCount]?.length ?? 0;
      if (headLength >= tailLength) {
        headCount--;
      } else {
        tailCount--;
      }
    } else if (headCount > 0) {
      headCount--;
    } else {
      tailCount--;
    }
    text = render();
  }

  if (text.length > maxChars) {
    text = maxChars >= 3 ? "..." : "";
  }

  return { text, truncated: true };
}

/**
 * Get a short summary of changes
 */
export function getChangeSummary(diffResult: DiffResult): string {
  const parts: string[] = [];

  if (diffResult.summary.removed > 0) {
    const count = diffResult.summary.removed;
    parts.push(`Removed: ${count} ${count === 1 ? "line" : "lines"}`);
  }

  if (diffResult.summary.added > 0) {
    const count = diffResult.summary.added;
    parts.push(`Added: ${count} ${count === 1 ? "line" : "lines"}`);
  }

  if (parts.length === 0) {
    return "No changes";
  }

  return parts.join(", ");
}

/**
 * Check if there are meaningful changes (ignoring minor differences)
 */
export function hasMeaningfulChanges(
  oldContent: string,
  newContent: string,
  options: {
    ignoreWhitespace?: boolean;
    ignoreCase?: boolean;
    minChangePercent?: number;
  } = {}
): boolean {
  let oldNormalized = oldContent;
  let newNormalized = newContent;

  if (options.ignoreWhitespace) {
    oldNormalized = oldNormalized.replace(/\s+/g, " ").trim();
    newNormalized = newNormalized.replace(/\s+/g, " ").trim();
  }

  if (options.ignoreCase) {
    oldNormalized = oldNormalized.toLowerCase();
    newNormalized = newNormalized.toLowerCase();
  }

  if (oldNormalized === newNormalized) {
    return false;
  }

  if (options.minChangePercent !== undefined) {
    const diffResult = compareContent(oldNormalized, newNormalized);
    const totalLines = diffResult.summary.unchanged + diffResult.summary.totalChanges;
    if (totalLines === 0) return true;

    const changePercent = (diffResult.summary.totalChanges / totalLines) * 100;
    return changePercent >= options.minChangePercent;
  }

  return true;
}
