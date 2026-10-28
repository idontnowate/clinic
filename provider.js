'use strict';
/* provider.js — لوحة مزود العيادات: الاشتراكات، الحسابات، الأجهزة، النسخ، الحذف (الدالة clinic-admin) */
(function () {
  const FN = CLOUD.url + '/functions/v1/clinic-admin';
  const LIFETIME = 'دائمي';
  const PLANS = ['شهري', 'كل 3 أشهر', 'كل 6 أشهر', 'سنوي', LIFETIME];
  const PLAN_MONTHS = { 'شهري': 1, 'كل 3 أشهر': 3, 'كل 6 أشهر': 6, 'سنوي': 12 };
  const STATUS = { active: ['ok', 'فعّال'], none: ['neutral', 'بلا اشتراك'], expiring: ['warn', 'ينتهي قريبًا'], grace: ['bad', 'في المهلة'], expired: ['bad', 'منتهٍ'], suspended: ['bad', 'موقوف'] };
  const sb = window.supabase.createClient(CLOUD.url, CLOUD.key, { auth: { persistSession: true, storageKey: 'clinic-provider-auth' } });
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NF = new Intl.NumberFormat('ar-IQ-u-nu-latn');
  const DTF = new Intl.DateTimeFormat('ar-IQ-u-nu-latn', { day: 'numeric', month: 'short', year: 'numeric' });
  const fmtD = s => s ? DTF.format(new Date(s.length === 10 ? s + 'T12:00:00' : s)) : '—';
  const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  function addMonths(iso, n) { const d = new Date(iso + 'T12:00:00'); const day = d.getDate(); d.setMonth(d.getMonth() + n); if (d.getDate() < day) d.setDate(0); return todayLike(d); }
  const todayLike = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const pill = (cls, t) => `<span class="pill p-${cls}">${esc(t)}</span>`;
  const ago = ts => {
    if (!ts) return '—';
    const m = Math.round((Date.now() - Date.parse(ts)) / 60000);
    if (m < 5) return 'متصل الآن'; if (m < 60) return `قبل ${m} دقيقة`; if (m < 1440) return `قبل ${Math.round(m / 60)} ساعة`;
    const d = Math.round(m / 1440); return d < 30 ? `قبل ${d} يوم` : fmtD(ts);
  };
  const genPass = () => { const c = 'abcdefghjkmnpqrstuvwxyz23456789'; const a = new Uint32Array(10); crypto.getRandomValues(a); return [...a].map(n => c[n % c.length]).join(''); };
  let DATA = [], filter = 'all', current = null;

  let flashT;
  // يظهر فوق النافذة المفتوحة إن وُجدت (النوافذ في طبقة أعلى من الصفحة)
  function flash(m) { const f = $('#flash'); (document.querySelector('dialog[open]') || document.body).appendChild(f); f.textContent = m; f.hidden = false; clearTimeout(flashT); flashT = setTimeout(() => f.hidden = true, 3200); }

  async function call(action, body = {}) {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { const e = new Error('يجب تسجيل الدخول'); e.status = 401; throw e; }
    let r;
    try {
      r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token, apikey: CLOUD.key }, body: JSON.stringify({ action, ...body }) });
    } catch (e) { throw new Error('تعذّر الاتصال بالخادم. تأكد أن الدالة clinic-admin منشورة.'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || 'خطأ ' + r.status); e.status = r.status; throw e; }
    return j;
  }
  // زر يتعطل حتى تنتهي العملية، والخطأ يظهر في مكانه
  async function busy(btn, msgEl, fn) {
    if (btn) btn.disabled = true; if (msgEl) msgEl.textContent = '';
    try { return await fn(); }
    catch (e) { if (msgEl) msgEl.textContent = e.message; else flash(e.message); }
    finally { if (btn) btn.disabled = false; }
  }

  /* ---------- الدخول ---------- */
  async function start() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return showLogin();
    try {
      await load();
      $('#whoami').textContent = session.user.email;
      $('#loginView').hidden = true; $('#panel').hidden = false;
    } catch (e) {
      if (e.status === 401 || e.status === 403) { await sb.auth.signOut(); showLogin(e.status === 403 ? 'هذا الحساب ليس حساب مزود.' : 'انتهت الجلسة، سجّل الدخول من جديد.'); }
      else { $('#panel').hidden = false; $('#loginView').hidden = true; $('#rows').innerHTML = `<tr class="empty-row"><td colspan="9"><b>تعذّر التحميل</b><br>${esc(e.message)}</td></tr>`; }
    }
  }
  function showLogin(msg) { $('#panel').hidden = true; $('#loginView').hidden = false; $('#loginMsg').textContent = msg || ''; }
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    await busy($('#loginBtn'), $('#loginMsg'), async () => {
      const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
      if (error) throw new Error('البريد أو كلمة المرور غير صحيحة');
      f.password.value = '';
      await start();
    });
  });
  $('#signOutBtn').onclick = async () => { await sb.auth.signOut(); location.reload(); };
  $('#refreshBtn').onclick = e => busy(e.target, null, async () => { await load(); flash('تم التحديث'); });

  /* ---------- القائمة ---------- */
  async function load() { DATA = (await call('overview')).clinics; render(); if (current) current = DATA.find(c => c.clinic_id === current.clinic_id) || null; }
  const group = c => ['expiring', 'grace'].includes(c.status) ? 'soon' : ['expired', 'suspended'].includes(c.status) ? 'stopped' : 'active';
  function render() {
    const n = g => DATA.filter(c => group(c) === g).length;
    $('#sumAll').textContent = NF.format(DATA.length); $('#sumActive').textContent = NF.format(n('active'));
    $('#sumSoon').textContent = NF.format(n('soon')); $('#sumStopped').textContent = NF.format(n('stopped'));
    const q = $('#search').value.trim().toLowerCase();
    const list = DATA.filter(c => filter === 'all' || group(c) === filter)
      .filter(c => !q || [c.name, c.subscription?.owner_phone, ...c.members.map(m => m.username + ' ' + m.display_name)].join(' ').toLowerCase().includes(q));
    if (!DATA.length) { $('#rows').innerHTML = '<tr class="empty-row"><td colspan="9"><b>لا عيادات بعد</b><br>أضف أول نسخة مبيعة من «+ عيادة جديدة».</td></tr>'; return; }
    if (!list.length) { $('#rows').innerHTML = '<tr class="empty-row"><td colspan="9">لا نتائج.</td></tr>'; return; }
    $('#rows').innerHTML = list.map(c => {
      const s = c.subscription || {}, [cls, lbl] = STATUS[c.status] || STATUS.none, admin = c.members.find(m => m.role === 'admin');
      const left = s.plan === LIFETIME ? 'دائمي' : c.daysLeft == null ? '' : c.daysLeft >= 0 ? `باقي ${c.daysLeft} يوم` : `منذ ${-c.daysLeft} يوم`;
      return `<tr><td><b>${esc(c.name || 'بلا اسم')}</b><small class="ltr" style="text-align:start">${esc(s.owner_phone || '')}</small></td>
        <td>${admin ? `${esc(admin.display_name)}<small class="ltr" style="text-align:start">${esc(admin.username)}</small>` : '<span class="muted">—</span>'}</td>
        <td>${esc(s.plan || '—')}<small>${s.price ? NF.format(s.price) + ' د.ع' : ''}</small></td>
        <td>${s.plan === LIFETIME ? '—' : fmtD(s.expires_at)}<small>${left}</small></td>
        <td>${pill(cls, lbl)}</td>
        <td>${NF.format(c.patients || 0)}</td>
        <td>${c.device_limit ? `${c.devices_active} / ${c.device_limit}` : NF.format(c.devices_active || 0)}</td>
        <td>${c.last_activity ? ago(c.last_activity) : '<span class="muted">لم تُستخدم</span>'}</td>
        <td><div class="acts"><button class="btn sm primary" data-open="${c.clinic_id}">إدارة</button>${s.plan !== LIFETIME ? `<button class="btn sm" data-quick="${c.clinic_id}">+ شهر</button>` : ''}</div></td></tr>`;
    }).join('');
  }
  $('#search').addEventListener('input', render);
  document.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => {
    filter = b.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    render();
  }));
  $('#rows').addEventListener('click', e => {
    const o = e.target.closest('[data-open]'), q = e.target.closest('[data-quick]');
    if (o) openClinic(DATA.find(c => c.clinic_id === o.dataset.open));
    if (q) busy(q, null, async () => { const c = DATA.find(x => x.clinic_id === q.dataset.quick); const r = await call('extend', { clinicId: c.clinic_id, months: 1 }); await load(); flash(`جُدّد اشتراك ${c.name} حتى ${fmtD(r.expires_at)}`); });
  });

  /* ---------- النوافذ ---------- */
  document.querySelectorAll('dialog [data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));
  document.querySelectorAll('select[name=plan]').forEach(s => { s.innerHTML = PLANS.map(p => `<option>${p}</option>`).join(''); });
  function syncPlan(form, auto) {
    const plan = form.elements.plan, exp = form.elements.expiresAt;
    form.querySelector('[data-exp]').hidden = plan.value === LIFETIME;
    if (auto && PLAN_MONTHS[plan.value]) exp.value = addMonths(todayISO(), PLAN_MONTHS[plan.value]);
  }
  document.addEventListener('click', e => {
    const g = e.target.closest('[data-generate]');
    if (!g) return;
    const f = document.getElementById(g.dataset.generate), i = f.elements[g.dataset.field || 'password'];
    i.value = genPass(); i.select();
  });

  /* ---------- إدارة عيادة ---------- */
  function openClinic(c) {
    current = c;
    fillClinic();
    loadDevices();
    $('#clinicDialog').showModal();
  }
  function fillClinic() {
    const c = current, s = c.subscription || {}, f = $('#subForm');
    $('#cdTitle').textContent = c.name || 'عيادة';
    $('#cdSub').innerHTML = `${pill(...(STATUS[c.status] || STATUS.none))} ${c.members.length} حساب · ${NF.format(c.patients || 0)} مريض`;
    f.clinicName.value = c.name || ''; f.ownerPhone.value = s.owner_phone || ''; f.plan.value = s.plan || 'شهري';
    f.price.value = s.price ?? ''; f.expiresAt.value = s.expires_at || ''; f.notes.value = s.notes || ''; f.suspended.checked = !!s.suspended;
    syncPlan(f, false);
    $('#extendRow').hidden = s.plan === LIFETIME;
    $('#devForm').limit.value = c.device_limit || 0;
    const me = m => `<div class="member"><div><b>${esc(m.display_name || m.username)}</b> ${pill(m.role === 'admin' ? 'info' : 'neutral', m.role === 'admin' ? 'طبيب / مدير' : 'سكرتير')}${m.disabled ? ' ' + pill('bad', 'معطّل') : ''}<small><span class="ltr">${esc(m.username)}</span> · ${m.last_sign_in_at ? 'آخر دخول ' + ago(m.last_sign_in_at) : 'لم يدخل بعد'}</small></div>
      <div class="row"><button class="btn sm" data-m="pw" data-u="${m.user_id}">كلمة المرور</button><button class="btn sm" data-m="role" data-u="${m.user_id}">${m.role === 'admin' ? 'جعله سكرتير' : 'جعله مديرًا'}</button><button class="btn sm" data-m="dis" data-u="${m.user_id}">${m.disabled ? 'تفعيل' : 'تعطيل'}</button><button class="btn sm danger" data-m="del" data-u="${m.user_id}">حذف</button></div></div>`;
    $('#members').innerHTML = c.members.length ? c.members.map(me).join('') : '<p class="hint-t">لا حسابات.</p>';
    $('#cdId').textContent = c.clinic_id;
    $('#cdActivity').textContent = c.last_activity ? ago(c.last_activity) : 'لم تُستخدم';
    $('#cdRows').textContent = NF.format(c.rows_count || 0);
    $('#cdSince').textContent = fmtD(s.starts_at || c.created_at);
  }
  async function loadDevices() {
    $('#devRows').innerHTML = '<tr class="empty-row"><td colspan="4">جارٍ التحميل…</td></tr>';
    try {
      const { devices } = await call('devices', { clinicId: current.clinic_id });
      const month = Date.now() - 30 * 864e5;
      $('#devRows').innerHTML = devices.length ? devices.map(d => `<tr><td><b>${esc(d.label || [d.platform, d.browser].filter(Boolean).join(' · '))}</b><small>${esc([d.label ? d.platform + ' · ' + d.browser : '', d.model, d.installed ? 'مثبّت كتطبيق' : ''].filter(Boolean).join(' · '))}</small></td><td>${esc(d.display_name || d.username)}</td><td>${ago(d.last_seen)}</td><td>${d.revoked ? pill('bad', 'موقوف') : Date.parse(d.last_seen) > month ? pill('ok', 'نشط') : pill('neutral', 'غير مستخدم')}</td></tr>`).join('')
        : '<tr class="empty-row"><td colspan="4">لم يدخل أي جهاز بعد.</td></tr>';
    } catch (e) { $('#devRows').innerHTML = `<tr class="empty-row"><td colspan="4">${esc(e.message)}</td></tr>`; }
  }
  const refresh = async msg => { await load(); if (current) fillClinic(); if (msg) flash(msg); };
  $('#subForm').plan.addEventListener('change', () => syncPlan($('#subForm'), !$('#subForm').expiresAt.value));
  $('#subForm').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    busy(f.querySelector('[type=submit]'), $('#subMsg'), async () => {
      await call('update_subscription', { clinicId: current.clinic_id, clinicName: f.clinicName.value, ownerPhone: f.ownerPhone.value, plan: f.plan.value, price: f.price.value, expiresAt: f.expiresAt.value, notes: f.notes.value, suspended: f.suspended.checked });
      await refresh('حُفظ الاشتراك');
    });
  });
  $('#extendRow').addEventListener('click', e => {
    const b = e.target.closest('[data-extend]'); if (!b) return;
    busy(b, $('#subMsg'), async () => { const r = await call('extend', { clinicId: current.clinic_id, months: +b.dataset.extend }); await refresh('جُدّد حتى ' + fmtD(r.expires_at)); });
  });
  $('#devForm').addEventListener('click', e => {
    const b = e.target.closest('[data-dev-add]'); if (!b) return;
    const i = $('#devForm').limit; i.value = (+i.value || 0) + +b.dataset.devAdd;
  });
  $('#devForm').addEventListener('submit', e => {
    e.preventDefault();
    busy(e.target.querySelector('[type=submit]'), $('#devMsg'), async () => { await call('set_device_limit', { clinicId: current.clinic_id, limit: +e.target.limit.value || 0 }); await refresh('حُفظ حد الأجهزة'); });
  });
  $('#members').addEventListener('click', e => {
    const b = e.target.closest('[data-m]'); if (!b) return;
    const m = current.members.find(x => x.user_id === b.dataset.u);
    if (b.dataset.m === 'pw') { pwUser = m; $('#pwSub').textContent = `لحساب ${m.display_name} (${m.username})`; $('#pwForm').password.value = ''; $('#pwMsg').textContent = ''; $('#pwDialog').showModal(); return; }
    if (b.dataset.m === 'del' && !confirm(`حذف حساب ${m.username} نهائيًا؟ تبقى بيانات العيادة كما هي.`)) return;
    busy(b, $('#memberMsg'), async () => {
      if (b.dataset.m === 'role') await call('set_role', { userId: m.user_id, role: m.role === 'admin' ? 'staff' : 'admin' });
      if (b.dataset.m === 'dis') await call('set_disabled', { userId: m.user_id, disabled: !m.disabled });
      if (b.dataset.m === 'del') await call('delete_member', { userId: m.user_id });
      await refresh('تم');
    });
  });
  $('#addMemberForm').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    busy(f.querySelector('[type=submit]'), $('#memberMsg'), async () => {
      await call('add_member', { clinicId: current.clinic_id, name: f.name.value, username: f.username.value, password: f.password.value, role: f.role.value });
      f.reset(); await refresh('أُضيف الحساب');
    });
  });
  let pwUser = null;
  $('#pwForm').addEventListener('submit', e => {
    e.preventDefault();
    busy(e.target.querySelector('[type=submit]'), $('#pwMsg'), async () => { await call('reset_password', { userId: pwUser.user_id, password: e.target.password.value }); $('#pwDialog').close(); flash('تغيّرت كلمة المرور'); });
  });
  $('#exportBtn').addEventListener('click', e => busy(e.target, null, async () => {
    const data = await call('export_clinic', { clinicId: current.clinic_id });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
    a.download = `نسخة-${(current.name || 'عيادة').replace(/[\\/:*?"<>|]/g, '')}-${todayISO()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
  }));
  $('#deleteForm').addEventListener('submit', e => {
    e.preventDefault();
    busy(e.target.querySelector('[type=submit]'), null, async () => {
      await call('delete_clinic', { clinicId: current.clinic_id, confirm: e.target.confirm.value.trim() });
      e.target.reset(); $('#clinicDialog').close(); current = null; await load(); flash('حُذفت العيادة');
    });
  });

  /* ---------- عيادة جديدة ---------- */
  $('#newBtn').onclick = () => { const f = $('#newForm'); f.reset(); f.plan.value = 'شهري'; syncPlan(f, true); $('#newMsg').textContent = ''; $('#newDialog').showModal(); };
  $('#newForm').plan.addEventListener('change', () => syncPlan($('#newForm'), true));
  $('#newForm').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target, v = Object.fromEntries(new FormData(f));
    busy(f.querySelector('[type=submit]'), $('#newMsg'), async () => {
      v.adminName = v.doctorName ? 'د. ' + v.doctorName.replace(/^د\.\s*/, '') : v.clinicName;
      const r = await call('create_clinic', v);
      if (+v.deviceLimit > 0) await call('set_device_limit', { clinicId: r.clinic_id, limit: +v.deviceLimit }).catch(() => { });
      $('#newDialog').close();
      await load();
      showDone(v);
    });
  });
  function showDone(v) {
    const link = new URL('index.html', location.href).href;
    const text = `أهلاً ${v.adminName}،\nهذه بيانات دخول برنامج إدارة العيادة:\nالرابط: ${link}\nاسم المستخدم: ${v.adminUsername.toLowerCase()}\nكلمة المرور: ${v.adminPassword}\nتستطيع تغيير كلمة المرور من «الإعدادات ← حسابي».`;
    $('#doneBody').innerHTML = `<div class="pw-out" style="white-space:pre-line;text-align:start;font-size:.95rem;letter-spacing:0;font-weight:500">${esc(text)}</div>`;
    $('#copyDone').onclick = async () => { try { await navigator.clipboard.writeText(text); flash('نُسخت الرسالة'); } catch (e) { flash('تعذّر النسخ'); } };
    const phone = String(v.ownerPhone || '').replace(/\D/g, '').replace(/^0/, '964');
    $('#waDone').href = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(text);
    $('#waDone').hidden = !phone;
    $('#doneDialog').showModal();
  }

  ClinicTheme.floatPicker();
  start();
})();
