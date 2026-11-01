const C = "mc-v8", SHELL = ["./", "index.html", "app.css", "app.js", "manifest.json", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png", "icons/splash-1170x2532.png", "data.json"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(C).then((c) => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== C).map((x) => caches.delete(x))))); self.clients.claim(); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url); if (e.request.method !== "GET" || u.origin !== location.origin) return;
  if (u.pathname.endsWith("data.json")) { // network first so the daily refresh shows up; cached copy offline
    e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); caches.open(C).then((c) => c.put("data.json", cp)); return r; }).catch(() => caches.match("data.json")));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request).catch(() => caches.match("index.html"))));
});
