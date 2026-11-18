// The studio on a phone (issue #6 tracks 145 and 147): the app's helper.
//
// It keeps the app's own files on the phone, so it opens without a
// connection (only the app's files: the work is kept by the app itself, in
// the phone's storage, never here).
//
// And it passes on what the studio's links ask for (track 147, ruling KS-1):
// a download ("Keep a copy of the whole project", an e-book, a Word file), a
// page opened from a link ("Open it ready to print"), or a picture in a
// story. Those don't go through the app's own requests, so the helper hands
// each one to the studio running in the app's open page, and returns its
// answer. Nothing goes to the web host.
const CACHE = "studio-app-v2";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", "/index.html", "/manifest.webmanifest", "/icon.svg"])));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

// The studio answers in the app's open page: the page this request came
// from, or, for a link opened in a new page, the app's page already open.
async function studioPage(event) {
  if (event.clientId) {
    const own = await self.clients.get(event.clientId);
    if (own) return own;
  }
  const open = await self.clients.matchAll({ type: "window", includeUncontrolled: false });
  return open.find((c) => c.id !== event.resultingClientId) ?? null;
}

async function askStudio(event) {
  const req = event.request;
  const page = await studioPage(event);
  if (!page) {
    return new Response(JSON.stringify({ error: "Open the studio first, then try again." }), { status: 503, headers: { "content-type": "application/json" } });
  }
  const headers = {};
  req.headers.forEach((v, k) => (headers[k] = v));
  const body = req.method === "GET" || req.method === "HEAD" ? null : await req.arrayBuffer();
  const answer = await new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (e) => resolve(e.data);
    page.postMessage({ kind: "studio-request", method: req.method, url: req.url, headers, body }, [channel.port2, ...(body ? [body] : [])]);
    setTimeout(() => resolve({ status: 504, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "The studio didn't answer in time." }) }), 60000);
  });
  return new Response(answer.body, { status: answer.status, headers: answer.headers });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(askStudio(event));
    return;
  }
  if (req.method !== "GET") return;
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
