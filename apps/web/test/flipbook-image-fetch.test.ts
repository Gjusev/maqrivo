import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { politeFetchImage, IntegrationError } from "../src/server/integrations/http";

const lookupMock = vi.hoisted(() =>
  vi.fn<(hostname: string) => Promise<Array<{ address: string; family: number }>>>(),
);
vi.mock("node:dns/promises", () => ({ lookup: lookupMock }));

beforeEach(() => {
  lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
});

function imageResponse(body: Uint8Array, headers: Record<string, string>, status = 200) {
  return new Response(body.buffer as ArrayBuffer, { status, headers });
}

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("politeFetchImage", () => {
  it("returns validated bytes for an allowed image type", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => imageResponse(PNG_BYTES, { "content-type": "image/png" }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await politeFetchImage("https://cdn.ipaper.io/iPaper/Papers/p1/Pages/1/Zoom.jpg", { source: "test" });
    expect(result.mime).toBe("image/png");
    expect(result.bytes).toEqual(PNG_BYTES);
    expect(fetchMock.mock.calls[0]![0]).toBe("https://cdn.ipaper.io/iPaper/Papers/p1/Pages/1/Zoom.jpg");
    // Identifying User-Agent is part of the politeness contract.
    const headers = fetchMock.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers["User-Agent"]).toMatch(/^Maqrivo\//);
  });

  it("rejects non-image content types before anything is stored", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => imageResponse(new TextEncoder().encode("<html>"), { "content-type": "text/html" })),
    );
    await expect(politeFetchImage("https://cdn.ipaper.io/x", { source: "test" })).rejects.toBeInstanceOf(
      IntegrationError,
    );
  });

  it("rejects images over the 8 MB cap from content-length", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => imageResponse(PNG_BYTES, { "content-type": "image/png", "content-length": String(9 * 1024 * 1024) })),
    );
    await expect(politeFetchImage("https://cdn.ipaper.io/big.png", { source: "test" })).rejects.toThrow(
      /8 MB/,
    );
  });

  it("treats parameters like charset suffixes in the content type", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => imageResponse(PNG_BYTES, { "content-type": "image/jpeg; charset=binary" })),
    );
    const result = await politeFetchImage("https://cdn.ipaper.io/p.jpg", { source: "test" });
    expect(result.mime).toBe("image/jpeg");
  });

  it("hard-backs-off on 403 — no retry, no escalation", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(politeFetchImage("https://cdn.ipaper.io/protected", { source: "test" })).rejects.toThrow(
      /403/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries once on transient 5xx", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        return calls === 1 ? new Response(null, { status: 502 }) : imageResponse(PNG_BYTES, { "content-type": "image/png" });
      }),
    );
    const result = await politeFetchImage("https://cdn.ipaper.io/flaky.png", { source: "test" });
    expect(result.mime).toBe("image/png");
    expect(calls).toBe(2);
  });
});
