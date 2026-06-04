const CACHE = "gym-checkin-v1";
const ASSETS = [
  "/gym-checkin/",
  "/gym-checkin/index.html",
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  const url = e.request.url;
  // Ignorar esquemas no soportados por Cache API
  if (!url.startsWith("http")) return;
  // Ignorar llamadas al backend
  if (url.includes("script.google.com")) return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});