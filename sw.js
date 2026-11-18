// The studio on a phone (issue #6 track 145): keeps the app's own files on
// the phone, so it opens without a connection. Only the app's files: the
// work itself is kept by the app in the phone's storage, never here.
const CACHE = "studio-app-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", "/index.html", "/manifest.webmanifest", "/icon.svg"])));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  // A page address opens the app; everything else is the app's own files.
  const isPage = req.mode === "navigate";
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const fresh = await fetch(isPage ? "/index.html" : req);
        if (fresh.ok) cache.put(isPage ? "/index.html" : req, fresh.clone());
        return fresh;
      } catch {
        return (await cache.match(isPage ? "/index.html" : req)) ?? Response.error();
      }
    })(),
  );
});
