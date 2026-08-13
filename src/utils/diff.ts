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
 * Get a short summary of changes
 */
export function getChangeSummary(diffResult: DiffResult): string {
  const parts: string[] = [];

  // Match git diff style: removed lines come before added lines
  if (diffResult.summary.removed > 0) {
    parts.push(`-${diffResult.summary.removed} lines`);
  }

  if (diffResult.summary.added > 0) {
    parts.push(`+${diffResult.summary.added} lines`);
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
