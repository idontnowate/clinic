'use strict';
/* ============================================================
   cloud.js — تسجيل الدخول وحماية الصفحات والاشتراك والأجهزة (Auth)،
   ومزامنة بيانات العيادة مع Supabase (Cloud، داخل app.html فقط).
   كل نسخة مبيعة = عيادة لها حساباتها وبياناتها واشتراكها، تُدار من provider.html.
   ============================================================ */
const CLOUD = {
  // مشروع Supabase خاص بالعيادات (منفصل تمامًا عن مشروع المتجر)
  url: 'https://yukyibwkxwkssirhdhfg.supabase.co',
  // المفتاح العام (Publishable أو anon) من Project Settings ← API Keys
  key: 'sb_publishable_T7Dhh0i4Vx9RZ7mVuHHbJw_pC3mOMnO',
  lib: 'vendor/supabase-js-2.45.4.js',
  // مفتاح جلسة خاص بالعيادة: المتجر والعيادة على نفس الموقع (github.io)، فلا تتداخل جلستاهما
  storageKey: 'clinic-auth',
  emailDomain: 'users.clinicapp.io',
  bucket: 'clinic-files',
  // يظهر للعيادة في صفحة الدخول وعند انتهاء الاشتراك؛ اكتب رقمك هنا
  support: '07762525551',
  // مطابقة لـ clinic.sql: تنبيه قبل 7 أيام، ومهلة 3 أيام بعد الانتهاء
  warnDays: 7, graceDays: 3
};
const PAGES = { login: 'index.html', app: 'app.html', expired: 'expired.html' };
// أقسام لا تظهر لحساب السكرتير
const STAFF_HIDDEN = ['reports', 'users'];

