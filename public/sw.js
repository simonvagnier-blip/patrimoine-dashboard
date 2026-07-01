/* Service worker PWA (C3) — offline lecture seule + notifications push.
 *
 * Stratégies :
 *  - API données (GET) : stale-while-revalidate → le dernier état du
 *    patrimoine reste consultable hors ligne, rafraîchi en arrière-plan.
 *  - Navigations : network-first, repli cache (dernière page vue).
 *  - Assets Next hashés : cache-first (immuables).
 *
 * iOS : chaque événement push DOIT afficher une notification, sinon Safari
 * révoque la subscription après quelques pushes silencieux.
 */
const DATA_CACHE = "data-v1";
const PAGE_CACHE = "pages-v1";
const STATIC_CACHE = "static-v1";
const KNOWN = [DATA_CACHE, PAGE_CACHE, STATIC_CACHE];

const DATA_PATHS = [
  "/api/quotes",
  "/api/snapshots",
  "/api/operations",
  "/api/returns",
  "/api/params",
  "/api/dividends",
  "/api/envelope-benchmark",
  "/api/envelope-chart",
  "/api/budget/summary",
];

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => !KNOWN.includes(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Assets Next hashés : cache-first
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // Données : stale-while-revalidate
  if (DATA_PATHS.some((p) => url.pathname.startsWith(p))) {
    event.respondWith(
      caches.open(DATA_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Navigations : network-first, repli cache
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PAGE_CACHE);
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          const hit = await cache.match(req);
          if (hit) return hit;
          const fallback = await cache.match("/perso/patrimoine");
          return (
            fallback ||
            new Response("Hors ligne — ouvre l'app avec du réseau une première fois.", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            })
          );
        }
      })()
    );
  }
});

self.addEventListener("push", (event) => {
  let payload = { title: "Patrimoine", body: "Nouvelle notification", url: "/perso/patrimoine" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    if (event.data) payload.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: payload.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/perso/patrimoine";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
