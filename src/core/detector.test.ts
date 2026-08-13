import { describe, expect, it } from "vitest";
import { ChangeDetector } from "./detector";

describe("ChangeDetector.detect", () => {
  const detector = new ChangeDetector();

  it("generates a change summary and diff text when content changes", () => {
    const result = detector.detect("old line\nshared line\n", "new line\nshared line\n");

    expect(result.hasChanges).toBe(true);
    expect(result.changeSummary).toBe("-1 lines, +1 lines");
    expect(result.diffText).toContain("- old line");
    expect(result.diffText).toContain("+ new line");
  });

  it("reports no changes when content is identical", () => {
    const result = detector.detect("same\ncontent\n", "same\ncontent\n");

    expect(result.hasChanges).toBe(false);
    expect(result.changeSummary).toBeUndefined();
    expect(result.diffText).toBeUndefined();
  });

  it("has no diff text on the first check when there is no previous content", () => {
    const result = detector.detect(null, "brand new content\n");

    expect(result.hasChanges).toBe(true);
    expect(result.changeSummary).toBeUndefined();
    expect(result.diffText).toBeUndefined();
  });
});
