/* sw.js — يحفظ صفحات البرنامج وملفاته على الجهاز ليفتح بدون إنترنت
 * - الصفحات: من الشبكة أولًا (لتصل التحديثات فورًا)، والمحفوظة عند انقطاع الإنترنت.
 * - الملفات: المحفوظة بنفس رقم النسخة (?v=) أولًا.
 * - طلبات Supabase لا تمر من هنا؛ بيانات العيادة يحفظها cloud.js في IndexedDB.
 */
const CACHE = 'clinic-app-v1';
const PAGES = ['index.html', 'app.html', 'expired.html', 'terms.html', 'provider.html'];
const EXTRA = ['manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'vendor/supabase-js-2.45.4.js'];

async function precache() {
  const cache = await caches.open(CACHE);
  const assets = new Set(EXTRA);
  await Promise.all(PAGES.map(async page => {
    try {
      const res = await fetch(page, { cache: 'no-cache' });
      if (!res.ok) return;
      const html = await res.clone().text();
      await cache.put(page, res);
      for (const m of html.matchAll(/(?:src|href)="([^"#]+\.(?:js|css)(?:\?[^"]*)?)"/g)) assets.add(m[1]);
    } catch (e) { }
  }));
  await Promise.all([...assets].map(async url => {
    try {
      if (await cache.match(url)) return;
      const res = await fetch(url, { mode: url.startsWith('http') ? 'cors' : 'same-origin' });
      if (res.ok) await cache.put(url, res);
    } catch (e) { }
  }));
}
self.addEventListener('install', e => e.waitUntil(precache().then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

async function page(req) {
  const cache = await caches.open(CACHE);
  const name = new URL(req.url).pathname.split('/').pop() || 'index.html';
  const network = fetch(req, { cache: 'no-cache' }).then(res => { if (res.ok) cache.put(name, res.clone()); return res; });
  const saved = await cache.match(name);
  if (!saved) return network.catch(() => cache.match('index.html'));
  const timeout = new Promise(r => setTimeout(() => r(saved), 4000));
  return Promise.race([network.catch(() => saved), timeout]);
}
async function asset(req) {
  const cache = await caches.open(CACHE);
  const exact = await cache.match(req);
  if (exact) return exact;
  try {
    const res = await fetch(req);
    if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
    return res;
  } catch (err) {
    const any = await cache.match(req, { ignoreSearch: true });
    if (any) return any;
    throw err;
  }
}
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (/\.supabase\.co$/.test(url.hostname) || !/^https?:$/.test(url.protocol)) return;
  if (url.origin === location.origin && url.pathname.endsWith('/version.json')) return;
  if (req.mode === 'navigate') e.respondWith(page(req));
  else if (url.origin === location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) e.respondWith(asset(req));
});
