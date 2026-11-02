const C = "mc-v11", SHELL = ["./", "index.html", "app.css", "app.js", "coach.js", "coach-ui.js", "live.js", "bot_ideas.json", "manifest.json", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png", "icons/splash-1170x2532.png", "data.json"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(C).then((c) => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== C).map((x) => caches.delete(x))))); self.clients.claim(); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url); if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.includes("/api/")) return;
  if (u.pathname.endsWith("data.json") || u.pathname.endsWith("bot_ideas.json")) { // network first so the daily refresh shows up; cached copy offline
    e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); const n = u.pathname.split("/").pop(); caches.open(C).then((c) => c.put(n, cp)); return r; }).catch(() => caches.match(u.pathname.split("/").pop())));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request).catch(() => caches.match("index.html"))));
});
/* payload-less Web Push from the free cron: fetch the latest message and show it */
self.addEventListener("push", (e) => { e.waitUntil(fetch("api/state", { cache: "no-store" }).then((r) => r.json()).then((j) => { const m = j.lastpush || { title: "Mission Control", body: "New reminder" }; return self.registration.showNotification(m.title, { body: m.body, icon: "icons/icon-192.png", tag: "mc" }); }).catch(() => self.registration.showNotification("Mission Control", { body: "New reminder. Open the app.", icon: "icons/icon-192.png", tag: "mc" }))); });
self.addEventListener("notificationclick", (e) => { e.notification.close(); e.waitUntil(clients.matchAll({ type: "window" }).then((w) => (w[0] ? w[0].focus() : clients.openWindow("./#hq")))); });