/* ---------- تخزين محلي صغير (نفس بادئة lsGet في core.js) ---------- */
const rd = (k, d = null) => { try { const v = localStorage.getItem('clinic:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const wr = (k, v) => { try { v == null ? localStorage.removeItem('clinic:' + k) : localStorage.setItem('clinic:' + k, JSON.stringify(v)); } catch (e) { } };
const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const supportWa = text => 'https://wa.me/964' + CLOUD.support.replace(/^0/, '') + '?text=' + encodeURIComponent(text);

/* ============================================================
   Auth — مشترك بين كل الصفحات
   ============================================================ */
const Auth = {
  sb: null, member: null, _client: null,
  page: (location.pathname.split('/').pop() || PAGES.login).toLowerCase(),
  isDemo: () => rd('demo') === true,

  client() {
    if (this._client) return this._client;
    this._client = new Promise((res, rej) => {
      const make = () => { this.sb = window.supabase.createClient(CLOUD.url, CLOUD.key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: CLOUD.storageKey } }); res(this.sb); };
      if (window.supabase) return make();
      const s = document.createElement('script');
      s.src = CLOUD.lib; s.onload = make;
      s.onerror = () => { s.remove(); this._client = null; rej(new Error('تعذّر تحميل البرنامج. تحقق من الاتصال.')); };
      document.head.appendChild(s);
    });
    return this._client;
  },
  async session() {
    await this.client();
    try { return (await this.sb.auth.getSession()).data.session; } catch (e) { return null; }
  },
  async loadMember(userId) {
    const { data, error } = await this.sb.from('clinic_members').select('clinic_id, role, username, display_name').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return data ? { ...data, user_id: userId } : null;
  },
  roleLabel: r => r === 'admin' ? 'الطبيب' : 'سكرتير',

  /* ---------- الدخول والخروج ---------- */
  async login(username, password) {
    if (navigator.onLine === false) throw new Error('لا يوجد اتصال بالإنترنت. تسجيل الدخول يحتاج إنترنت.');
    await this.client();
    const v = String(username).trim().toLowerCase();
    const email = v.includes('@') ? v : `${v}@${CLOUD.emailDomain}`;
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      if (error && /banned/i.test(error.message || '')) throw new Error('هذا الحساب موقوف. تواصل مع طبيب العيادة أو إدارة البرنامج.');
      if (error && /fetch|network/i.test(error.message || '')) throw new Error('تعذّر الاتصال بالخادم. تحقق من الإنترنت.');
      throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة');
    }
    const m = await this.loadMember(data.user.id).catch(() => null);
    if (!m) { await this.sb.auth.signOut({ scope: 'local' }); throw new Error('هذا الحساب غير مرتبط بأي عيادة'); }
    this.member = m;
    const dev = await this.checkin(true);
    if (dev && (dev.status === 'revoked' || dev.status === 'limit')) {
      this.member = null;
      await this.sb.auth.signOut({ scope: 'local' });
      throw new Error(this.deviceMsg(dev));
    }
    wr('member', m);
    wr('demo', null);
    return m;
  },
  async logout() {
    if (this.isDemo()) return this.exitDemo();
    try { await this.client(); await this.sb.auth.signOut({ scope: 'local' }); } catch (e) { }
    this.wipeLocal();
    location.replace(PAGES.login);
  },
  // لا تبقى بيانات المرضى على جهاز سُجّل الخروج منه
  wipeLocal() {
    const m = rd('member');
    try { if (window.Cloud && Cloud.cache) Cloud.cache.close(); } catch (e) { }
    try { if (m) indexedDB.deleteDatabase('clinic-cloud-' + m.clinic_id); } catch (e) { }
    wr('member', null);
  },
  startDemo() { wr('demo', true); location.replace(PAGES.app); },
  exitDemo() { wr('demo', null); location.replace(PAGES.login); },

  /* ---------- حماية الصفحات ---------- */
  // يعيد العضوية إن كان مسموحًا للمستخدم بهذه الصفحة، وإلا يحوّله ويعيد null
  async guard() {
    const isLogin = this.page === PAGES.login || this.page === '';
    if (this.isDemo()) {
      if (isLogin || this.page === PAGES.expired) { location.replace(PAGES.app); return null; }
      this.member = { clinic_id: 'demo', role: 'admin', username: 'demo', display_name: 'د. تجربة', user_id: 'demo' };
      return this.member;
    }
    let session = null;
    try { session = await this.session(); }
    catch (e) {
      // بلا إنترنت ولا مكتبة: نفتح بالدخول المحفوظ
      const c = rd('member');
      if (c && !isLogin) { this.member = c; return c; }
      return null;
    }
    if (!session) {
      const c = rd('member');
      // تعذّر تجديد الجلسة بسبب الشبكة: نكمل بالبيانات المحفوظة
      if (c && navigator.onLine === false && !isLogin) { this.member = c; return c; }
      wr('member', null);
      if (!isLogin) location.replace(PAGES.login);
      return null;
    }
    let m = rd('member');
    if (m && m.user_id === session.user.id) this.revalidate(session.user.id);
    else {
      try { m = await this.loadMember(session.user.id); }
      catch (e) { m = null; if (!isLogin) location.replace(PAGES.login); return null; }
      if (!m) { await this.sb.auth.signOut({ scope: 'local' }); wr('member', null); if (!isLogin) location.replace(PAGES.login); return null; }
      wr('member', m);
    }
    this.member = m;
    if (isLogin) { location.replace(PAGES.app); return null; }
    const st = this.subStatus(rd('sub:' + m.clinic_id));
    if (this.blocked(st) && this.page !== PAGES.expired) { location.replace(PAGES.expired); return null; }
    this.sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT' && !this._leaving) { this.wipeLocal(); location.replace(PAGES.login); } });
    return m;
  },
  // في الخلفية: حساب أُزيل من العيادة يخرج
  async revalidate(userId) {
    try {
      const m = await this.loadMember(userId);
      if (!m) { this._leaving = true; await this.sb.auth.signOut({ scope: 'local' }); this.wipeLocal(); location.replace(PAGES.login); return; }
      this.member = m; wr('member', m);
      window.dispatchEvent(new CustomEvent('memberchange'));
    } catch (e) { }
  },

  /* ---------- الاشتراك ---------- */
  subStatus(row) {
    if (!row) return { status: 'none', days: null, row: null };
    const days = row.expires_at ? Math.round((Date.parse(row.expires_at) - Date.parse(todayISO())) / 864e5) : null;
    if (row.suspended) return { status: 'suspended', days, row };
    if (days === null || days > CLOUD.warnDays) return { status: 'active', days, row };
    if (days >= 0) return { status: 'expiring', days, row };
    if (days >= -CLOUD.graceDays) return { status: 'grace', days, row };
    return { status: 'expired', days, row };
  },
  blocked: st => st.status === 'expired' || st.status === 'suspended',
  cachedSub() { return this.member ? this.subStatus(rd('sub:' + this.member.clinic_id)) : this.subStatus(null); },
  // من السحابة؛ null إذا تعذّر (نبقى على المحفوظ)
  async fetchSub() {
    if (this.isDemo() || !this.member) return null;
    try {
      const { data, error } = await this.sb.from('clinic_subscriptions').select('plan, expires_at, suspended').eq('clinic_id', this.member.clinic_id).maybeSingle();
      if (error) return null;
      wr('sub:' + this.member.clinic_id, data || null);
      return this.subStatus(data);
    } catch (e) { return null; }
  },
  applySub(st) {
    if (!st) return;
    if (this.blocked(st) && this.page !== PAGES.expired) location.replace(PAGES.expired);
    else if (!this.blocked(st) && this.page === PAGES.expired) location.replace(PAGES.app);
  },

  /* ---------- الأجهزة ---------- */
  deviceId() {
    let id = rd('deviceId');
    if (!id || id.length < 8) { id = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)); wr('deviceId', id); }
    return id;
  },
  deviceInfo() {
    const ua = navigator.userAgent || '';
    const platform = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'آيباد' : /iPhone|iPod/.test(ua) ? 'آيفون'
      : /Android/.test(ua) ? (/Mobile/.test(ua) ? 'أندرويد' : 'تابلت أندرويد') : /Windows/.test(ua) ? 'ويندوز' : /Mac OS X|Macintosh/.test(ua) ? 'ماك' : /CrOS/.test(ua) ? 'كروم بوك' : /Linux/.test(ua) ? 'لينكس' : 'جهاز آخر';
    const browser = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /CriOS|Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : '';
    const m = ua.match(/Android [\d.]+; ([^;)]+)\)/);
    let installed = false;
    try { installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { }
    return { platform, browser, model: m && m[1] !== 'K' ? m[1].replace(/ Build\/.*$/, '').trim().slice(0, 60) : '', installed };
  },
  // null = تعذّر التحقق (لا إنترنت، أو لم تُنشأ جداول الأجهزة): لا نمنع شيئًا
  async checkin(force) {
    if (this.isDemo() || !this.member || navigator.onLine === false) return null;
    const last = rd('deviceCheck');
    if (!force && last && last.clinic === this.member.clinic_id && last.status === 'ok' && Date.now() - last.at < 60000) return last;
    try {
      const i = this.deviceInfo();
      const { data, error } = await this.sb.rpc('clinic_device_checkin', { p_clinic: this.member.clinic_id, p_device: this.deviceId(), p_platform: i.platform, p_browser: i.browser, p_model: i.model, p_installed: i.installed });
      if (error || !data || !data.status) return null;
      const out = { ...data, clinic: this.member.clinic_id, at: Date.now() };
      wr('deviceCheck', out);
      return out;
    } catch (e) { return null; }
  },
  deviceMsg: d => d.status === 'revoked'
    ? 'هذا الجهاز موقوف من طبيب العيادة. اطلب منه إعادة السماح له من صفحة «المستخدمون والأجهزة».'
    : `وصلت العيادة للحد الأعلى من الأجهزة (${d.limit}). اطلب من الطبيب إيقاف جهاز لا يُستخدم، أو تواصل مع إدارة البرنامج لزيادة الحد.`,
  // جهاز أُوقف وهو داخل: يخرج
  async applyDevice(d) {
    if (!d || (d.status !== 'revoked' && d.status !== 'limit')) return;
    try { sessionStorage.setItem('clinicForcedOut', this.deviceMsg(d)); } catch (e) { }
    this._leaving = true;
    try { await this.sb.auth.signOut({ scope: 'local' }); } catch (e) { }
    this.wipeLocal();
    location.replace(PAGES.login);
  },
  takeForcedOut() { try { const v = sessionStorage.getItem('clinicForcedOut'); sessionStorage.removeItem('clinicForcedOut'); return v || ''; } catch (e) { return ''; } },

  /* ---------- الحساب ---------- */
  async changePassword(current, next) {
    if (this.isDemo()) throw new Error('غير متاح في النسخة التجريبية');
    const s = await this.session();
    const email = s && s.user && s.user.email;
    if (!email) throw new Error('انتهت الجلسة، سجّل الدخول من جديد');
    const check = await this.sb.auth.signInWithPassword({ email, password: current });
    if (check.error) throw new Error('كلمة المرور الحالية غير صحيحة');
    const { error } = await this.sb.auth.updateUser({ password: next });
    if (error) throw new Error(/different|same/i.test(error.message || '') ? 'كلمة المرور الجديدة يجب أن تختلف عن الحالية' : 'تعذّر تغيير كلمة المرور');
  },
  async signOutOthers() {
    if (this.isDemo()) throw new Error('غير متاح في النسخة التجريبية');
    await this.client();
    const { error } = await this.sb.auth.signOut({ scope: 'others' });
    if (error) throw new Error('تعذّر تسجيل الخروج من الأجهزة الأخرى');
  },
  // عمليات الطبيب على حسابات عيادته (الدالة clinic-team)
  async team(action, body = {}) {
    if (this.isDemo()) throw new Error('غير متاح في النسخة التجريبية');
    const s = await this.session();
    if (!s) throw new Error('انتهت الجلسة، سجّل الدخول من جديد');
    let r;
    try {
      r = await fetch(CLOUD.url + '/functions/v1/clinic-team', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.access_token, apikey: CLOUD.key }, body: JSON.stringify({ action, ...body }) });
    } catch (e) { throw new Error('تعذّر الاتصال بالخادم. تحقق من الإنترنت.'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'تعذّرت العملية');
    return j;
  }
};

