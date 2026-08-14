import { describe, expect, it, vi } from "vitest";

const axiosMock = vi.hoisted(() => vi.fn());

vi.mock("axios", () => ({ default: axiosMock }));

const { httpGet } = await import("./http");

describe("httpGet error handling", () => {
  it("falls back to the error code when the axios message is empty", async () => {
    axiosMock.mockRejectedValue({ message: "", code: "ECONNRESET" });

    await expect(httpGet("https://example.com", { retries: 0 })).rejects.toMatchObject({
      name: "HttpError",
      message: "ECONNRESET",
    });
  });

  it("defaults to a readable message when both message and code are missing", async () => {
    axiosMock.mockRejectedValue({});

    await expect(httpGet("https://example.com", { retries: 0 })).rejects.toMatchObject({
      name: "HttpError",
      message: "Unknown HTTP error",
    });
  });
});
