/*
 * Maqrivo service worker — lightweight offline support (spec: current
 * shopping list stays reachable with poor connectivity).
 *
 * Strategy:
 * - Navigations (pages): network-first, fall back to the last successful
 *   cached copy of that URL, then to /offline.html. Successful GET page
 *   responses are cached opportunistically (max 30 entries, LRU-ish).
 * - Static assets: stale-while-revalidate.
 * - Everything else (API POSTs, auth): network only — never cached.
 */
const PAGE_CACHE = "maqrivo-pages-v1";
const STATIC_CACHE = "maqrivo-static-v1";
const MAX_PAGE_ENTRIES = 30;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, "/manifest.webmanifest", "/icon.svg"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== PAGE_CACHE && k !== STATIC_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function handleNavigation(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.ok) {
      cache.put(request, response.clone());
      trimCache(cache);
    }
    return response;
  } catch (networkError) {
    const cached = await cache.match(request, { ignoreSearch: true, ignoreVary: true });
    if (cached) return cached;
    const statics = await caches.open(STATIC_CACHE);
    const offline = await statics.match(OFFLINE_URL);
    if (offline) return offline;
    throw networkError;
  }
}

async function trimCache(cache) {
  const keys = await cache.keys();
  if (keys.length > MAX_PAGE_ENTRIES) {
    await cache.delete(keys[0]);
  }
}

async function handleStatic(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.status === 200) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return cached || (await network) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icon") ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(handleStatic(request));
  }
  // Everything else: plain network, no interception.
});
