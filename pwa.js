/* pwa.js — تثبيت البرنامج كتطبيق، وحفظه على الجهاز ليفتح بدون إنترنت، وإشعار التحديث (مثل المتجر) */
(function () {
  const head = document.head;
  function addLink(rel, href, extra) {
    if (head.querySelector(`link[rel="${rel}"]`)) return;
    const l = document.createElement('link'); l.rel = rel; l.href = href; Object.assign(l, extra || {}); head.appendChild(l);
  }
  addLink('manifest', 'manifest.webmanifest');
  addLink('apple-touch-icon', 'icons/apple-touch-icon.png');
  addLink('icon', 'icons/icon-192.png', { type: 'image/png' });
  [['apple-mobile-web-app-capable', 'yes'], ['mobile-web-app-capable', 'yes'], ['apple-mobile-web-app-title', 'العيادة']].forEach(([n, c]) => {
    if (!head.querySelector(`meta[name="${n}"]`)) { const m = document.createElement('meta'); m.name = n; m.content = c; head.appendChild(m); }
  });

  // حفظ الصفحات على الجهاز (يحتاج https أو localhost)
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
  }

  // ===== التحديثات: يُرفع BUILD مع version.json في كل تحديث =====
  const BUILD = 202610320;
  let bar = null;
  async function checkVersion() {
    if (navigator.onLine === false || location.protocol === 'file:') return null;
    try {
      const res = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return null;
      const remote = Number((await res.json()).build) || 0;
      if (remote > BUILD) showBar();
      return remote;
    } catch (e) { return null; }
  }
  function showBar() {
    if (bar || !document.body) return;
    bar = document.createElement('div');
    bar.className = 'update-bar'; bar.setAttribute('role', 'status');
    bar.innerHTML = '<span>يتوفر تحديث جديد للبرنامج</span><button type="button">تحديث الآن</button>';
    bar.querySelector('button').addEventListener('click', async e => {
      e.target.disabled = true; e.target.textContent = 'جارٍ التحديث…';
      try {
        if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
        const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
        if (reg) await reg.update();
      } catch (err) { }
      location.reload();
    });
    document.body.appendChild(bar);
  }
  window.addEventListener('load', () => setTimeout(checkVersion, 3000));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkVersion(); });
  setInterval(checkVersion, 30 * 60 * 1000);

  // ===== التثبيت =====
  let installEvent = null;
  const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; window.dispatchEvent(new CustomEvent('appinstallable')); });
  window.addEventListener('appinstalled', () => { installEvent = null; window.dispatchEvent(new CustomEvent('appinstallable')); });

  // ===== مؤشر انقطاع الإنترنت =====
  let pill = null, wasOff = false;
  function net() {
    if (!document.body) return;
    const off = navigator.onLine === false;
    if (!off && !wasOff) return;
    if (!pill) { pill = document.createElement('div'); pill.className = 'net-pill'; pill.setAttribute('role', 'status'); pill.innerHTML = '<i></i><span></span>'; document.body.appendChild(pill); }
    pill.dataset.mode = off ? 'offline' : 'ok';
    pill.querySelector('span').textContent = off ? 'بدون إنترنت · للاطلاع فقط، الحفظ يحتاج إنترنت' : 'عاد الاتصال';
    requestAnimationFrame(() => pill.classList.add('show'));
    if (!off) setTimeout(() => pill.classList.remove('show'), 2500);
    wasOff = off;
  }
  window.addEventListener('online', net);
  window.addEventListener('offline', net);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', net); else net();

  window.ClinicApp = {
    build: BUILD, checkVersion, installed,
    installState() { return installed() ? 'installed' : installEvent ? 'ready' : /iphone|ipad|ipod/i.test(navigator.userAgent) ? 'ios' : 'unavailable'; },
    async install() {
      if (!installEvent) return false;
      installEvent.prompt();
      const c = await installEvent.userChoice;
      installEvent = null; window.dispatchEvent(new CustomEvent('appinstallable'));
      return c.outcome === 'accepted';
    }
  };
})();
