/* Service Worker «Генератор AR-меток» — офлайн-оболочка приложения.
 *
 * Работает и в корне домена, и в подпапке GitHub Pages (/repo/):
 * все пути считаются от расположения самого sw.js, а не от «/».
 *
 * Стратегии:
 * - навигация (HTML): сеть → кеш (офлайн отдаёт сохранённую оболочку);
 * - хешированная статика Next (/_next/) и публичные ассеты: кеш → сеть;
 * - сам sw.js не перехватываем — браузер должен обновлять его сам.
 */
const VERSION = "v3";
const CACHE = `qr-marker-studio-${VERSION}`;
const SCOPE = new URL("./", self.location.href).pathname;
const SELF_PATH = new URL(self.location.href).pathname;
const SHELL = [
  SCOPE,
  `${SCOPE}manifest.webmanifest`,
  `${SCOPE}icons/favicon-32.png`,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        /* addAll падает целиком из-за одного 404 — грузим по одному */
        Promise.allSettled(SHELL.map((url) => cache.add(url)))
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                (key.startsWith("qr-marker-studio-") ||
                  key.startsWith("ar-marker-studio-")) &&
                key !== CACHE
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === SELF_PATH) return;

  /* Навигация: свежий HTML из сети, при офлайне — сохранённая оболочка */
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches
              .open(CACHE)
              .then((cache) => cache.put(SCOPE, copy))
              .catch(() => undefined);
          }
          return res;
        })
        .catch(() => caches.match(SCOPE).then((hit) => hit || Response.error()))
    );
    return;
  }

  /* Хешированная статика и публичные ассеты: кеш-первая */
  const cacheable =
    url.pathname.startsWith(`${SCOPE}_next/`) ||
    url.pathname.startsWith(`${SCOPE}icons/`) ||
    url.pathname === `${SCOPE}manifest.webmanifest` ||
    url.pathname === `${SCOPE}robots.txt`;

  if (cacheable) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches
                .open(CACHE)
                .then((cache) => cache.put(req, copy))
                .catch(() => undefined);
            }
            return res;
          })
      )
    );
  }
});
