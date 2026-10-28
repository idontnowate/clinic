'use strict';
/* ============================================================
   admin.js — أقسام الإعدادات (حسابي، المظهر، التطبيق) وصفحة «المستخدمون والأجهزة» للطبيب
   ============================================================ */
function settingsGroups() {
  const g = [];
  if (app.role === 'admin') g.push(['العيادة', [['clinic', 'الطبيب والعيادة'], ['hours', 'أوقات العمل'], ['services', 'الخدمات والأسعار'], ['meds', 'قائمة الأدوية'], ['messages', 'الرسائل والمستندات']]]);
  g.push(['حسابي وهذا الجهاز', [['account', 'حسابي'], ['appearance', 'المظهر'], ['app', 'التطبيق وبدون إنترنت']]]);
  if (app.role === 'admin') g.push(['البيانات', [['data', 'النسخ الاحتياطي والاستعادة']]]);
  return g;
}
const setCard = (title, sub, inner) => `<section class="set-card"><header class="set-head"><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</header>${inner}</section>`;
const fact = (l, v) => `<div class="fact">${l}<b>${v}</b></div>`;
function subLine() {
  if (app.mode === 'demo') return pill('neutral', 'تجريبي');
  const st = Auth.cachedSub(), r = st.row;
  if (!r) return pill('ok', 'فعّال');
  if (st.status === 'suspended') return pill('bad', 'موقوف');
  if (!r.expires_at) return pill('ok', r.plan || 'دائمي');
  const d = esc(fmtDate(r.expires_at));
  return st.status === 'active' ? `${pill('ok', 'فعّال')} حتى ${d}` : st.status === 'expiring' ? `${pill('warn', 'ينتهي قريبًا')} ${d}` : `${pill('bad', 'منتهٍ')} ${d}`;
}

