import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OpenPricesWriteClient,
  openPricesWriteConfig,
} from "../src/server/integrations/openprices-write";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("openPricesWriteConfig", () => {
  it("is off unless explicitly enabled", () => {
    expect(openPricesWriteConfig({})).toEqual({ enabled: false, reason: "disabled" });
  });

  it("requires credentials and rejects non-official API hosts", () => {
    expect(openPricesWriteConfig({ OPENPRICES_WRITE_ENABLED: "true" })).toEqual({
      enabled: false,
      reason: "credentials-missing",
    });
    expect(
      openPricesWriteConfig({
        OPENPRICES_WRITE_ENABLED: "true",
        OPENPRICES_USERNAME: "dev",
        OPENPRICES_PASSWORD: "secret",
        OPENPRICES_WRITE_API_BASE: "https://example.test/api/v1",
      }),
    ).toEqual({ enabled: false, reason: "invalid-api-base" });
  });

  it("defaults explicit writes to the official pre-production API", () => {
    expect(
      openPricesWriteConfig({
        OPENPRICES_WRITE_ENABLED: "true",
        OPENPRICES_USERNAME: "dev",
        OPENPRICES_PASSWORD: "secret",
      }),
    ).toEqual({
      enabled: true,
      config: {
        apiBase: "https://prices.openfoodfacts.net/api/v1",
        username: "dev",
        password: "secret",
      },
    });
  });
});

describe("OpenPricesWriteClient", () => {
  it("authenticates once, uploads receipt proof, then creates an EAN price", async () => {
    const fetchMock = vi.fn<FetchLike>()
      .mockResolvedValueOnce(
        Response.json({ access_token: "token-123", user_id: "dev", token_type: "bearer", is_moderator: false }),
      )
      .mockResolvedValueOnce(Response.json({ id: 41 }, { status: 200 }))
      .mockResolvedValueOnce(Response.json({ id: 73 }, { status: 201 }));
    const client = new OpenPricesWriteClient(
      { apiBase: "https://prices.openfoodfacts.net/api/v1", username: "dev", password: "secret" },
      fetchMock,
    );

    const proofId = await client.uploadReceiptProof({
      bytes: new Uint8Array([1, 2, 3]),
      mime: "image/jpeg",
      filename: "receipt.jpg",
      purchasedOn: "2026-09-05",
      currency: "EUR",
      osmId: 652825274,
      osmType: "NODE",
    });
    const priceId = await client.createReceiptPrice({
      proofId,
      productCode: "8001505005707",
      amountCents: 890,
      pricePer: "KILOGRAM",
      purchasedOn: "2026-09-05",
      currency: "EUR",
      osmId: 652825274,
      osmType: "NODE",
      receiptQuantity: 0.642,
    });

    expect({ proofId, priceId }).toEqual({ proofId: 41, priceId: 73 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]![0]).toBe("https://prices.openfoodfacts.net/api/v1/auth");
    expect(fetchMock.mock.calls[1]![0]).toContain("/proofs/upload?app_name=Maqrivo");
    expect(fetchMock.mock.calls[2]![0]).toContain("/prices?app_name=Maqrivo");

    const proofInit = fetchMock.mock.calls[1]![1]!;
    const proofForm = proofInit.body as FormData;
    expect(proofForm.get("type")).toBe("RECEIPT");
    expect(proofForm.get("location_osm_id")).toBe("652825274");
    expect(proofForm.get("location_osm_type")).toBe("NODE");
    expect(new Headers(proofInit.headers).get("authorization")).toBe("Bearer token-123");
    expect(new Headers(proofInit.headers).get("user-agent")).toMatch(/^Maqrivo\//);

    const pricePayload = JSON.parse(String(fetchMock.mock.calls[2]![1]!.body)) as Record<string, unknown>;
    expect(pricePayload).toMatchObject({
      type: "PRODUCT",
      product_code: "8001505005707",
      price: 8.9,
      price_per: "KILOGRAM",
      currency: "EUR",
      date: "2026-09-05",
      location_osm_id: 652825274,
      location_osm_type: "NODE",
      proof_id: 41,
      receipt_quantity: 0.642,
    });
  });

  it("does not retry a failed write", async () => {
    const fetchMock = vi.fn<FetchLike>()
      .mockResolvedValueOnce(Response.json({ access_token: "token-123" }))
      .mockResolvedValueOnce(Response.json({ detail: "unavailable" }, { status: 503 }));
    const client = new OpenPricesWriteClient(
      { apiBase: "https://prices.openfoodfacts.net/api/v1", username: "dev", password: "secret" },
      fetchMock,
    );

    await expect(
      client.uploadReceiptProof({
        bytes: new Uint8Array([1]),
        mime: "image/png",
        filename: "receipt.png",
        purchasedOn: "2026-09-05",
        currency: "EUR",
        osmId: 652825274,
        osmType: "NODE",
      }),
    ).rejects.toThrow(/HTTP 503/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
