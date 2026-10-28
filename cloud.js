'use strict';
/* ============================================================
   cloud.js — تسجيل الدخول، ومزامنة بيانات العيادة مع Supabase، والاشتراك
   كل نسخة مبيعة = عيادة لها حساباتها وبياناتها واشتراكها، تُدار من provider.html.
   يعمل فقط عند فتح البرنامج خارج claude.ai (مثل GitHub Pages).
   ============================================================ */
const CLOUD = {
  // نفس مشروع Supabase للمتجر؛ اتركهما فارغين لتشغيل البرنامج بلا حسابات (البيانات على الجهاز فقط)
  url: 'https://pxxgydllfustqkpkfiqn.supabase.co',
  key: 'sb_publishable_I2L_KEOwIXjyuCOue4w_3g_MMhYImIU',
  lib: 'vendor/supabase-js-2.45.4.js',
  emailDomain: 'users.clinicapp.io',
  bucket: 'clinic-files',
  // يظهر للعيادة عند انتهاء الاشتراك أو قرب انتهائه؛ اكتب رقمك هنا
  support: '07762525551',
  // مطابقة لـ clinic.sql: تنبيه قبل 7 أيام، ومهلة 3 أيام بعد الانتهاء
  warnDays: 7, graceDays: 3
};
// أقسام لا تظهر لحساب السكرتير/الموظف
const STAFF_HIDDEN = ['reports', 'settings'];

