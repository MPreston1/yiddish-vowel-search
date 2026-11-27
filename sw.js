// Offline support. The app "shell" (index.html + style.css + the JS files) is cached
// as one set and always served from that set, so the HTML, CSS and JS can never
// come from different releases. Every file the page loads must be listed in SHELL. Each time the app is opened, the service worker
// re-downloads all files in the background (bypassing the browser's HTTP
// cache) and swaps in the new set only if every file arrived. A change you
// deploy therefore shows up the next time the app is opened after it has
// been loaded once; no version numbers to bump.
// Requests to other sites are never touched.
const CACHE = 'yiddish-vowel';
const SHELL = ['./', 'index.html', 'style.css', 'shared.js', 'rules.js',
    'length.js', 'oy.js', 'rulefinder.js', 'manifest.webmanifest', 'icon-192.png',
    'icon-512.png', 'jszip.min.js', 'data/guide.pptx', 'data/oy.csv', 'data/oy-rules.csv',
    'data/oy-minimal-pairs.csv', 'data/rules.csv', 'data/database.csv'];

let refreshing = null;
function refreshShell() {
  if (!refreshing) {
    refreshing = (async () => {
      const responses = await Promise.all(SHELL.map(u => fetch(u, { cache: 'no-cache' })));
      if (!responses.every(r => r.ok)) throw new Error('shell download incomplete');
      const cache = await caches.open(CACHE);
      await Promise.all(SHELL.map((u, i) => cache.put(u, responses[i])));
    })().finally(() => { refreshing = null; });
  }
  return refreshing;
}

self.addEventListener('install', e => {
  e.waitUntil(refreshShell().catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;

  const isPage = req.mode === 'navigate';
  const isShellFile = SHELL.some(u => new URL(u, self.registration.scope).href === url.href);
  if (!isPage && !isShellFile) return;

  // Serve from the cached set (the page is always the cached './'); fall back to
  // the network only if nothing is cached yet.
  e.respondWith(
    caches.match(isPage ? './' : req).then(hit => hit || fetch(req))
  );

  // Opening the app triggers a background check for a newer set.
  if (isPage) e.waitUntil(refreshShell().catch(() => {}));
});
