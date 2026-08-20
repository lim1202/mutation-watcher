import { describe, expect, it } from "vitest";
import { compareContent, getChangeSummary, truncateDiffForNotification } from "./diff";

describe("getChangeSummary", () => {
  it("orders removed before added, git diff style", () => {
    const diff = compareContent("old a\nold b\n", "old a\nnew b\n");

    expect(diff.summary.removed).toBe(1);
    expect(diff.summary.added).toBe(1);
    expect(getChangeSummary(diff)).toBe("Removed: 1 line, Added: 1 line");
  });
});

describe("truncateDiffForNotification", () => {
  it("returns text unchanged when within both limits", () => {
    const result = truncateDiffForNotification("- a\n+ b");

    expect(result.truncated).toBe(false);
    expect(result.text).toBe("- a\n+ b");
  });

  it("truncates by line count when it exceeds the limit", () => {
    const diffText = Array.from({ length: 50 }, (_, i) => `- line ${i}`).join("\n");

    const result = truncateDiffForNotification(diffText, { maxLines: 10 });

    expect(result.truncated).toBe(true);
    expect(result.text.split("\n")).toHaveLength(10);
    expect(result.text).toContain("- line 0");
    expect(result.text).toContain("- line 49");
    expect(result.text).toContain("41 lines omitted");
  });

  it("truncates by character budget when it exceeds the limit", () => {
    const diffText = Array.from({ length: 50 }, () => "- xyz").join("\n");

    const result = truncateDiffForNotification(diffText, { maxChars: 100 });

    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(100);
    expect(
      result.text.split("\n").every((line) => line === "- xyz" || line.includes("omitted"))
    ).toBe(true);
  });

  it("never cuts a line in the middle and preserves both ends", () => {
    const sourceLines = [
      `- ${"a".repeat(30)}`,
      `  ${"x".repeat(30)}`,
      `  ${"y".repeat(30)}`,
      `  ${"z".repeat(30)}`,
      `+ ${"b".repeat(30)}`,
    ];
    const diffText = sourceLines.join("\n");

    const result = truncateDiffForNotification(diffText, { maxChars: 100 });

    expect(result.truncated).toBe(true);
    expect(result.text).toContain(sourceLines[0]);
    expect(result.text).toContain(sourceLines.at(-1));
    expect(
      result.text
        .split("\n")
        .every((line) => sourceLines.includes(line) || line.includes("omitted"))
    ).toBe(true);
  });
});
