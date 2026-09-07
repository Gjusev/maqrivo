import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  IntegrationError,
  hostAllowed,
  isForbiddenIp,
  politeFetchJson,
  redirectTarget,
} from "../src/server/integrations/http";

const lookupMock = vi.hoisted(() =>
  vi.fn<(hostname: string) => Promise<Array<{ address: string; family: number }>>>(),
);
vi.mock("node:dns/promises", () => ({ lookup: lookupMock }));

const PUBLIC_A = [{ address: "93.184.216.34", family: 4 }];

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

beforeEach(() => {
  lookupMock.mockResolvedValue(PUBLIC_A);
});

afterEach(() => {
  vi.unstubAllGlobals();
  lookupMock.mockReset();
});

describe("host allowlist matcher", () => {
  it("matches listed hosts exactly", () => {
    for (const host of [
      "overpass-api.de",
      "world.openfoodfacts.org",
      "prices.openfoodfacts.org",
      "www.supermarche.com",
      "api.rcdss.monoprix.fr",
      "public.aldigroup-prod.magnolia-platform.com",
      "catalogues.aldi.fr",
    ]) {
      expect(hostAllowed(host)).toBe(true);
    }
  });

  it("rejects unlisted hosts, bare parents and subdomains of listed hosts", () => {
    expect(hostAllowed("example.com")).toBe(false);
    expect(hostAllowed("evil-website.net")).toBe(false);
    expect(hostAllowed("openfoodfacts.org")).toBe(false); // bare parent
    expect(hostAllowed("api.overpass-api.de")).toBe(false); // subdomain of a listed host
    expect(hostAllowed("leaflets.schwarz")).toBe(false);
    expect(hostAllowed("ipaper.io")).toBe(false); // wildcard suffix itself
  });

  it("matches the *.ipaper.io wildcard at any depth, case-insensitively", () => {
    expect(hostAllowed("cdn.ipaper.io")).toBe(true);
    expect(hostAllowed("files.cdn.ipaper.io")).toBe(true);
    expect(hostAllowed("xipaper.io")).toBe(false);
    expect(hostAllowed("notipaper.io.evil.com")).toBe(false);
    expect(hostAllowed("WWW.AUCHAN.FR")).toBe(true);
  });
});

describe("private-IP classifier", () => {
  it("rejects loopback, private and link-local IPv4", () => {
    for (const address of [
      "127.0.0.1",
      "127.255.0.3",
      "10.240.1.2",
      "172.16.0.1",
      "172.20.1.1",
      "172.31.255.255",
      "192.168.44.2",
      "169.254.169.254",
    ]) {
      expect(isForbiddenIp(address)).toBe(true);
    }
  });

  it("rejects IPv6 loopback, ULA, link-local and v4-mapped private addresses", () => {
    for (const address of ["::", "::1", "fc00::", "fd12:3456::1", "fe80::1", "febf::1", "::ffff:192.168.1.1"]) {
      expect(isForbiddenIp(address)).toBe(true);
    }
  });

  it("passes public addresses, including neighbours of the forbidden ranges", () => {
    for (const address of [
      "8.8.8.8",
      "93.184.216.34",
      "11.0.0.1", // outside 10/8
      "172.15.255.255", // below 172.16/12
      "172.32.0.1", // above 172.16/12
      "169.255.0.1", // outside 169.254/16
      "192.169.0.1", // outside 192.168/16
      "2606:4700::1111",
      "::ffff:93.184.216.34", // v4-mapped public
    ]) {
      expect(isForbiddenIp(address)).toBe(false);
    }
  });
});

describe("redirect hop decision", () => {
  it("resolves absolute and relative Location targets", () => {
    expect(redirectTarget(302, "https://files.cdn.ipaper.io/p/1.jpg", "https://cdn.ipaper.io/a/")).toBe(
      "https://files.cdn.ipaper.io/p/1.jpg",
    );
    expect(redirectTarget(301, "b/page", "https://www.auchan.fr/catalogue/a")).toBe(
      "https://www.auchan.fr/catalogue/b/page",
    );
    expect(redirectTarget(307, "/same-host", "https://www.g20-minute.com/taxons/promotions")).toBe(
      "https://www.g20-minute.com/same-host",
    );
  });

  it("treats non-redirect statuses and missing/broken Locations as final", () => {
    expect(redirectTarget(200, "https://x.example/", "https://cdn.auchan.fr/a")).toBeNull();
    expect(redirectTarget(304, null, "https://cdn.auchan.fr/a")).toBeNull();
    expect(redirectTarget(404, "https://x.example/", "https://cdn.auchan.fr/a")).toBeNull();
    expect(redirectTarget(302, "http://[", "https://cdn.auchan.fr/a")).toBeNull();
  });
});

