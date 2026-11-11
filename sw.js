// Service worker for the combined Yiddish Vowel Search app.
const V = 'vowel-search-v2';
const SHELL = ['./', 'index.html', 'style.css', 'shared.js', 'length.js', 'oy.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'jszip.min.js', 'guide.pptx'];
self.addEventListener('install', e => {
    e.waitUntil(caches.open(V).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {
    })))).then(() => self.skipWaiting()))
});
self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('vowel-search-') && k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()))
});
// Same-origin files: network first (so updates show up), saved copy when offline. Google Sheets requests go straight through.
self.addEventListener('fetch', e => {
    const r = e.request;
    if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
    e.respondWith(fetch(r).then(res => {
        if (res.ok) {
            const copy = res.clone();
            caches.open(V).then(c => c.put(r, copy))
        }
        return res
    }).catch(() => caches.match(r, {ignoreSearch: true}).then(m => m || (r.mode === 'navigate' ? caches.match('index.html') : Response.error()))))
});