const Cloud = {
  enabled: !!(CLOUD.url && CLOUD.key),
  sb: null, member: null, sub: null, since: null, cache: null,
  urls: new Map(), pulling: null, againPull: false,

  /* ---------- boot ---------- */
  async boot() {
    try { await this.loadLib(); }
    catch (e) { this.showLogin('تعذّر تحميل البرنامج. تحقق من الاتصال ثم أعد تحميل الصفحة.'); return; }
    this.sb = window.supabase.createClient(CLOUD.url, CLOUD.key, { auth: { persistSession: true, autoRefreshToken: true } });
    this.sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT' && app.mode === 'cloud') location.reload(); });
    let session = null;
    try { session = (await this.sb.auth.getSession()).data.session; } catch (e) { }
    if (!session) { this.showLogin(); return; }
    await this.enter(session.user);
  },
  loadLib() {
    return new Promise((res, rej) => {
      if (window.supabase) return res();
      const s = document.createElement('script');
      s.src = CLOUD.lib; s.onload = res; s.onerror = () => { s.remove(); rej(new Error('lib')); };
      document.head.appendChild(s);
    });
  },
  async enter(user) {
    let m = null;
    try {
      const r = await this.sb.from('clinic_members').select('clinic_id, role, username, display_name').eq('user_id', user.id).maybeSingle();
      if (r.error) throw r.error;
      m = r.data;
      if (!m) { await this.sb.auth.signOut({ scope: 'local' }); this.showLogin('هذا الحساب غير مرتبط بأي عيادة.'); return; }
      lsSet('cloudMember', { ...m, user_id: user.id });
    } catch (e) {
      // بلا إنترنت: نفتح آخر بيانات محفوظة على الجهاز لنفس الحساب
      const c = lsGet('cloudMember');
      if (c && c.user_id === user.id) { m = c; toast('لا يوجد اتصال بالإنترنت — تُعرض آخر بيانات محفوظة على هذا الجهاز.'); }
      else { this.showLogin('تعذّر الاتصال بالخادم. تحقق من الإنترنت ثم أعد المحاولة.'); return; }
    }
    this.member = m; this.userId = user.id;
    app.role = m.role;
    $('#login').hidden = true;
    this.sub = lsGet('cloudSub:' + m.clinic_id);
    this.applySub();
    await this.openCache();
    app.mode = 'cloud'; app.settingsLoaded = true;
    applySettings(); buildShell();
    await this.pull();
    await this.refreshSub();
    this.watch();
    this.offerMigration();
  },

  /* ---------- login screen ---------- */
  showLogin(err) {
    const box = $('#login');
    box.hidden = false;
    $('#lgErr').textContent = err || ''; $('#lgErr').hidden = !err;
    $('#lgBtn').disabled = false; $('#lgBtn').textContent = 'دخول';
    setTimeout(() => $('#lgUser').focus(), 30);
  },
  async login(username, password) {
    const v = String(username).trim().toLowerCase();
    const email = v.includes('@') ? v : `${v}@${CLOUD.emailDomain}`;
    if (navigator.onLine === false) throw new Error('لا يوجد اتصال بالإنترنت. تسجيل الدخول يحتاج إنترنت.');
    if (!this.sb) throw new Error('تعذّر تحميل البرنامج. أعد تحميل الصفحة.');
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      if (error && /banned/i.test(error.message || '')) throw new Error('هذا الحساب موقوف. تواصل مع إدارة البرنامج.');
      if (error && /fetch|network/i.test(error.message || '')) throw new Error('تعذّر الاتصال بالخادم. تحقق من الإنترنت.');
      throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة');
    }
    await this.enter(data.user);
  },
  async logout() {
    try { await this.sb.auth.signOut({ scope: 'local' }); } catch (e) { }
    // لا تبقى بيانات المرضى على جهاز سُجّل الخروج منه
    try { this.cache && this.cache.close(); indexedDB.deleteDatabase(this.cacheName()); } catch (e) { }
    lsSet('cloudMember', null);
    location.reload();
  },

  /* ---------- local cache (IndexedDB) — فتح سريع وعرض بلا إنترنت ---------- */
  cacheName() { return 'clinic-cloud-' + this.member.clinic_id; },
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
      COLS.forEach(reindex);
    } catch (e) { this.cache = null; this.since = null; }
  },
  cachePut(entries) {
    if (!this.cache || !entries.length) return;
    try {
      const st = this.cache.transaction('docs', 'readwrite').objectStore('docs');
      for (const [k, v] of entries) v === undefined ? st.delete(k) : st.put(v, k);
    } catch (e) { }
  },

  /* ---------- sync ---------- */
  pull() {
    if (this.pulling) { this.againPull = true; return this.pulling; }
    this.pulling = this._pull().catch(e => { if (app.mode === 'cloud' && !this.since) toast('تعذّر تحميل بيانات العيادة. تحقق من الاتصال.'); })
      .finally(() => { this.pulling = null; if (this.againPull) { this.againPull = false; this.pull(); } });
    return this.pulling;
  },
  async _pull() {
    const cid = this.member.clinic_id;
    // نعيد آخر دقيقتين احتياطًا لتعديلات حُفظت بنفس اللحظة من جهاز آخر
    const from = this.since ? new Date(Date.parse(this.since) - 120000).toISOString() : null;
    let max = this.since, changed = 0;
    for (let off = 0; ; off += 1000) {
      let q = this.sb.from('clinic_docs').select('col, id, data, deleted, updated_at').eq('clinic_id', cid);
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
        if (cur && cur.updatedAt === r.data.updatedAt && JSON.stringify(cur) === JSON.stringify({ ...r.data, id: r.id })) continue;
        const obj = { ...r.data, id: r.id };
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
      this.sb.channel('clinic-' + this.member.clinic_id)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'clinic_docs', filter: 'clinic_id=eq.' + this.member.clinic_id }, later)
        .subscribe();
    } catch (e) { }
    // احتياط إذا انقطعت المزامنة الفورية
    setInterval(() => { if (!document.hidden) this.pull(); }, 45000);
    setInterval(() => this.refreshSub(), 10 * 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { this.pull(); this.refreshSub(); } });
    window.addEventListener('online', () => { this.pull(); this.refreshSub(); });
  },

  /* ---------- writes ---------- */
  async put(col, id, data, deleted = false) {
    if (navigator.onLine === false) throw this.err('offline');
    const { error } = await this.sb.from('clinic_docs').upsert({ clinic_id: this.member.clinic_id, col, id, data, deleted }, { onConflict: 'clinic_id,col,id' });
    if (error) throw this.err(error.code === '42501' ? 'denied' : /fetch|network/i.test(error.message || '') ? 'offline' : 'failed', error);
    this.cachePut([[col + '/' + id, deleted ? undefined : data]]);
  },
  err(code, cause) { const e = new Error(code); e.code = 'cloud_' + code; e.cause = cause; return e; },
  writeMsg(e) {
    const c = e && e.code;
    if (c === 'cloud_offline') return 'لا يوجد اتصال بالإنترنت — لم يُحفظ. أعد المحاولة بعد عودة الاتصال.';
    if (c === 'cloud_denied') return this.locked() ? this.lockedMsg() : 'ليست لديك صلاحية لهذا التعديل.';
    return 'تعذّر الحفظ. تحقق من الاتصال ثم أعد المحاولة.';
  },

  /* ---------- attachments (Supabase Storage) ---------- */
  async upload(file) {
    const ext = (file.name.match(/\.[a-z0-9]{1,6}$/i) || [''])[0].toLowerCase();
    const path = `${this.member.clinic_id}/${uid('f')}${ext}`;
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
  // للصور المصغّرة: يعيد الرابط إن كان جاهزًا، وإلا يجلبه ويعيد الرسم
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

  /* ---------- bulk import: backup restore, and data from the old device-only version ---------- */
  async importData(data, progress) {
    const cid = this.member.clinic_id, rows = [];
    for (const c of COLS) for (const r of (data[c] || [])) if (r && r.id) rows.push([c, r]);
    let done = 0, skipped = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const out = [];
      for (const [c, r0] of rows.slice(i, i + 200)) {
        const r = { ...r0 };
        if (c === 'files') {
          // attachments kept inline on the device move to cloud storage
          if (typeof r.data === 'string' && r.data.startsWith('data:')) {
            try {
              const blob = await (await fetch(r.data)).blob();
              const up = await this.upload(new File([blob], r.name || 'file', { type: r.type || blob.type }));
              r.path = up.path; delete r.data;
            } catch (e) { skipped++; continue; }
          } else if (!r.path) { skipped++; continue; }
        }
        r.updatedAt = Date.now(); r.createdAt = r.createdAt || r.updatedAt;
        out.push({ clinic_id: cid, col: c, id: String(r.id), data: r, deleted: false });
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
    const flag = 'migrated:' + this.member.clinic_id;
    if (app.role !== 'admin' || !W() || lsGet(flag)) return;
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
  },

  /* ---------- subscription ---------- */
  async refreshSub() {
    if (!this.member || !this.sb) return;
    try {
      const { data, error } = await this.sb.from('clinic_subscriptions').select('plan, expires_at, suspended').eq('clinic_id', this.member.clinic_id).maybeSingle();
      if (error) return;
      this.sub = data || null;
      lsSet('cloudSub:' + this.member.clinic_id, this.sub);
      const was = app.canWrite;
      this.applySub();
      if (was !== app.canWrite) buildShell(); else banner();
    } catch (e) { }
  },
  status() {
    const s = this.sub;
    if (!s) return { st: 'active', days: null };
    const days = s.expires_at ? daysBetween(today(), s.expires_at) : null;
    if (s.suspended) return { st: 'suspended', days };
    if (days === null || days > CLOUD.warnDays) return { st: 'active', days };
    if (days >= 0) return { st: 'expiring', days };
    if (days >= -CLOUD.graceDays) return { st: 'grace', days };
    return { st: 'expired', days };
  },
  locked() { const s = this.status().st; return s === 'suspended' || s === 'expired'; },
  lockedHead() { return `${this.status().st === 'suspended' ? 'اشتراك العيادة موقوف' : 'انتهى اشتراك العيادة'} — يمكنك الاطلاع على البيانات فقط.`; },
  lockedMsg() { return `${this.lockedHead()} للتجديد تواصل على ${CLOUD.support}`; },
  applySub() { app.canWrite = !this.locked(); },
  bannerHtml() {
    const { st, days } = this.status();
    const call = `<a href="tel:${esc(CLOUD.support)}" class="ltr" style="color:inherit;font-weight:700">${esc(CLOUD.support)}</a>`;
    if (st === 'suspended' || st === 'expired') return `<div class="banner bad">${esc(this.lockedHead())} للتجديد تواصل على ${call}</div>`;
    if (app.role !== 'admin') return '';
    if (st === 'grace') return `<div class="banner bad">انتهى اشتراك العيادة بتاريخ ${esc(fmtDate(this.sub.expires_at))}. سيتوقف الحفظ بعد ${CLOUD.graceDays + days} يوم. للتجديد تواصل على ${call}</div>`;
    if (st === 'expiring') return `<div class="banner">${days === 0 ? 'ينتهي اشتراك العيادة اليوم' : `ينتهي اشتراك العيادة بعد ${days} يوم (${esc(fmtDate(this.sub.expires_at))})`}. للتجديد تواصل على ${call}</div>`;
    return '';
  },
  subLine() {
    const { st, days } = this.status();
    if (!this.sub || !this.sub.expires_at) return st === 'suspended' ? pill('bad', 'موقوف') : pill('ok', this.sub && this.sub.plan ? this.sub.plan : 'فعّال');
    const d = esc(fmtDate(this.sub.expires_at));
    if (st === 'active') return `${pill('ok', 'فعّال')} حتى ${d}`;
    if (st === 'expiring') return `${pill('warn', 'ينتهي قريبًا')} ${d}`;
    if (st === 'suspended') return pill('bad', 'موقوف');
    return `${pill('bad', 'منتهٍ')} منذ ${d}`;
  }
};

/* ---------- login form ---------- */
$('#lgSupport').textContent = CLOUD.support; $('#lgSupport').href = 'tel:' + CLOUD.support;
$('#lgForm').addEventListener('submit', async e => {
  e.preventDefault();
  const u = $('#lgUser').value, p = $('#lgPass').value, btn = $('#lgBtn');
  if (!u.trim() || !p) { Cloud.showLogin('أدخل اسم المستخدم وكلمة المرور.'); return; }
  btn.disabled = true; btn.textContent = 'جارٍ الدخول…'; $('#lgErr').hidden = true;
  try { await Cloud.login(u, p); $('#lgPass').value = ''; }
  catch (err) { Cloud.showLogin(err.message); }
});
$('#lgEye').addEventListener('click', () => {
  const i = $('#lgPass'), show = i.type === 'password';
  i.type = show ? 'text' : 'password';
  $('#lgEye').setAttribute('aria-pressed', String(show));
  $('#lgEye').textContent = show ? 'إخفاء' : 'إظهار';
});

/* ---------- account menu ---------- */
ACT.account = () => {
  const m = Cloud.member;
  openModal('حسابي', `<form id="mForm" class="form">
    <dl class="dl full" style="margin:0">
      <dt>الاسم</dt><dd>${esc(m.display_name || m.username)}</dd>
      <dt>اسم المستخدم</dt><dd class="ltr" style="text-align:end">${esc(m.username)}</dd>
      <dt>الصلاحية</dt><dd>${m.role === 'admin' ? 'الطبيب (مدير العيادة)' : 'سكرتير / موظف'}</dd>
      <dt>العيادة</dt><dd>${esc(clinicName())}</dd>
      <dt>الاشتراك</dt><dd>${Cloud.subLine()}</dd>
    </dl>
    <div class="sec-h">تغيير كلمة المرور</div>
    <label>كلمة المرور الجديدة<input name="p1" type="password" minlength="8" autocomplete="new-password" placeholder="8 أحرف على الأقل"></label>
    <label>تأكيدها<input name="p2" type="password" minlength="8" autocomplete="new-password"></label>
    ${mfoot('حفظ كلمة المرور', '<button class="btn danger" type="button" data-act="logout">تسجيل الخروج</button>')}</form>`, {
    noFocus: true,
    submit: async d => {
      if (!d.p1) return formErr('اكتب كلمة المرور الجديدة، أو اختر «إلغاء».');
      if (d.p1.length < 8) return formErr('كلمة المرور 8 أحرف على الأقل.');
      if (d.p1 !== d.p2) return formErr('كلمتا المرور غير متطابقتين.');
      const { error } = await Cloud.sb.auth.updateUser({ password: d.p1 });
      if (error) return formErr(/different|same/i.test(error.message || '') ? 'كلمة المرور الجديدة مطابقة للقديمة.' : 'تعذّر تغيير كلمة المرور. تحقق من الاتصال.');
      toast('تغيّرت كلمة المرور'); return true;
    }
  });
};
ACT.skipMigration = () => { lsSet('migrated:' + Cloud.member.clinic_id, true); closeModal(); };
ACT.logout = () => confirmBox('تسجيل الخروج من هذا الجهاز؟ ستُمسح نسخة البيانات المحفوظة عليه، وتبقى محفوظة في حساب العيادة.', () => Cloud.logout(), 'تسجيل الخروج');