describe("outbound guard inside politeFetchJson", () => {
  it("rejects hosts outside the allowlist before dialing or resolving", async () => {
    const fetchMock = vi.fn<FetchLike>();
    vi.stubGlobal("fetch", fetchMock);
    await expect(politeFetchJson("https://example.com/data", { source: "test" })).rejects.toThrow(
      /not on the outbound allowlist/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("rejects non-http(s) protocols", async () => {
    vi.stubGlobal("fetch", vi.fn<FetchLike>());
    await expect(politeFetchJson("ftp://overpass-api.de/q", { source: "test" })).rejects.toThrow(
      /is not http/,
    );
  });

  it("lets an allowlisted host that resolves publicly through", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const url = "https://www.supermarche.com/supermarkets/nearby?lat=1&lon=2";
    await expect(politeFetchJson(url, { source: "test" })).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls[0]![0]).toBe(url);
  });

  it("rejects an allowlisted host that resolves inside a private range", async () => {
    lookupMock.mockResolvedValue([{ address: "10.1.2.3", family: 4 }]);
    const fetchMock = vi.fn<FetchLike>();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      politeFetchJson("https://cdn.auchan.fr/catalogue/pages/1.jpg", { source: "test" }),
    ).rejects.toThrow(/forbidden range/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("follows a redirect whose target host is also allowlisted", async () => {
    let calls = 0;
    const fetchMock = vi.fn<FetchLike>(async () => {
      calls += 1;
      return calls === 1
        ? new Response(null, { status: 302, headers: { location: "https://imgproxy.leaflets.schwarz/next.jpg" } })
        : Response.json({ followed: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      politeFetchJson("https://endpoints.leaflets.schwarz/v4/flyer?version=4", { source: "test" }),
    ).resolves.toEqual({ followed: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![0]).toBe("https://imgproxy.leaflets.schwarz/next.jpg");
  });

  it("resolves a relative Location against the current hop", async () => {
    let calls = 0;
    const fetchMock = vi.fn<FetchLike>(async () => {
      calls += 1;
      return calls === 1
        ? new Response(null, { status: 301, headers: { location: "/rest/api/b" } })
        : Response.json({ moved: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(politeFetchJson("https://api.rcdss.monoprix.fr/rest/api/a", { source: "test" })).resolves.toEqual({
      moved: true,
    });
    expect(fetchMock.mock.calls[1]![0]).toBe("https://api.rcdss.monoprix.fr/rest/api/b");
  });

  it("blocks a redirect to a host outside the allowlist", async () => {
    const fetchMock = vi.fn<FetchLike>(
      async () => new Response(null, { status: 302, headers: { location: "https://169.254.169.254/latest" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      politeFetchJson("https://www.carrefour.fr/api/eligibility/drive", { source: "test" }),
    ).rejects.toThrow(/redirect-blocked/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("blocks a redirect whose target resolves into a private range", async () => {
    lookupMock.mockImplementation(async (hostname: string) =>
      hostname.startsWith("private.") ? [{ address: "192.168.0.10", family: 4 as const }] : PUBLIC_A,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn<FetchLike>(
        async () =>
          new Response(null, {
            status: 302,
            headers: { location: "https://private.cdn.ipaper.io/Pages/1/Zoom.jpg" },
          }),
      ),
    );
    await expect(
      politeFetchJson("https://public.aldigroup-prod.magnolia-platform.com/.rest/x", { source: "test" }),
    ).rejects.toThrow(/redirect-blocked.*forbidden range/s);
  });

  it("gives up after three followed hops", async () => {
    const fetchMock = vi.fn<FetchLike>(
      async () =>
        new Response(null, { status: 302, headers: { location: "https://catalogues.aldi.fr/loop" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(politeFetchJson("https://www.g20-minute.com/hop", { source: "test" })).rejects.toThrow(
      /more than 3 redirect hops/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(4); // origin + 3 followed hops
  });

  it("reports guard rejections as a blocked IntegrationError", async () => {
    vi.stubGlobal("fetch", vi.fn<FetchLike>());
    const err = await politeFetchJson("https://example.com/x", { source: "src" }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(IntegrationError);
    expect((err as IntegrationError).kind).toBe("blocked");
  });
});