const SETTINGS_PANES = {
  account() {
    const m = app.member || {};
    return setCard('حسابي', 'بيانات دخولك إلى العيادة.', `<div class="facts">
        ${fact('الاسم', esc(m.display_name || m.username))}
        ${fact('اسم المستخدم', `<span class="ltr">${esc(m.username)}</span>`)}
        ${fact('الصلاحية', Auth.roleLabel(m.role) + (m.role === 'admin' ? ' (مدير العيادة)' : ''))}
        ${fact('العيادة', esc(clinicName()))}
        ${fact('الاشتراك', subLine())}
      </div>`)
      + setCard('تغيير كلمة المرور', 'اختر كلمة مرور لا يعرفها غيرك، 8 أحرف على الأقل.', `<form data-form="password" class="form">
        <label class="full">كلمة المرور الحالية<input name="current" type="password" autocomplete="current-password" required dir="ltr"></label>
        <label>كلمة المرور الجديدة<input name="p1" type="password" minlength="8" autocomplete="new-password" required dir="ltr"></label>
        <label>تأكيدها<input name="p2" type="password" minlength="8" autocomplete="new-password" required dir="ltr"></label>
        <div id="pErr" class="err" hidden></div>
        <div class="m-foot"><button class="btn primary" type="submit">تغيير كلمة المرور</button></div></form>`)
      + setCard('الأمان', 'إذا نسيت الخروج من جهاز آخر، أو تشك أن أحدًا يستخدم حسابك.', `<div class="m-foot" style="padding:0">
        <button class="btn" type="button" data-act="signOutOthers">الخروج من كل الأجهزة الأخرى</button>
        <button class="btn danger" type="button" data-act="logout">تسجيل الخروج من هذا الجهاز</button></div>`);
  },
  appearance() {
    const p = ClinicTheme.get(), gs = ClinicTheme.glassSupport();
    const sw = (v, t) => `<label><input type="radio" name="theme" value="${v}" data-change="theme" ${p.theme === v ? 'checked' : ''}><span class="sw ${v}"><i></i><b></b></span>${t}</label>`;
    return setCard('المظهر', 'خاص بهذا الجهاز فقط، ويُحفظ تلقائيًا.', `<div class="theme-pick">${sw('light', 'الفاتح')}${sw('dark', 'الداكن')}${sw('glass', 'زجاج')}</div>
      ${p.theme === 'glass' && (!gs.blur || gs.weak) ? `<p class="note" style="margin:12px 0 0">${!gs.blur ? 'هذا المتصفح لا يدعم الضبابية، فيظهر الزجاج بطبقات معتمة.' : 'هذا الجهاز قد يكون بطيئًا مع الزجاج. إذا لاحظت بطئًا اختر «الداكن».'}</p>` : ''}
      <div style="margin-top:14px"><label class="set-toggle"><span><strong>الحركة والتأثيرات</strong><span class="note">انتقالات ناعمة وظهور تدريجي. أوقفها إذا كان الجهاز بطيئًا.</span></span><input type="checkbox" class="switch" data-change="motion" ${p.motion !== 'off' ? 'checked' : ''}></label></div>`);
  },
  app() {
    const st = window.ClinicApp ? ClinicApp.installState() : 'unavailable';
    const inst = st === 'installed' ? `<p style="margin:0">${pill('ok', 'مثبّت')} البرنامج مثبّت على هذا الجهاز كتطبيق.</p>`
      : st === 'ready' ? `<p style="margin:0 0 10px">ثبّت البرنامج ليفتح من أيقونة على سطح المكتب أو الشاشة الرئيسية، في نافذة خاصة به.</p><button class="btn primary" type="button" data-act="installApp">تثبيت البرنامج</button>`
        : st === 'ios' ? '<p style="margin:0">على الآيفون والآيباد: افتح البرنامج في Safari، ثم زر المشاركة ⬆︎، ثم «إضافة إلى الشاشة الرئيسية».</p>'
          : '<p style="margin:0">افتح البرنامج في Chrome أو Edge لتظهر إمكانية التثبيت كتطبيق.</p>';
    return setCard('تثبيت البرنامج', '', inst)
      + setCard('بدون إنترنت', '', `<p style="margin:0" class="muted">يحتفظ هذا الجهاز بنسخة من بيانات العيادة، فيفتح البرنامج بسرعة وتستطيع الاطلاع على المرضى والمواعيد عند انقطاع الإنترنت. <b>الحفظ يحتاج إنترنت</b>، وتصل التعديلات لبقية الأجهزة خلال ثوانٍ.</p>`)
      + setCard('الإصدار', '', `<div class="facts">${fact('رقم الإصدار', `<span class="ltr">${window.ClinicApp ? ClinicApp.build : '—'}</span>`)}</div><div class="m-foot" style="padding-top:12px"><button class="btn" type="button" data-act="checkUpdate">التحقق من وجود تحديث</button></div>`);
  }
};
PAGEFORMS.password = async d => {
  if (d.p1.length < 8) return formErr('كلمة المرور الجديدة 8 أحرف على الأقل.');
  if (d.p1 !== d.p2) return formErr('كلمتا المرور غير متطابقتين.');
  try { await Auth.changePassword(d.current, d.p1); }
  catch (e) { return formErr(e.message); }
  toast('تغيّرت كلمة المرور'); buildShell(); return false;
};
ACT.signOutOthers = () => confirmBox('تسجيل الخروج من كل الأجهزة الأخرى التي دخلت بحسابك؟ يبقى هذا الجهاز داخلًا.', async () => {
  try { await Auth.signOutOthers(); toast('خرج حسابك من الأجهزة الأخرى'); } catch (e) { toast(e.message); }
}, 'خروج من الأجهزة الأخرى');
CHG.theme = t => { ClinicTheme.set({ theme: t.value }); setTimeout(buildShell, 30); };
CHG.motion = t => ClinicTheme.set({ motion: t.checked ? 'on' : 'off' });
ACT.installApp = async () => { if (window.ClinicApp && await ClinicApp.install()) toast('ثُبّت البرنامج'); buildShell(); };
ACT.checkUpdate = async () => {
  if (!window.ClinicApp) return;
  const remote = await ClinicApp.checkVersion();
  if (remote == null) toast('تعذّر التحقق. تحقق من الاتصال.');
  else if (remote <= ClinicApp.build) toast('لديك أحدث إصدار');
};
window.addEventListener('appinstallable', () => { if (ui.route === 'settings' && ui.stab === 'app') buildShell(); });

/* ============================================================
   المستخدمون والأجهزة (للطبيب فقط)
   ============================================================ */
