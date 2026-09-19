/* Service Worker «Генератор AR-меток» — офлайн-оболочка приложения.
   Версия кеша подставляется при деплое вместо LMPCg_J4D8K9_4F9IqDCX (scripts/deploy.sh):
   каждый деплой открывает свежий кеш, старый подчищается на activate.

   Стратегии:
   - навигация (HTML): сеть -> кеш (офлайн отдаёт сохранённую оболочку);
   - статика Next (/_next/, хешированные имена) и публичные ассеты: кеш -> сеть;
   - сам sw.js и manifest не перехватываем — браузер обновляет их сам. */
const VERSION = "LMPCg_J4D8K9_4F9IqDCX";
const CACHE = `ar-marker-studio-${VERSION}`;
const SHELL = ["/", "/manifest.webmanifest", "/icons/favicon-32.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/sw.js") return;

  /* Навигация: свежий HTML из сети, при офлайне — сохранённая оболочка */
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches
            .open(CACHE)
            .then((cache) => cache.put("/", copy))
            .catch(() => undefined);
          return res;
        })
        .catch(() =>
          caches.match("/").then((hit) => hit || Response.error())
        )
    );
    return;
  }

  /* Хешированная статика и публичные ассеты: кеш-первая */
  const cacheable =
    url.pathname.startsWith("/_next/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/robots.txt";

  if (cacheable) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches
              .open(CACHE)
              .then((cache) => cache.put(req, copy))
              .catch(() => undefined);
            return res;
          })
      )
    );
  }
});
