/* AutoScroll Reader — offline support.
   The app itself (this page, its icons) is kept on the device, so the reader
   opens with no internet. When online, a fresh copy is fetched in the
   background and used next time. Books live in the page's own storage, not
   here, and talking to Google Drive always goes straight to the network. */
const SHELL = 'asr-shell-v15';
const FONTS = 'asr-fonts-v1';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== FONTS).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts: keep what has been used, refresh quietly.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((r) => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin !== location.origin) return;

  // The page: try the network briefly so updates arrive, otherwise the saved copy.
  if (req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html')) {
    e.respondWith((async () => {
      const c = await caches.open(SHELL);
      try {
        // no-store: skip the browser's own 10-minute cache, so updates show at once
        const r = await withTimeout(fetch(req.url, { cache: 'no-store' }), 3500);
        if (r && r.ok) c.put('index.html', r.clone());
        return r;
      } catch (_) {
        return (await c.match('index.html')) || (await c.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Everything else of ours: saved copy first.
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
    if (r && r.ok) caches.open(SHELL).then((c) => c.put(req, r.clone()));
    return r;
  })));
});