const TEAM = { members: null, devices: null, limit: 0, err: '', loading: false };
const ago = ts => {
  if (!ts) return 'لم يدخل بعد';
  const m = Math.round((Date.now() - Date.parse(ts)) / 60000);
  if (m < 5) return 'متصل الآن';
  if (m < 60) return `قبل ${m} دقيقة`;
  if (m < 1440) return `قبل ${Math.round(m / 60)} ساعة`;
  const d = Math.round(m / 1440);
  return d < 30 ? `قبل ${d} يوم` : fmtDate(isoDate(new Date(ts)));
};
function demoTeam() {
  const now = Date.now(), iso = n => new Date(now - n).toISOString();
  TEAM.members = [
    { user_id: 'demo', role: 'admin', username: 'demo', display_name: 'د. تجربة', last_sign_in_at: iso(60000) },
    { user_id: 'd2', role: 'staff', username: 'sara.reception', display_name: 'سارة (الاستقبال)', last_sign_in_at: iso(3 * 3600000) }
  ];
  TEAM.devices = [
    { id: 'x1', display_name: 'د. تجربة', username: 'demo', label: '', platform: 'ويندوز', browser: 'Chrome', model: '', last_seen: iso(60000), revoked: false, device_id: Auth.deviceId() },
    { id: 'x2', display_name: 'سارة (الاستقبال)', username: 'sara.reception', label: 'حاسبة الاستقبال', platform: 'ويندوز', browser: 'Edge', model: '', last_seen: iso(3 * 3600000), revoked: false },
    { id: 'x3', display_name: 'د. تجربة', username: 'demo', label: '', platform: 'أندرويد', browser: 'Chrome', model: 'SM-A546E', last_seen: iso(2 * 86400000), revoked: false }
  ];
  TEAM.limit = 3;
}
async function loadTeam() {
  if (app.mode === 'demo') { demoTeam(); renderBody(); return; }
  TEAM.loading = true; TEAM.err = '';
  try {
    const [t, dv, pl] = await Promise.all([
      Auth.team('list'),
      Auth.sb.from('clinic_devices').select('id, device_id, display_name, username, label, platform, browser, model, installed, first_seen, last_seen, revoked').eq('clinic_id', Cloud.clinicId).order('last_seen', { ascending: false }),
      Auth.sb.from('clinic_device_plans').select('device_limit').eq('clinic_id', Cloud.clinicId).maybeSingle()
    ]);
    TEAM.members = t.members;
    TEAM.devices = dv.error ? [] : dv.data;
    TEAM.limit = pl.data ? pl.data.device_limit : 0;
  } catch (e) { TEAM.err = e.message || 'تعذّر التحميل'; }
  TEAM.loading = false;
  if (ui.route === 'users') renderBody();
}
VIEWS.users = {
  shell() {
    return `<div class="head"><div class="grow"><h1>المستخدمون والأجهزة</h1><div class="sub">من يدخل إلى العيادة، ومن أي جهاز.</div></div>${W() ? '<button class="btn primary" data-act="addMember">+ حساب جديد</button>' : ''}</div><div id="vbody"></div>`;
  },
  mount() { if (!TEAM.members && !TEAM.loading) loadTeam(); },
  body() {
    if (TEAM.err) return `<div class="panel"><div class="empty"><b>تعذّر التحميل</b>${esc(TEAM.err)}<br><button class="btn" data-act="reloadTeam">إعادة المحاولة</button></div></div>`;
    if (!TEAM.members) return `<div class="loading">جارٍ التحميل…</div>`;
    const me = app.member.user_id;
    const people = TEAM.members.map(m => `<li><span class="avatar">${initial(m.display_name || m.username)}</span><div class="g"><b>${esc(m.display_name || m.username)}</b> ${pill(m.role === 'admin' ? 'info' : 'neutral', m.role === 'admin' ? 'طبيب / مدير' : 'سكرتير')}${m.user_id === me ? ' ' + pill('accent', 'أنت') : ''}${m.disabled ? ' ' + pill('bad', 'معطّل') : ''}<div class="s"><span class="ltr">${esc(m.username)}</span> · ${esc(ago(m.last_sign_in_at))}</div></div>
      ${m.user_id === me ? '' : `<div class="acts" style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm" data-act="memberPw" data-id="${m.user_id}">كلمة المرور</button><button class="btn sm" data-act="memberRole" data-id="${m.user_id}">${m.role === 'admin' ? 'جعله سكرتير' : 'جعله مديرًا'}</button><button class="btn sm" data-act="memberDis" data-id="${m.user_id}">${m.disabled ? 'تفعيل' : 'تعطيل'}</button><button class="btn sm ghost danger" data-act="memberDel" data-id="${m.user_id}">حذف</button></div>`}</li>`).join('');
    const month = Date.now() - 30 * 864e5;
    const active = TEAM.devices.filter(d => !d.revoked && Date.parse(d.last_seen) > month).length;
    const lim = TEAM.limit, here = Auth.deviceId();
    const devName = d => esc(d.label || [d.platform, d.browser].filter(Boolean).join(' · ') || 'جهاز');
    const rows = TEAM.devices.map(d => `<tr><td><b>${devName(d)}</b>${d.device_id === here ? ' ' + pill('accent', 'هذا الجهاز') : ''}<span class="rowsub">${esc([d.label ? d.platform + ' · ' + d.browser : '', d.model].filter(Boolean).join(' · '))}</span></td><td>${esc(d.display_name || d.username)}</td><td>${esc(ago(d.last_seen))}</td><td>${d.revoked ? pill('bad', 'موقوف') : Date.parse(d.last_seen) > month ? pill('ok', 'مسموح') : pill('neutral', 'غير مستخدم')}</td>
      <td><div class="acts"><button class="btn sm" data-act="devLabel" data-id="${d.id}">تسمية</button>${d.device_id === here ? '' : `<button class="btn sm ${d.revoked ? '' : 'ghost danger'}" data-act="devRevoke" data-id="${d.id}">${d.revoked ? 'السماح' : 'إيقاف'}</button>`}</div></td></tr>`).join('');
    return `<div class="stack">
      <section class="panel"><div class="ph"><h3>الحسابات</h3><span class="muted">${TEAM.members.length} حساب</span></div><div class="pb"><ul class="people">${people}</ul>
        <p class="muted" style="font-size:.85rem;margin:10px 0 0">السكرتير يحجز المواعيد ويسجّل المرضى والفواتير، ولا يرى التقارير ولا يعدّل إعدادات العيادة.</p></div></section>
      <section class="panel"><div class="ph"><h3>الأجهزة</h3><span class="muted">${lim ? `${active} من ${lim} جهاز` : `${active} جهاز نشط · بلا حد`}</span></div>
        ${lim ? `<div class="pb" style="padding-bottom:0"><div class="meter ${active >= lim ? 'full' : ''}"><i style="width:${Math.min(100, active / lim * 100)}%"></i></div><p class="muted" style="font-size:.84rem;margin:8px 0 0">${active >= lim ? 'وصلت العيادة للحد: لن يدخل السكرتير من جهاز جديد حتى توقف جهازًا لا يُستخدم، أو تطلب زيادة الحد.' : 'الجهاز الذي لم يُستخدم 30 يومًا والجهاز الموقوف لا يُحسبان.'}</p></div>` : ''}
        ${TEAM.devices.length ? `<div class="tbl"><table><thead><tr><th>الجهاز</th><th>آخر مستخدم</th><th>آخر نشاط</th><th>الحالة</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty">لم يُسجَّل أي جهاز بعد.</div>'}</section></div>`;
  }
};
ACT.reloadTeam = () => { TEAM.members = null; loadTeam(); renderBody(); };
const demoBlock = () => { if (app.mode === 'demo') { toast('غير متاح في النسخة التجريبية'); return true; } return false; };
const genPass = () => { const c = 'abcdefghjkmnpqrstuvwxyz23456789'; let s = ''; const a = new Uint32Array(10); crypto.getRandomValues(a); a.forEach(n => s += c[n % c.length]); return s; };
ACT.genPass = (id, b) => { const i = b.closest('form').querySelector('[name=password]'); i.value = genPass(); i.type = 'text'; i.select(); };
const teamDo = async (action, body, ok) => { await Auth.team(action, body); toast(ok); await loadTeam(); return true; };
ACT.addMember = () => {
  if (demoBlock()) return;
  openModal('حساب جديد', `<form id="mForm" class="form">
    <label class="full">الاسم الظاهر *<input name="name" required placeholder="سارة (الاستقبال)"></label>
    <label>اسم المستخدم (إنجليزي) *<input name="username" required dir="ltr" autocomplete="off" pattern="[a-zA-Z0-9._\\-]{3,30}" placeholder="sara"></label>
    <label>كلمة المرور *<input name="password" required minlength="8" dir="ltr" autocomplete="new-password"></label>
    <label>الصلاحية<select name="role"><option value="staff">سكرتير</option><option value="admin">طبيب / مدير</option></select></label>
    <div class="hint">يدخل بهذا الاسم وكلمة المرور من صفحة الدخول، ويستطيع تغيير كلمة المرور من «حسابي».</div>
    ${mfoot('إضافة الحساب', '<button class="btn" type="button" data-act="genPass">توليد كلمة مرور</button>')}</form>`, {
    submit: async d => { try { return await teamDo('add_member', d, 'أُضيف الحساب'); } catch (e) { return formErr(e.message); } }
  });
};
const memberOf = id => TEAM.members.find(m => m.user_id === id);
ACT.memberPw = id => {
  if (demoBlock()) return;
  const m = memberOf(id);
  openModal('كلمة مرور جديدة', `<form id="mForm" class="form"><p class="full" style="margin:0">لحساب <b>${esc(m.display_name)}</b> (<span class="ltr">${esc(m.username)}</span>).</p>
    <label class="full">كلمة المرور الجديدة<input name="password" required minlength="8" dir="ltr" autocomplete="new-password"></label>
    ${mfoot('حفظ', '<button class="btn" type="button" data-act="genPass">توليد</button>')}</form>`, {
    submit: async d => { try { return await teamDo('reset_password', { userId: id, password: d.password }, 'تغيّرت كلمة المرور'); } catch (e) { return formErr(e.message); } }
  });
};
ACT.memberRole = id => {
  if (demoBlock()) return;
  const m = memberOf(id), to = m.role === 'admin' ? 'staff' : 'admin';
  confirmBox(`جعل ${esc(m.display_name)} ${to === 'admin' ? 'طبيبًا (مدير العيادة) يرى كل شيء ويدير الحسابات' : 'سكرتيرًا'}؟`, async () => { try { await teamDo('set_role', { userId: id, role: to }, 'تغيّرت الصلاحية'); } catch (e) { toast(e.message); } }, 'تأكيد');
};
ACT.memberDis = id => {
  if (demoBlock()) return;
  const m = memberOf(id);
  confirmBox(m.disabled ? `تفعيل حساب ${esc(m.display_name)}؟` : `تعطيل حساب ${esc(m.display_name)}؟ لن يستطيع الدخول حتى تفعّله.`, async () => { try { await teamDo('set_disabled', { userId: id, disabled: !m.disabled }, m.disabled ? 'فُعّل الحساب' : 'عُطّل الحساب'); } catch (e) { toast(e.message); } }, m.disabled ? 'تفعيل' : 'تعطيل');
};
ACT.memberDel = id => {
  if (demoBlock()) return;
  const m = memberOf(id);
  confirmBox(`حذف حساب ${esc(m.display_name)} نهائيًا؟ تبقى بيانات العيادة كما هي.`, async () => { try { await teamDo('delete_member', { userId: id }, 'حُذف الحساب'); } catch (e) { toast(e.message); } });
};
const devOf = id => TEAM.devices.find(d => d.id === id);
ACT.devLabel = id => {
  const d = devOf(id);
  openModal('اسم الجهاز', `<form id="mForm" class="form"><label class="full">اسم يميّز الجهاز<input name="label" value="${esc(d.label)}" placeholder="حاسبة الاستقبال" maxlength="40"></label>${mfoot()}</form>`, {
    submit: async v => {
      if (app.mode === 'demo') { d.label = v.label.trim(); renderBody(); return true; }
      const { error } = await Auth.sb.from('clinic_devices').update({ label: v.label.trim().slice(0, 40) }).eq('id', id);
      if (error) return formErr('تعذّر الحفظ');
      d.label = v.label.trim(); renderBody(); return true;
    }
  });
};
ACT.devRevoke = id => {
  const d = devOf(id), stop = !d.revoked;
  confirmBox(stop ? 'إيقاف هذا الجهاز؟ يخرج من البرنامج خلال دقيقتين ولا يستطيع الدخول حتى تسمح له.' : 'السماح لهذا الجهاز بالدخول مرة أخرى؟', async () => {
    if (app.mode !== 'demo') {
      const { error } = await Auth.sb.from('clinic_devices').update({ revoked: stop, revoked_at: stop ? new Date().toISOString() : null }).eq('id', id);
      if (error) { toast('تعذّر الحفظ'); return; }
    }
    d.revoked = stop; renderBody(); toast(stop ? 'أُوقف الجهاز' : 'سُمح للجهاز');
  }, stop ? 'إيقاف الجهاز' : 'السماح');
};
