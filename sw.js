const CACHE_NAME = "rif-cache-v1";
const CORE_ASSETS = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "quotes.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

importScripts("quotes.js");

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

function randomQuote() {
  return QUOTES[Math.floor(Math.random() * QUOTES.length)];
}

// Best-effort background reminder (Chrome/Android installed PWAs only; the OS decides
// the actual firing time, it is not guaranteed to match the times set in the app).
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "daily-reminder") {
    event.waitUntil(
      self.registration.showNotification("該放下內耗了", {
        body: randomQuote(),
        icon: "icons/icon-192.png",
        badge: "icons/icon-192.png",
        tag: "daily-reminder",
      })
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("./index.html");
    })
  );
});
