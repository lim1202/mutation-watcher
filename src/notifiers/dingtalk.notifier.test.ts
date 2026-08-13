import { describe, expect, it, vi } from "vitest";
import type { NotificationPayload } from "./base";
import { DingTalkNotifier } from "./dingtalk.notifier";

const { httpPost } = vi.hoisted(() => ({ httpPost: vi.fn() }));

vi.mock("../utils/http.js", () => ({ httpPost }));

function makePayload(overrides: Partial<NotificationPayload> = {}): NotificationPayload {
  return {
    targetId: "test",
    targetName: "Test Target",
    url: "https://example.com",
    hasChanges: false,
    monitorResult: {
      targetId: "test",
      targetName: "Test Target",
      url: "https://example.com",
      timestamp: "2026-08-13T00:00:00.000Z",
      success: true,
      content: "",
      contentHash: "",
      duration: 0,
    },
    timestamp: "2026-08-13T00:00:00.000Z",
    ...overrides,
  };
}

function makeNotifier(overrides: Record<string, unknown> = {}) {
  return new DingTalkNotifier({
    enabled: true,
    webhook: "https://oapi.dingtalk.com/robot/send?access_token=test",
    msgType: "markdown",
    atAll: false,
    ...overrides,
  });
}

interface SentMarkdownMessage {
  msgtype: string;
  markdown: { title: string; text: string };
}

function sentMarkdownText(): string {
  const lastCall = httpPost.mock.calls.at(-1);
  expect(lastCall).toBeDefined();
  if (!lastCall) {
    throw new Error("httpPost was not called");
  }
  const message = lastCall[1] as SentMarkdownMessage;
  return message.markdown.text;
}

describe("DingTalkNotifier markdown", () => {
  it("uses CommonMark hard breaks so body fields render on separate lines", async () => {
    httpPost.mockResolvedValue({ data: { errcode: 0, errmsg: "ok" } });

    const result = await makeNotifier().send(makePayload());

    expect(result.success).toBe(true);
    const text = sentMarkdownText();
    expect(text).toContain("### ✓ No Changes: Test Target");
    expect(text).toContain(
      "**Target:** Test Target  \n**URL:** https://example.com  \n**Time:** 2026-08-13T00:00:00.000Z"
    );
    expect(text).not.toContain("**Target:** Test Target\n**URL:");
  });

  it("preserves newlines inside the diff code fence", async () => {
    httpPost.mockResolvedValue({ data: { errcode: 0, errmsg: "ok" } });

    const payload = makePayload({
      hasChanges: true,
      changeResult: {
        hasChanges: true,
        oldHash: "old",
        newHash: "new",
        changeSummary: "content changed",
        diffText: "- old line\n+ new line",
      },
    });

    await makeNotifier().send(payload);

    const text = sentMarkdownText();
    expect(text).toContain("**Change Summary:**  \ncontent changed");
    expect(text).toContain("```diff\n- old line\n+ new line\n```");
  });

  it("truncates oversized diffs and appends a full-content hint", async () => {
    httpPost.mockResolvedValue({ data: { errcode: 0, errmsg: "ok" } });

    const bigDiff = Array.from({ length: 50 }, (_, i) => `+ line ${i}`).join("\n");
    const payload = makePayload({
      hasChanges: true,
      changeResult: {
        hasChanges: true,
        oldHash: "old",
        newHash: "new",
        changeSummary: "content changed",
        diffText: bigDiff,
      },
    });

    await makeNotifier().send(payload);

    const text = sentMarkdownText();
    expect(text).toContain("⚠️ 变更较多，完整内容见：https://example.com");
    expect(text).toContain("+ line 39"); // last kept line
    expect(text).not.toContain("+ line 49"); // tail was cut
  });
});
