/* theme.js — المظهر (فاتح / داكن / زجاج) والحركة، خاصة بكل جهاز. الألوان في design.css و glass.css */
(function () {
  // لوحة المزود لها مظهرها الخاص، منفصل عن مظهر العيادة على نفس الجهاز
  const KEY = /(^|\/)provider\.html$/i.test(location.pathname) ? 'clinicProviderPrefs' : 'clinicPrefs';
  const DEFAULTS = { theme: 'dark', motion: 'on' };
  const REDUCED = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  function get() {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
    catch (e) { return { ...DEFAULTS }; }
  }
  const motionOff = p => (p || get()).motion === 'off' || REDUCED.matches;

  // «زجاج» مبني على ألوان الوضع الداكن
  function apply(p) {
    const root = document.documentElement, glass = p.theme === 'glass';
    root.dataset.theme = glass ? 'dark' : (p.theme === 'light' ? 'light' : 'dark');
    root.dataset.glass = glass ? 'on' : 'off';
    root.dataset.motion = p.motion === 'off' ? 'off' : 'on';
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head && document.head.appendChild(meta); }
    meta.content = glass ? '#161618' : p.theme === 'light' ? '#f6f6f7' : '#0b0c0e';
  }

  function set(changes) {
    const prev = get(), next = { ...prev, ...changes };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) { }
    const run = () => apply(next);
    // تبديل المظهر بتلاشٍ ناعم
    if (prev.theme !== next.theme && document.startViewTransition && !motionOff(next)) document.startViewTransition(run);
    else run();
    window.dispatchEvent(new CustomEvent('themechange', { detail: next }));
  }

  function glassSupport() {
    const blur = !!(window.CSS && CSS.supports && (CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)')));
    const memory = navigator.deviceMemory || null, cores = navigator.hardwareConcurrency || null;
    return { blur, weak: (memory !== null && memory < 4) || (cores !== null && cores < 4) };
  }

  // قائمة صغيرة لتبديل المظهر في الصفحات المستقلة (الدخول، لوحة المزود)
  function floatPicker() {
    const box = document.createElement('label');
    box.className = 'theme-float';
    box.innerHTML = '<select aria-label="المظهر"><option value="dark">داكن</option><option value="light">فاتح</option><option value="glass">زجاج</option></select>';
    const sel = box.querySelector('select');
    sel.value = get().theme;
    sel.addEventListener('change', () => set({ theme: sel.value }));
    document.body.appendChild(box);
  }

  window.ClinicTheme = { get, set, motionOff, glassSupport, floatPicker };
  apply(get());
})();