/* ============================================================
   Cloud — بيانات العيادة (app.html فقط؛ يستخدم دوال core.js)
   ============================================================ */
const Cloud = {
  member: null, since: null, cache: null, urls: new Map(), pulling: null, againPull: false,
  get sb() { return Auth.sb; },
  get clinicId() { return this.member.clinic_id; },

  async start(m) {
    this.member = m;
    await this.openCache();
    COLS.forEach(reindex);
  },
  afterShown() {
    this.pull().then(() => this.offerMigration());
    Auth.fetchSub().then(st => { Auth.applySub(st); banner(); });
    Auth.checkin().then(d => Auth.applyDevice(d));
    this.watch();
  },

  /* ---------- نسخة على الجهاز (IndexedDB): فتح سريع وعرض بلا إنترنت ---------- */
  cacheName() { return 'clinic-cloud-' + this.clinicId; },
  async openCache() {
    try {
      this.cache = await new Promise((res, rej) => {
        const r = indexedDB.open(this.cacheName(), 1);
        r.onupgradeneeded = () => r.result.createObjectStore('docs');
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
      const rows = await new Promise((res, rej) => {
        const out = [], c = this.cache.transaction('docs').objectStore('docs').openCursor();
        c.onsuccess = () => { const cur = c.result; if (cur) { out.push([cur.key, cur.value]); cur.continue(); } else res(out); };
        c.onerror = () => rej(c.error);
      });
      for (const [k, v] of rows) {
        if (k === '#since') { this.since = v; continue; }
        const i = k.indexOf('/'), col = k.slice(0, i);
        if (k === 'settings/clinic') S = { ...DEFAULT_SETTINGS, ...v };
        else if (D[col]) D[col].push({ ...v, id: k.slice(i + 1) });
      }
    } catch (e) { this.cache = null; this.since = null; }
  },
  cachePut(entries) {
    if (!this.cache || !entries.length) return;
    try {
      const st = this.cache.transaction('docs', 'readwrite').objectStore('docs');
      for (const [k, v] of entries) v === undefined ? st.delete(k) : st.put(v, k);
    } catch (e) { }
  },

  /* ---------- المزامنة ---------- */
  pull() {
    if (this.pulling) { this.againPull = true; return this.pulling; }
    this.pulling = this._pull().then(() => { app.synced = true; }).catch(() => { if (!this.since) toast('تعذّر تحميل بيانات العيادة. تحقق من الاتصال.'); })
      .finally(() => { this.pulling = null; if (this.againPull) { this.againPull = false; this.pull(); } });
    return this.pulling;
  },
  async _pull() {
    // نعيد آخر دقيقتين احتياطًا لتعديلات حُفظت بنفس اللحظة من جهاز آخر
    const from = this.since ? new Date(Date.parse(this.since) - 120000).toISOString() : null;
    let max = this.since, changed = 0;
    for (let off = 0; ; off += 1000) {
      let q = this.sb.from('clinic_docs').select('col, id, data, deleted, updated_at').eq('clinic_id', this.clinicId);
      q = from ? q.gt('updated_at', from) : q.eq('deleted', false);
      const { data, error } = await q.order('updated_at').order('col').order('id').range(off, off + 999);
      if (error) throw error;
      const entries = [];
      for (const r of data) {
        if (!max || r.updated_at > max) max = r.updated_at;
        const key = r.col + '/' + r.id;
        if (r.col === 'settings') {
          if (r.id === 'clinic' && !r.deleted) { S = { ...DEFAULT_SETTINGS, ...r.data }; entries.push([key, r.data]); changed++; }
          continue;
        }
        if (!D[r.col]) continue;
        const cur = byId(r.col, r.id);
        if (r.deleted) { if (cur) { D[r.col].splice(D[r.col].indexOf(cur), 1); changed++; } entries.push([key, undefined]); continue; }
        const obj = { ...r.data, id: r.id };
        if (cur && JSON.stringify(cur) === JSON.stringify(obj)) continue;
        if (cur) D[r.col][D[r.col].indexOf(cur)] = obj; else D[r.col].push(obj);
        IDX[r.col].set(r.id, obj);
        entries.push([key, r.data]); changed++;
      }
      this.cachePut(entries);
      if (data.length < 1000) break;
    }
    if (max && max !== this.since) { this.since = max; this.cachePut([['#since', max]]); }
    if (changed) { COLS.forEach(reindex); applySettings(); scheduleRender(); }
  },
  watch() {
    const later = debounce(() => this.pull(), 600);
    try {
      this.sb.channel('clinic-' + this.clinicId)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'clinic_docs', filter: 'clinic_id=eq.' + this.clinicId }, later)
        .subscribe();
    } catch (e) { }
    setInterval(() => { if (!document.hidden) this.pull(); }, 45000);
    setInterval(() => Auth.fetchSub().then(st => { Auth.applySub(st); banner(); }), 10 * 60000);
    setInterval(() => { if (!document.hidden) Auth.checkin().then(d => Auth.applyDevice(d)); }, 120000);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      this.pull(); Auth.fetchSub().then(st => { Auth.applySub(st); banner(); }); Auth.checkin().then(d => Auth.applyDevice(d));
    });
    window.addEventListener('online', () => { this.pull(); buildNav(); });
    window.addEventListener('offline', () => buildNav());
  },

  /* ---------- الحفظ ---------- */
  async put(col, id, data, deleted = false) {
    if (navigator.onLine === false) throw this.err('offline');
    const { error } = await this.sb.from('clinic_docs').upsert({ clinic_id: this.clinicId, col, id, data, deleted }, { onConflict: 'clinic_id,col,id' });
    if (error) throw this.err(error.code === '42501' ? 'denied' : /fetch|network/i.test(error.message || '') ? 'offline' : 'failed', error);
    this.cachePut([[col + '/' + id, deleted ? undefined : data]]);
  },
  err(code, cause) { const e = new Error(code); e.code = 'cloud_' + code; e.cause = cause; return e; },
  writeMsg(e) {
    const c = e && e.code;
    if (c === 'cloud_offline') return 'لا يوجد اتصال بالإنترنت — لم يُحفظ. أعد المحاولة بعد عودة الاتصال.';
    if (c === 'cloud_denied') return Auth.blocked(Auth.cachedSub()) ? 'انتهى اشتراك العيادة — لا يمكن الحفظ.' : 'ليست لديك صلاحية لهذا التعديل.';
    return 'تعذّر الحفظ. تحقق من الاتصال ثم أعد المحاولة.';
  },

  /* ---------- المرفقات (Supabase Storage) ---------- */
  async upload(file) {
    const ext = (file.name.match(/\.[a-z0-9]{1,6}$/i) || [''])[0].toLowerCase();
    const path = `${this.clinicId}/${uid('f')}${ext}`;
    const type = file.type || (ext === '.pdf' ? 'application/pdf' : '');
    const { error } = await this.sb.storage.from(CLOUD.bucket).upload(path, file, { contentType: type || undefined, upsert: false });
    if (error) throw this.err(/size|large/i.test(error.message || '') ? 'too_large' : /row-level|policy|Unauthorized/i.test(error.message || '') ? 'denied' : 'failed', error);
    return { path, contentType: type, sizeBytes: file.size };
  },
  async signedUrl(path) {
    const hit = this.urls.get(path);
    if (hit && hit.exp > Date.now()) return hit.url;
    const { data, error } = await this.sb.storage.from(CLOUD.bucket).createSignedUrl(path, 3600);
    if (error) throw error;
    this.urls.set(path, { url: data.signedUrl, exp: Date.now() + 50 * 60000 });
    return data.signedUrl;
  },
  // للصور المصغّرة: الرابط إن كان جاهزًا، وإلا يُجلب ثم يُعاد الرسم
  thumb(path) {
    const hit = this.urls.get(path);
    if (hit && hit.exp > Date.now()) return hit.url;
    if (!hit || !hit.pending) { this.urls.set(path, { pending: true, exp: 0 }); this.signedUrl(path).then(scheduleRender).catch(() => { }); }
    return '';
  },
  async delFile(path) {
    const { error } = await this.sb.storage.from(CLOUD.bucket).remove([path]);
    if (error) throw this.err('failed', error);
  },

  /* ---------- استيراد: استعادة نسخة احتياطية، وبيانات النسخة القديمة على الجهاز ---------- */
  async importData(data, progress) {
    const rows = [];
    for (const c of COLS) for (const r of (data[c] || [])) if (r && r.id) rows.push([c, r]);
    let done = 0, skipped = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const out = [];
      for (const [c, r0] of rows.slice(i, i + 200)) {
        const r = { ...r0 };
        if (c === 'files') {
          if (typeof r.data === 'string' && r.data.startsWith('data:')) {
            try {
              const blob = await (await fetch(r.data)).blob();
              const up = await this.upload(new File([blob], r.name || 'file', { type: r.type || blob.type }));
              r.path = up.path; delete r.data;
            } catch (e) { skipped++; continue; }
          } else if (!r.path) { skipped++; continue; }
        }
        r.updatedAt = Date.now(); r.createdAt = r.createdAt || r.updatedAt;
        out.push({ clinic_id: this.clinicId, col: c, id: String(r.id), data: r, deleted: false });
      }
      if (out.length) {
        const { error } = await this.sb.from('clinic_docs').upsert(out, { onConflict: 'clinic_id,col,id' });
        if (error) throw this.err(error.code === '42501' ? 'denied' : 'failed', error);
      }
      done = Math.min(rows.length, i + 200);
      progress && progress(done, rows.length);
    }
    if (data.settings && typeof data.settings === 'object') await saveSettings(data.settings);
    await this.pull();
    return { done: done - skipped, skipped };
  },
  async offerMigration() {
    const flag = 'migrated:' + this.clinicId;
    if (app.role !== 'admin' || lsGet(flag)) return;
    let rows;
    try { await IDB.open(); rows = await IDB.all(); } catch (e) { return; }
    const data = { settings: null };
    for (const [k, v] of rows) {
      const i = k.indexOf('/'), col = k.slice(0, i);
      if (k === 'settings/clinic') data.settings = v;
      else if (COLS.includes(col)) (data[col] = data[col] || []).push({ ...v, id: k.slice(i + 1) });
    }
    const n = sum(COLS, c => (data[c] || []).length);
    if (!n || !$('#overlay').hidden) return;
    openModal('نقل بيانات هذا الجهاز', `<form id="mForm" class="form"><p class="full" style="margin:0">وُجدت على هذا الجهاز بيانات من النسخة السابقة: <b>${(data.patients || []).length}</b> مريض و<b>${n}</b> سجل بالمجموع. انقلها إلى حساب العيادة لتظهر على كل الأجهزة؟</p><div class="hint">لا يُحذف شيء من حساب العيادة؛ تُضاف السجلات وتُحدَّث المطابقة لها.</div>
      ${mfoot('نقل البيانات', '<button class="btn ghost" type="button" data-act="skipMigration">لا أريد نقلها</button>')}</form>`, {
      submit: async () => {
        const r = await this.importData(data, (a, b) => toast(`جارٍ النقل… ${a}/${b}`));
        lsSet(flag, true);
        toast(`نُقل ${r.done} سجل إلى حساب العيادة${r.skipped ? ` (تعذّر نقل ${r.skipped} مرفق)` : ''}`);
        return true;
      }
    });
  }
};
window.Auth = Auth;
window.Cloud = Cloud;
