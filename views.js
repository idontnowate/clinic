'use strict';
/* ============================================================
   views.js — today, calendar, patient list, patient & appointment forms
   ============================================================ */

const pill = (cls, t) => `<span class="pill p-${cls}">${esc(t)}</span>`;
const stPill = s => pill(s, STATUS[s] || s);
const emptyBox = (title, hint, act, label, id = '') => `<div class="empty"><b>${title}</b>${hint || ''}${act && W() ? `<br><button class="btn primary" data-act="${act}" data-id="${esc(id)}">${label}</button>` : ''}</div>`;
const allergyTag = p => p && p.allergies ? `<span class="tag-allergy" data-tip="حساسية: ${esc(p.allergies)}">⚠ حساسية</span>` : '';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'صباح الخير' : 'مساء الخير';
}
function waitMins(a) { return a.arrivedAt ? Math.max(0, Math.round((Date.now() - a.arrivedAt) / 60000)) : 0; }

/* ================= TODAY ================= */
VIEWS.home = {
  shell: () => `<div class="head"><div class="grow"><h1>${greeting()}${S.doctorName ? '، ' + esc(docName()) : ''}</h1><div class="sub">${esc(fmtDayFull(today()))}${isWorkDay(today()) ? ` · الدوام ${esc(fmtTime(S.start))} – ${esc(fmtTime(S.end))}` : ' · ليس يوم عمل في الجدول'}</div></div>
    <button class="btn ghost" data-act="tv" data-tip="اعرضها على تلفزيون صالة الانتظار">${icon('<rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>')}شاشة الانتظار</button>
    <button class="btn ghost" data-act="cashClose">${icon('<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M3 11h18M7 15h3"/>')}كشف الصندوق</button>
    ${W() ? `<button class="btn" data-act="walkIn">${icon('<path d="M12 5v14M5 12h14"/>')}مريض حضر بدون موعد</button>` : ''}</div><div id="vbody"></div>`,
  body() {
    const t = today();
    const ap = D.appointments.filter(a => a.date === t).sort(byTime);
    const act = ap.filter(a => !['cancelled', 'noshow'].includes(a.status));
    const c = s => act.filter(a => a.status === s).length;
    const waiting = act.filter(a => a.status === 'waiting');
    const longest = waiting.length ? Math.max(...waiting.map(waitMins)) : 0;
    const paidToday = sum(D.invoices, i => sum((i.payments || []).filter(p => p.date === t), p => p.amount));
    const visitsToday = D.visits.filter(v => v.date === t).length;
    const remaining = c('booked') + c('confirmed');
    let h = '';
    h += setupCard();
    h += `<div class="kpis">
      <div class="kpi"><div class="l">مواعيد اليوم</div><div class="v">${act.length}</div><div class="h">${remaining} لم يصلوا بعد</div></div>
      <div class="kpi ${waiting.length ? 'hl' : ''}"><div class="l">في صالة الانتظار</div><div class="v">${waiting.length}</div><div class="h">${waiting.length ? `أطول انتظار ${longest} دقيقة` : 'لا أحد ينتظر'}</div></div>
      <div class="kpi"><div class="l">كشوفات اليوم</div><div class="v">${visitsToday}</div><div class="h">${c('in') ? 'مريض في غرفة الكشف الآن' : '&nbsp;'}</div></div>
      <div class="kpi"><div class="l">المحصَّل اليوم</div><div class="v">${num(paidToday)} <small>${esc(S.currency)}</small></div><div class="h">من ${D.invoices.filter(i => i.date === t).length} فاتورة</div></div>
    </div>`;
    h += `<div class="split"><div class="stack">`;
    h += `<section class="panel"><div class="ph"><h3>طابور اليوم</h3><span class="muted">${ap.length} موعد${ap.length - act.length ? ` · ${ap.length - act.length} ملغى/غائب` : ''}</span></div>
      ${ap.length ? `<ul class="q">${ap.map(qRow).join('')}</ul>` : emptyBox('لا مواعيد اليوم', '<br>احجز موعدًا أو سجّل مريضًا حضر بدون موعد.', 'newAppt', 'حجز موعد')}</section>`;
    const recent = [...D.visits].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 6);
    h += `<section class="panel"><div class="ph"><h3>آخر الكشوفات</h3></div>${recent.length ? `<ul class="list">${recent.map(v => `<li><div class="grow"><button class="link" data-act="openPatient" data-id="${v.patientId}">${esc(pName(v.patientId))}</button><div class="s">${esc((v.diagnoses || []).join('، ') || v.complaint || 'بدون تشخيص')}</div></div><span class="muted" style="font-size:.82rem">${esc(fmtShort(v.date))}</span></li>`).join('')}</ul>` : `<div class="empty">ستظهر هنا آخر الكشوفات المسجلة.</div>`}</section>`;
    h += `</div><div class="stack">`;
    // quick booking
    const fs = freeSlots(t, true).slice(0, 8);
    const nx = fs.length ? null : nextFreeSlot(addDays(t, 1));
    h += `<section class="panel"><div class="ph"><h3>مواعيد متاحة اليوم</h3>${W() ? `<button class="btn sm ghost" data-act="nav" data-id="calendar">الجدول</button>` : ''}</div><div class="pb">
      ${fs.length ? `<div class="slots">${fs.map(s => `<button class="slot" data-act="bookSlot" data-id="${t}|${s.time}">${esc(fmtTime(s.time))}</button>`).join('')}</div>`
        : `<div class="muted" style="font-size:.9rem">${isWorkDay(t) ? 'لا مواعيد متاحة متبقية اليوم.' : 'اليوم ليس من أيام العمل.'}${nx ? `<br>أقرب موعد متاح: <button class="link" data-act="bookSlot" data-id="${nx.date}|${nx.time}">${esc(fmtDayFull(nx.date))} ${esc(fmtTime(nx.time))}</button>` : ''}</div>`}
    </div></section>`;
    h += alertsPanel();
    const tm = addDays(t, 1);
    const tmA = D.appointments.filter(a => a.date === tm && OPEN_STATUSES.includes(a.status));
    h += `<section class="panel"><div class="ph"><h3>مواعيد الغد</h3><span class="muted">${tmA.length}</span></div><div class="pb" style="font-size:.9rem">${tmA.length ? `${tmA.filter(a => a.status === 'confirmed').length} مؤكَّد من ${tmA.length}. <button class="link" data-act="calDay" data-id="${tm}">أرسل التذكيرات</button>` : '<span class="muted">لا مواعيد محجوزة للغد.</span>'}</div></section>`;
    h += `</div></div>`;
    return h;
  }
};

function setupCard() {
  if (!W() || app.role !== 'admin') return '';
  const steps = [
    ['بيانات الطبيب والعيادة', !!S.doctorName, 'settings', 'إدخال البيانات'],
    ['أيام وساعات العمل', !!S.hoursSet, 'hours', 'ضبط الدوام'],
    ['الخدمات والأسعار', D.services.length > 0, 'services', 'إضافة الخدمات'],
    ['تسجيل أول مريض', D.patients.length > 0, 'newPatient', 'مريض جديد']
  ];
  steps[0][2] = 'clinic';
  if (steps.every(s => s[1]) || lsGet('setupHidden')) return '';
  return `<div class="setup"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><h2>جهّز العيادة في دقائق</h2><div class="muted" style="font-size:.9rem">تظهر بياناتك في الوصفات والتقارير والإيصالات، وتحدد ساعات العمل فترات الحجز.</div></div><button class="btn sm ghost" data-act="hideSetup">إخفاء</button></div>
  <ol>${steps.map((s, i) => `<li class="${s[1] ? 'done' : ''}"><span class="step">الخطوة ${i + 1}${s[1] ? ' ✓' : ''}</span><b>${s[0]}</b>${s[1] ? '' : `<button class="btn sm primary" data-act="${s[2] === 'newPatient' ? 'newPatient' : 'goSettings'}" data-id="${s[2] === 'newPatient' ? '' : s[2]}">${s[3]}</button>`}</li>`).join('')}</ol></div>`;
}
ACT.goSettings = tab => { ui.stab = tab; nav('settings'); };
ACT.hideSetup = () => { lsSet('setupHidden', true); renderBody(); };

function alertsPanel() {
  const t = today(), rows = [];
  const unpaid = D.invoices.map(i => ({ i, c: invCalc(i) })).filter(x => x.c.due > 0);
  if (unpaid.length) rows.push(['bad', `${unpaid.length} فاتورة عليها مبالغ مستحقة بإجمالي ${moneyT(sum(unpaid, x => x.c.due))}`, 'finance', 'عرض']);
  const low = D.inventory.filter(x => (+x.qty || 0) <= (+x.min || 0));
  if (low.length) rows.push(['warn', `${low.length} صنف في المخزون وصل للحد الأدنى: ${low.slice(0, 3).map(x => x.name).join('، ')}${low.length > 3 ? '…' : ''}`, 'inventory', 'المخزون']);
  const exp = D.inventory.filter(x => x.expiry && daysBetween(t, x.expiry) <= 60);
  if (exp.length) rows.push(['warn', `${exp.length} صنف ينتهي خلال 60 يومًا أو انتهى`, 'inventory', 'المخزون']);
  const pendingLabs = [];
  D.visits.forEach(v => (v.labs || []).forEach(l => { if (!l.result && daysBetween(v.date, t) >= 3) pendingLabs.push({ v, l }); }));
  if (pendingLabs.length) rows.push(['info', `${pendingLabs.length} تحليل/أشعة مطلوب منذ 3 أيام أو أكثر ولم تُسجَّل نتيجته`, 'labs', 'عرض']);
  const dueFU = D.visits.filter(v => v.followup && v.followup <= t && v.followup >= addDays(t, -14) && !D.appointments.some(a => a.patientId === v.patientId && a.date >= v.date && a.createdAt > (v.createdAt || 0) - 1 && a.id !== v.appointmentId));
  if (dueFU.length) rows.push(['info', `${dueFU.length} مريض حان موعد متابعته ولم يُحجز له`, 'followups', 'عرض']);
  return `<section class="panel"><div class="ph"><h3>تنبيهات</h3></div>${rows.length ? `<div class="alerts">${rows.map(r => `<div class="alert-row"><span class="ic ${r[0]}"></span><div class="grow">${esc(r[1])}</div><button class="btn sm ghost" data-act="alertGo" data-id="${r[2]}">${r[3]}</button></div>`).join('')}</div>` : `<div class="pb muted" style="font-size:.9rem">لا شيء يحتاج انتباهك الآن.</div>`}</section>`;
}
ACT.alertGo = id => {
  if (id === 'finance') { ui.fin = { ...(ui.fin || {}), tab: 'invoices', status: 'due', period: 'all' }; nav('finance'); }
  else if (id === 'labs') showPendingLabs();
  else if (id === 'followups') showDueFollowups();
  else nav(id);
};
function showPendingLabs() {
  const t = today(), rows = [];
  D.visits.forEach(v => (v.labs || []).forEach((l, i) => { if (!l.result) rows.push({ v, l, i }); }));
  rows.sort((a, b) => a.v.date.localeCompare(b.v.date));
  openModal('تحاليل بانتظار النتيجة', rows.length ? `<ul class="list">${rows.map(r => `<li><div class="grow"><div class="t">${esc(r.l.name)}</div><div class="s"><button class="link" data-act="openPatientLabs" data-id="${r.v.patientId}">${esc(pName(r.v.patientId))}</button> · طُلب ${esc(fmtShort(r.v.date))} (منذ ${daysBetween(r.v.date, t)} يوم)</div></div>${W() ? `<button class="btn sm" data-act="labResult" data-id="${r.v.id}|${r.i}">إدخال النتيجة</button>` : ''}</li>`).join('')}</ul>` : '<p class="muted">لا تحاليل معلّقة.</p>', { wide: true, live: null });
}
ACT.openPatientLabs = id => { closeModal(); openPatient(id, 'labs'); };
function showDueFollowups() {
  const t = today();
  const rows = D.visits.filter(v => v.followup && v.followup <= addDays(t, 7) && v.followup >= addDays(t, -30) && !D.appointments.some(a => a.patientId === v.patientId && a.date >= v.date && (a.createdAt || 0) >= (v.createdAt || 0) && a.id !== v.appointmentId)).sort((a, b) => a.followup.localeCompare(b.followup));
  openModal('متابعات مستحقة', rows.length ? `<ul class="list">${rows.map(v => { const p = pat(v.patientId); return `<li><div class="grow"><button class="link" data-act="openPatientM" data-id="${v.patientId}">${esc(pName(v.patientId))}</button><div class="s">موعد المتابعة ${esc(fmtDate(v.followup))} · ${esc((v.diagnoses || []).join('، '))}</div></div>${p?.phone ? `<span class="muted ltr num">${esc(p.phone)}</span>` : ''}${W() ? `<button class="btn sm primary" data-act="bookFollow" data-id="${v.id}">حجز</button>` : ''}</li>`; }).join('')}</ul>` : '<p class="muted">لا متابعات مستحقة.</p>', { wide: true });
}
ACT.openPatientM = id => { closeModal(); openPatient(id); };
ACT.bookFollow = id => { const v = byId('visits', id); if (!v) return; const d = v.followup < today() ? today() : v.followup; const f = freeSlots(d, true)[0]; apptForm(null, { patientId: v.patientId, date: d, time: f ? f.time : '', type: 'followup', reason: 'متابعة' }); };

function qRow(a) {
  const p = pat(a.patientId);
  let btns = '';
  if (W()) {
    if (a.status === 'booked' || a.status === 'confirmed') btns = `<button class="btn sm" data-act="arrive" data-id="${a.id}">وصل</button>`;
    else if (a.status === 'waiting') btns = `<button class="btn sm primary" data-act="callIn" data-id="${a.id}">إدخال للكشف</button>`;
    else if (a.status === 'in') btns = `<button class="btn sm primary" data-act="startVisit" data-id="${a.id}">فتح شاشة الكشف</button>`;
    if (OPEN_STATUSES.includes(a.status)) btns += `<button class="btn sm ghost" data-act="apptMenu" data-id="${a.id}" aria-label="خيارات الموعد">⋯</button>`;
    if (a.status === 'done') { const v = D.visits.find(x => x.appointmentId === a.id); if (v) btns = `<button class="btn sm ghost" data-act="openPatient" data-id="${a.patientId}">الملف</button>`; }
  }
  const sub = [APPT_TYPES[a.type] || '', a.reason, p && ageLabel(p.dob)].filter(Boolean).join(' · ');
  const wait = a.status === 'waiting' ? `<small>ينتظر ${waitMins(a)} د</small>` : a.status === 'in' && a.startedAt ? `<small>منذ ${fmtTs(a.startedAt)}</small>` : a.status === 'done' && a.doneAt ? `<small>انتهى ${fmtTs(a.doneAt)}</small>` : '';
  return `<li class="st-${a.status}"><div class="tm num">${esc(fmtTime(a.time))}${wait}</div>
    <div class="who"><button class="link" data-act="openPatient" data-id="${a.patientId}">${esc(pName(a.patientId))}</button>${allergyTag(p)}${p && balanceOf(p.id) > 0 ? ` <span class="pill p-unpaid" data-tip="رصيد مستحق">${num(balanceOf(p.id))}</span>` : ''}<div class="s">${esc(sub)}</div></div>
    <div class="side-a">${stPill(a.status)}${btns}</div></li>`;
}

/* appointment status transitions */
ACT.arrive = id => patch('appointments', id, { status: 'waiting', arrivedAt: Date.now() }).then(() => toast('سُجّل وصول ' + pName(byId('appointments', id)?.patientId)));
ACT.callIn = id => { const busy = D.appointments.find(a => a.date === today() && a.status === 'in' && a.id !== id); return patch('appointments', id, { status: 'in', startedAt: Date.now() }).then(() => busy && toast(`تنبيه: ${pName(busy.patientId)} ما زال في غرفة الكشف`)); };
ACT.startVisit = id => { const a = byId('appointments', id); if (!a) return; const v = D.visits.find(x => x.appointmentId === id); if (v) return openVisit(v.id); if (a.status !== 'in') patch('appointments', id, { status: 'in', startedAt: a.startedAt || Date.now() }); openVisit(null, { patientId: a.patientId, appointmentId: a.id }); };
ACT.apptMenu = id => {
  const a = byId('appointments', id); if (!a) return;
  const p = pat(a.patientId);
  openModal('الموعد', `<div style="margin-bottom:12px"><b>${esc(pName(a.patientId))}</b> <span class="muted">${fileNo(p)}</span><div class="muted">${esc(fmtDayFull(a.date))} · ${esc(fmtTime(a.time))} · ${esc(APPT_TYPES[a.type] || '')}</div>${a.reason ? `<div>${esc(a.reason)}</div>` : ''}${a.notes ? `<div class="muted">${esc(a.notes)}</div>` : ''}</div>
  <div class="m-foot" style="justify-content:flex-start">
    ${a.status === 'booked' ? `<button class="btn" data-act="setSt" data-id="${id}|confirmed">تأكيد الحضور</button>` : ''}
    ${['booked', 'confirmed'].includes(a.status) ? `<button class="btn" data-act="arriveM" data-id="${id}">وصل</button>` : ''}
    ${a.status !== 'in' && a.status !== 'done' ? `<button class="btn" data-act="startVisitM" data-id="${id}">بدء الكشف مباشرة</button>` : ''}
    <button class="btn" data-act="editAppt" data-id="${id}">تعديل / تأجيل</button>
    ${p?.phone ? `<button class="btn" data-act="remind" data-id="${id}">رسالة تذكير</button>` : ''}
    <button class="btn danger" data-act="setSt" data-id="${id}|noshow">لم يحضر</button>
    <button class="btn danger" data-act="setSt" data-id="${id}|cancelled">إلغاء الموعد</button>
    ${a.status === 'cancelled' || a.status === 'noshow' ? `<button class="btn" data-act="setSt" data-id="${id}|booked">إعادة تفعيل</button>` : ''}
    <button class="btn danger" data-act="delAppt" data-id="${id}">حذف</button>
  </div>`);
};
ACT.setSt = async v => { const [id, s] = v.split('|'); closeModal(); await patch('appointments', id, { status: s }); toast('الحالة الآن: ' + STATUS[s]); };
ACT.arriveM = id => { closeModal(); return ACT.arrive(id); };
ACT.startVisitM = id => { closeModal(); return ACT.startVisit(id); };
ACT.delAppt = id => confirmBox('حذف هذا الموعد نهائيًا؟ (للإلغاء مع الاحتفاظ بالسجل استخدم «إلغاء الموعد»)', async () => { await remove('appointments', id); toast('حُذف الموعد'); });
ACT.editAppt = id => apptForm(byId('appointments', id));
ACT.newAppt = id => apptForm(null, id ? { patientId: id } : {});
ACT.bookSlot = v => { const [date, time] = v.split('|'); apptForm(null, { date, time }); };
ACT.walkIn = () => apptForm(null, { date: today(), time: mtime(Math.ceil(nowMin() / 5) * 5), status: 'waiting', walkIn: true });
ACT.calDay = d => { ui.cal = { ...(ui.cal || {}), date: d, mode: 'day' }; nav('calendar'); };
ACT.remind = id => {
  const a = byId('appointments', id), p = pat(a?.patientId); if (!a || !p) return;
  const msg = reminderText(a, p);
  const wa = waLink(p.phone);
  openModal('رسالة تذكير', `<div class="form"><label class="full">نص الرسالة<textarea id="rmTxt" rows="4">${esc(msg)}</textarea></label>
  <div class="hint">رقم المريض: <b class="ltr">${esc(p.phone)}</b>. انسخ الرسالة ثم أرسلها عبر واتساب أو الرسائل النصية.</div>
  <div class="m-foot"><button class="btn primary" type="button" id="rmCopy">نسخ الرسالة</button>${wa ? `<a class="btn" href="${wa}" target="_blank" rel="noopener">فتح واتساب</a>` : ''}<button class="btn" type="button" data-act="closeModal">إغلاق</button></div></div>`);
  $('#rmCopy').onclick = () => copyText($('#rmTxt').value, 'نُسخت رسالة التذكير');
};
function reminderText(a, p) {
  return (S.reminderTpl || DEFAULT_SETTINGS.reminderTpl)
    .replace(/\{الاسم\}/g, (p.name || '').split(' ')[0])
    .replace(/\{العيادة\}/g, clinicName())
    .replace(/\{الطبيب\}/g, docName())
    .replace(/\{اليوم\}/g, fmtDayFull(a.date))
    .replace(/\{الوقت\}/g, fmtTime(a.time))
    .replace(/\{الهاتف\}/g, S.phone || '');
}
function waLink(phone) {
  const d = iqIntl(phone);
  return d.length >= 11 ? 'https://wa.me/' + d : '';
}

/* ================= APPOINTMENT FORM ================= */
function apptForm(a, pre = {}) {
  if (!W()) return;
  const isNew = !a;
  a = a || { patientId: pre.patientId || '', date: pre.date || today(), time: pre.time || '', type: pre.type || 'new', reason: pre.reason || '', status: pre.status || 'booked', duration: +S.slot || 20 };
  if (isNew && a.patientId && !pre.type) a.type = visitsOf(a.patientId).length ? 'followup' : 'new';
  if (isNew && !a.time) { const f = freeSlots(a.date, true)[0]; if (f) a.time = f.time; }
  openModal(isNew ? (pre.walkIn ? 'مريض حضر بدون موعد' : 'حجز موعد') : 'تعديل الموعد', `<form id="mForm" class="form">
    <label class="full">المريض *<div class="tagin"><select id="a_pat" name="patientId" required data-change="apPat">${patOpts(a.patientId)}</select><button type="button" class="btn" data-act="quickPatient">+ جديد</button></div></label>
    <label>التاريخ *<input id="a_date" name="date" type="date" required value="${esc(a.date)}" data-change="apDate"></label>
    <label>الوقت *<input id="a_time" name="time" type="time" required value="${esc(a.time)}" step="300"></label>
    <div class="full" id="apSlots">${slotPicker(a.date, a.id, a.time)}</div>
    <label>نوع الزيارة<select id="a_type" name="type">${opts(Object.entries(APPT_TYPES), a.type)}</select></label>
    <label>الحالة<select id="a_status" name="status">${opts(Object.entries(STATUS), a.status)}</select></label>
    <label class="full">سبب الزيارة / الشكوى<input id="a_reason" name="reason" value="${esc(a.reason)}" placeholder="مثل: ألم في المعدة، مراجعة نتائج تحاليل"></label>
    <label class="full">ملاحظات للاستقبال<input id="a_notes" name="notes" value="${esc(a.notes)}" placeholder="مثل: يحضر معه تقرير الأشعة"></label>
    ${mfoot(isNew ? (pre.walkIn ? 'إضافة إلى الانتظار' : 'تأكيد الحجز') : 'حفظ')}</form>`, {
    submit: async v => {
      if (!v.patientId) return formErr('اختر المريض أو سجّل مريضًا جديدًا.');
      const clash = D.appointments.find(x => x.id !== a.id && x.date === v.date && x.time === v.time && OPEN_STATUSES.includes(x.status));
      if (clash && !pre.walkIn && !$('#mForm').dataset.force) { $('#mForm').dataset.force = '1'; return formErr(`يوجد موعد آخر في نفس الوقت مع ${pName(clash.patientId)}. اضغط «${isNew ? 'تأكيد الحجز' : 'حفظ'}» مرة أخرى للحجز رغم ذلك، أو اختر وقتًا آخر.`); }
      const same = isNew && D.appointments.find(x => x.patientId === v.patientId && x.date === v.date && OPEN_STATUSES.includes(x.status));
      if (same && !$('#mForm').dataset.force2) { $('#mForm').dataset.force2 = '1'; return formErr(`لهذا المريض موعد في نفس اليوم الساعة ${fmtTime(same.time)}. اضغط مرة أخرى لإضافة موعد ثانٍ.`); }
      const obj = { ...a, ...v };
      if (isNew) obj.id = uid('a');
      if (v.status === 'waiting' && !obj.arrivedAt) obj.arrivedAt = Date.now();
      await save('appointments', obj);
      const off = !isWorkDay(v.date);
      toast(isNew ? (pre.walkIn ? `أُضيف ${pName(v.patientId)} إلى صالة الانتظار` : `حُجز موعد ${pName(v.patientId)} — ${fmtDayFull(v.date)} ${fmtTime(v.time)}${off ? ' (خارج أيام العمل)' : ''}`) : 'حُفظ الموعد');
      return true;
    }
  });
}
function slotPicker(date, exceptId, cur) {
  if (!isWorkDay(date)) return `<div class="hint" style="margin:0">${esc(fmtWeekday(date))} ليس من أيام العمل في الإعدادات. يمكنك الحجز رغم ذلك.</div>`;
  const taken = new Set(D.appointments.filter(x => x.date === date && x.id !== exceptId && OPEN_STATUSES.concat('done').includes(x.status)).map(x => x.time));
  const nm = nowMin();
  const sl = daySlots(date).filter(s => !s.brk && !taken.has(s.time) && (date !== today() || tmin(s.time) > nm - 5));
  if (!sl.length) return `<div class="hint" style="margin:0">لا فترات فارغة في هذا اليوم.</div>`;
  return `<div class="fl">الفترات المتاحة (${sl.length})</div><div class="slots" style="margin-top:4px">${sl.slice(0, 24).map(s => `<button type="button" class="slot" data-act="pickSlot" data-id="${s.time}" ${s.time === cur ? 'style="background:var(--accent);color:var(--accent-ink)"' : ''}>${esc(fmtTime(s.time))}</button>`).join('')}</div>`;
}
CHG.apDate = t => { $('#apSlots').innerHTML = slotPicker(t.value, null, $('#a_time').value); };
CHG.apPat = t => { const ty = $('#a_type'); if (ty && t.value) ty.value = visitsOf(t.value).length ? 'followup' : 'new'; };
ACT.pickSlot = (t, b) => { $('#a_time').value = t; $$('#apSlots .slot').forEach(x => x.removeAttribute('style')); b.style.background = 'var(--accent)'; b.style.color = 'var(--accent-ink)'; };
ACT.quickPatient = () => {
  const keep = Object.fromEntries(new FormData($('#mForm')));
  patientForm(null, { onDone: p => apptForm(null, { ...keep, patientId: p.id, walkIn: keep.status === 'waiting' }) });
};

/* ================= CALENDAR ================= */
VIEWS.calendar = {
  shell() {
    const c = ui.cal = ui.cal || { date: today(), mode: 'day' };
    return `<div class="head"><div class="grow"><h1>المواعيد</h1><div class="sub" id="calSub"></div></div>
      <div class="seg" role="group" aria-label="طريقة العرض"><button data-act="calMode" data-id="day" aria-pressed="${c.mode === 'day'}">يوم</button><button data-act="calMode" data-id="week" aria-pressed="${c.mode === 'week'}">أسبوع</button><button data-act="calMode" data-id="list" aria-pressed="${c.mode === 'list'}">القادمة</button></div>
      <div style="display:flex;gap:4px;align-items:center"><button class="btn sm" data-act="calStep" data-id="1" aria-label="التالي">‹</button><button class="btn sm" data-act="calToday">اليوم</button><button class="btn sm" data-act="calStep" data-id="-1" aria-label="السابق">›</button></div>
      <input type="date" id="calDate" value="${c.date}" data-change="calDate" aria-label="اختر التاريخ">
      ${W() ? `<button class="btn primary" data-act="calNew">${icon('<path d="M12 5v14M5 12h14"/>')}حجز</button>` : ''}</div><div id="vbody"></div>`;
  },
  body() {
    const c = ui.cal;
    if (c.mode === 'week') return calWeek(c.date);
    if (c.mode === 'list') return calList();
    return calDay(c.date);
  },
  after() {
    const c = ui.cal, sub = $('#calSub'); if (!sub) return;
    if (c.mode === 'day') { const n = D.appointments.filter(a => a.date === c.date && !['cancelled', 'noshow'].includes(a.status)).length; sub.textContent = `${fmtDayFull(c.date)} · ${n} موعد · ${freeSlots(c.date).length} فترة متاحة`; }
    else if (c.mode === 'week') { const s = weekStart(c.date); sub.textContent = `أسبوع ${fmtShort(s)} – ${fmtShort(addDays(s, 6))}`; }
    else sub.textContent = 'كل المواعيد القادمة المفتوحة';
    const di = $('#calDate'); if (di) di.value = c.date;
  }
};
const weekStart = iso => { const d = dObj(iso); const off = (d.getDay() + 1) % 7; return addDays(iso, -off); }; // week starts Saturday
ACT.calMode = m => { ui.cal.mode = m; buildShell(); };
ACT.calToday = () => { ui.cal.date = today(); renderBody(); };
ACT.calStep = n => { ui.cal.date = addDays(ui.cal.date, (+n) * (ui.cal.mode === 'week' ? 7 : 1)); renderBody(); };
CHG.calDate = t => { if (t.value) { ui.cal.date = t.value; renderBody(); } };
ACT.calNew = () => apptForm(null, { date: ui.cal.date });
ACT.goDay = d => { ui.cal.date = d; ui.cal.mode = 'day'; buildShell(); };

function apptCard(a) {
  const p = pat(a.patientId);
  return `<div class="appt st-${a.status}"><div class="grow"><button class="link" data-act="openPatient" data-id="${a.patientId}">${esc(pName(a.patientId))}</button>${allergyTag(p)}<div class="s">${esc([APPT_TYPES[a.type], a.reason, p?.phone].filter(Boolean).join(' · '))}</div></div>${stPill(a.status)}
    ${W() ? `${a.status === 'booked' || a.status === 'confirmed' ? `<button class="btn sm" data-act="arrive" data-id="${a.id}">وصل</button>` : ''}${a.status === 'waiting' ? `<button class="btn sm primary" data-act="callIn" data-id="${a.id}">إدخال</button>` : ''}${a.status === 'in' ? `<button class="btn sm primary" data-act="startVisit" data-id="${a.id}">الكشف</button>` : ''}<button class="btn sm ghost" data-act="apptMenu" data-id="${a.id}" aria-label="خيارات">⋯</button>` : ''}</div>`;
}
function calDay(iso) {
  const ap = D.appointments.filter(a => a.date === iso).sort(byTime);
  const slots = daySlots(iso);
  const byT = {};
  ap.forEach(a => (byT[a.time] = byT[a.time] || []).push(a));
  const times = [...new Set(slots.map(s => s.time).concat(ap.map(a => a.time)))].sort();
  const brk = new Set(slots.filter(s => s.brk).map(s => s.time));
  const past = iso < today();
  let h = '';
  if (!slots.length) h += `<div class="banner" style="margin-bottom:12px;background:var(--surface-2);color:var(--muted)">${esc(fmtWeekday(iso))} ليس من أيام العمل. ${ap.length ? 'المواعيد المحجوزة في هذا اليوم ظاهرة أدناه.' : ''}</div>`;
  if (!times.length) return h + `<div class="panel">${emptyBox('لا مواعيد', '<br>اختر يومًا آخر أو أضف موعدًا خاصًا.', 'calNew', 'حجز موعد')}</div>`;
  h += `<div class="split"><section class="panel cal-day">${times.map(t => {
    const list = byT[t] || [];
    const open = list.filter(a => OPEN_STATUSES.concat('done').includes(a.status));
    const gone = past || (iso === today() && tmin(t) + (+S.slot || 20) <= nowMin());
    return `<div class="cal-row ${brk.has(t) ? 'brk' : ''} ${gone ? 'past' : ''}"><div class="tm num">${esc(fmtTime(t))}</div><div class="cell">${list.map(apptCard).join('')}
      ${!open.length && !brk.has(t) && !gone && W() ?`<button class="free" data-act="bookSlot" data-id="${iso}|${t}">متاح — احجز هذا الوقت</button>` : ''}${brk.has(t) && !list.length ? '<span class="muted" style="font-size:.82rem">استراحة</span>' : ''}</div></div>`;
  }).join('')}</section>${remindersPanel(iso)}</div>`;
  return h;
}
function remindersPanel(iso) {
  const list = D.appointments.filter(a => a.date === iso && ['booked', 'confirmed'].includes(a.status)).sort(byTime);
  if (iso < today()) return `<section class="panel"><div class="ph"><h3>ملخص اليوم</h3></div><div class="pb" style="font-size:.9rem">${daySummary(iso)}</div></section>`;
  return `<section class="panel"><div class="ph"><h3>التذكيرات والتأكيد</h3><span class="muted">${list.length}</span></div>${list.length ? `<ul class="list">${list.map(a => { const p = pat(a.patientId); return `<li><div class="grow"><div class="t">${esc(pName(a.patientId))}</div><div class="s ltr num" style="text-align:end">${esc(p?.phone || 'لا يوجد رقم')}</div></div>${a.status === 'confirmed' ? pill('confirmed', 'مؤكَّد') : W() ? `<button class="btn sm" data-act="setStQ" data-id="${a.id}|confirmed">تأكيد</button>` : ''}${p?.phone ? `<button class="btn sm ghost" data-act="remind" data-id="${a.id}">رسالة</button>` : ''}</li>`; }).join('')}</ul>
    <div class="pb" style="border-top:1px solid var(--line)"><button class="btn sm" data-act="copyAllRem" data-id="${iso}">نسخ كل رسائل التذكير</button></div>` : `<div class="pb muted" style="font-size:.9rem">لا مواعيد بانتظار التأكيد في هذا اليوم.</div>`}</section>`;
}
function daySummary(iso) {
  const ap = D.appointments.filter(a => a.date === iso);
  const c = s => ap.filter(a => a.status === s).length;
  const paid = sum(D.invoices, i => sum((i.payments || []).filter(p => p.date === iso), p => p.amount));
  return `مواعيد: <b>${ap.length}</b> · تم الكشف: <b>${c('done')}</b> · لم يحضر: <b>${c('noshow')}</b> · ملغى: <b>${c('cancelled')}</b><br>كشوفات مسجلة: <b>${D.visits.filter(v => v.date === iso).length}</b> · المحصَّل: <b>${money(paid)}</b>`;
}
ACT.setStQ = async v => { const [id, s] = v.split('|'); await patch('appointments', id, { status: s }); };
ACT.copyAllRem = iso => {
  const list = D.appointments.filter(a => a.date === iso && ['booked', 'confirmed'].includes(a.status)).sort(byTime);
  const txt = list.map(a => { const p = pat(a.patientId); return `${p?.name || ''} — ${p?.phone || 'بدون رقم'}\n${reminderText(a, p || {})}`; }).join('\n\n');
  copyText(txt, `نُسخت ${list.length} رسالة تذكير`);
};
function calWeek(iso) {
  const s = weekStart(iso), t = today();
  const days = [...Array(7)].map((_, i) => addDays(s, i));
  return `<div class="tbl"><div class="week">${days.map(d => {
    const ap = D.appointments.filter(a => a.date === d).sort(byTime);
    const n = ap.filter(a => !['cancelled', 'noshow'].includes(a.status)).length;
    const free = freeSlots(d).length;
    return `<div class="wcol ${isWorkDay(d) ? '' : 'off'} ${d === t ? 'today' : ''}"><button class="wh" data-act="goDay" data-id="${d}"><b>${esc(fmtWeekday(d))}</b><span>${esc(fmtShort(d))} · ${n} موعد${isWorkDay(d) ? ` · ${free} متاح` : ''}</span></button>
      <div class="wlist">${ap.map(a => `<button class="wchip st-${a.status}" data-act="${W() ? 'apptMenu' : 'openPatient'}" data-id="${W() ? a.id : a.patientId}" data-tip="${esc(STATUS[a.status])}${a.reason ? ' — ' + esc(a.reason) : ''}"><b class="num">${esc(fmtTime(a.time))}</b> ${esc(pName(a.patientId))}</button>`).join('')}</div></div>`;
  }).join('')}</div></div>`;
}
function calList() {
  const t = today();
  const list = D.appointments.filter(a => a.date >= t && OPEN_STATUSES.includes(a.status)).sort(byTime);
  if (!list.length) return `<div class="panel">${emptyBox('لا مواعيد قادمة', '', 'calNew', 'حجز موعد')}</div>`;
  let last = '', h = '<div class="tbl"><table><thead><tr><th>اليوم</th><th>الوقت</th><th>المريض</th><th>الهاتف</th><th>النوع</th><th>السبب</th><th>الحالة</th><th></th></tr></thead><tbody>';
  list.forEach(a => {
    const p = pat(a.patientId);
    h += `<tr><td>${a.date !== last ? `<b>${esc(fmtDayFull(a.date))}</b>` : ''}</td><td class="num"><b>${esc(fmtTime(a.time))}</b></td><td><button class="link" data-act="openPatient" data-id="${a.patientId}">${esc(pName(a.patientId))}</button></td><td class="ltr num">${esc(p?.phone || '')}</td><td>${esc(APPT_TYPES[a.type] || '')}</td><td class="muted">${esc(a.reason || '')}</td><td>${stPill(a.status)}</td><td><div class="acts">${W() ? `<button class="btn sm ghost" data-act="apptMenu" data-id="${a.id}">خيارات</button>` : ''}</div></td></tr>`;
    last = a.date;
  });
  return h + '</tbody></table></div>';
}

/* ================= PATIENT LIST ================= */
VIEWS.patients = {
  shell() {
    const f = ui.pl = ui.pl || { q: '', sort: 'recent', filter: 'all' };
    return `<div class="head"><div class="grow"><h1>المرضى</h1><div class="sub" id="plSub"></div></div>
      <label class="ctl" for="plq">بحث<input type="search" id="plq" value="${esc(f.q)}" data-input="plq" placeholder="اسم، هاتف، رقم ملف، تشخيص"></label>
      <label class="ctl" for="plf">تصفية<select id="plf" data-change="plf">${opts([['all', 'الكل'], ['balance', 'عليهم مبالغ مستحقة'], ['chronic', 'أمراض مزمنة'], ['allergy', 'لديهم حساسية'], ['inactive', 'لم يزوروا منذ 6 أشهر'], ['new', 'سُجّلوا هذا الشهر']], f.filter)}</select></label>
      <label class="ctl" for="pls">ترتيب<select id="pls" data-change="pls">${opts([['recent', 'الأحدث تسجيلًا'], ['visit', 'آخر زيارة'], ['name', 'الاسم'], ['visits', 'الأكثر زيارة']], f.sort)}</select></label>
      <button class="btn" data-act="exportPatients">تصدير CSV</button>
      ${W() ? `<button class="btn primary" data-act="newPatient">${icon('<path d="M12 5v14M5 12h14"/>')}مريض جديد</button>` : ''}</div><div id="vbody"></div>`;
  },
  body() {
    const f = ui.pl;
    if (!D.patients.length) return `<div class="panel">${emptyBox('لا يوجد مرضى بعد', '<br>سجّل أول مريض ليُفتح له ملف طبي برقم تلقائي.', 'newPatient', 'تسجيل مريض')}</div>`;
    const vc = {}, lv = {};
    D.visits.forEach(v => { vc[v.patientId] = (vc[v.patientId] || 0) + 1; if (!lv[v.patientId] || v.date > lv[v.patientId].date) lv[v.patientId] = v; });
    const n = norm(f.q), digits = f.q.replace(/\D/g, '');
    let list = D.patients.filter(p => {
      if (n) {
        const hit = norm(p.name).includes(n) || (digits && ((p.phone || '').replace(/\D/g, '').includes(digits) || String(p.fileNo) === digits.replace(/^0+/, '') || (p.nid || '').includes(digits)))
          || (lv[p.id] && norm((lv[p.id].diagnoses || []).join(' ')).includes(n)) || norm(p.chronic).includes(n);
        if (!hit) return false;
      }
      if (f.filter === 'balance') return balanceOf(p.id) > 0;
      if (f.filter === 'chronic') return !!p.chronic;
      if (f.filter === 'allergy') return !!p.allergies;
      if (f.filter === 'inactive') return !lv[p.id] || lv[p.id].date < addDays(today(), -182);
      if (f.filter === 'new') return monthKey(isoDate(new Date(p.createdAt || 0))) === thisMonth();
      return true;
    });
    const sorters = {
      recent: (a, b) => (b.fileNo || 0) - (a.fileNo || 0),
      name: (a, b) => (a.name || '').localeCompare(b.name || '', 'ar'),
      visit: (a, b) => (lv[b.id]?.date || '').localeCompare(lv[a.id]?.date || ''),
      visits: (a, b) => (vc[b.id] || 0) - (vc[a.id] || 0)
    };
    list.sort(sorters[f.sort] || sorters.recent);
    const shown = list.slice(0, 300);
    const sub = $('#plSub'); if (sub) sub.textContent = `${D.patients.length} ملف${list.length !== D.patients.length ? ` · ${list.length} مطابق` : ''}`;
    if (!list.length) return `<div class="panel">${emptyBox('لا نتائج', `<br>لا يوجد مريض يطابق البحث.`, f.q ? 'newPatient' : '', 'تسجيل «' + esc(f.q) + '»', f.q)}</div>`;
    return `<div class="tbl"><table><thead><tr><th>رقم الملف</th><th>الاسم</th><th>العمر / الجنس</th><th>الهاتف</th><th>آخر زيارة</th><th>آخر تشخيص</th><th class="n">الزيارات</th><th class="n">المستحق</th><th></th></tr></thead><tbody>
      ${shown.map(p => {
        const v = lv[p.id], bal = balanceOf(p.id);
        return `<tr><td class="num muted">${fileNo(p)}</td><td><button class="link" data-act="openPatient" data-id="${p.id}">${esc(p.name)}</button>${allergyTag(p)}${p.chronic ? `<span class="rowsub">${esc(p.chronic)}</span>` : ''}</td>
        <td>${esc([ageLabel(p.dob), p.gender].filter(Boolean).join(' · '))}</td><td class="ltr num">${esc(p.phone || '')}</td>
        <td class="muted">${v ? esc(fmtDate(v.date)) : '—'}</td><td>${v ? esc((v.diagnoses || []).join('، ')) : ''}</td><td class="n">${vc[p.id] || 0}</td>
        <td class="n">${bal > 0 ? `<b style="color:var(--danger)">${money(bal)}</b>` : '<span class="muted">—</span>'}</td>
        <td><div class="acts">${W() ? `<button class="btn sm" data-act="newApptFor" data-id="${p.id}">موعد</button><button class="btn sm" data-act="visitFor" data-id="${p.id}">كشف</button>` : ''}</div></td></tr>`;
      }).join('')}</tbody></table></div>${list.length > shown.length ? `<p class="muted" style="font-size:.85rem">يُعرض أول ${shown.length} من ${list.length}. استخدم البحث لتضييق النتائج.</p>` : ''}`;
  }
};
INP.plq = debounce(t => { ui.pl.q = t.value; renderBody(); }, 150);
CHG.plf = t => { ui.pl.filter = t.value; renderBody(); };
CHG.pls = t => { ui.pl.sort = t.value; renderBody(); };
ACT.newApptFor = id => apptForm(null, { patientId: id });
ACT.visitFor = id => openVisit(null, { patientId: id });
ACT.exportPatients = () => {
  const lvMap = {}; D.visits.forEach(v => { if (!lvMap[v.patientId] || v.date > lvMap[v.patientId]) lvMap[v.patientId] = v.date; });
  const rows = [['رقم الملف', 'الاسم', 'الجنس', 'تاريخ الميلاد', 'العمر', 'الهاتف', 'هاتف آخر', 'رقم الهوية', 'فصيلة الدم', 'الحساسية', 'أمراض مزمنة', 'التأمين', 'آخر زيارة', 'المستحق']];
  [...D.patients].sort((a, b) => (a.fileNo || 0) - (b.fileNo || 0)).forEach(p => rows.push([fileNo(p), p.name, p.gender, p.dob, ageYears(p.dob) ?? '', p.phone, p.phone2, p.nid, p.blood, p.allergies, p.chronic, p.insurer, lvMap[p.id] || '', balanceOf(p.id)]));
  downloadFile(`مرضى-${today()}.csv`, toCSV(rows));
};

/* ================= PATIENT FORM ================= */
function patientForm(p, o = {}) {
  if (!W()) return;
  const isNew = !p || !p.id;
  if (typeof p === 'string') p = { name: p };
  p = p || {};
  openModal(isNew ? 'تسجيل مريض جديد' : 'تعديل بيانات المريض', `<form id="mForm" class="form">
    <div class="sec-h" style="border:0;padding-top:0;margin-top:0">البيانات الأساسية</div>
    <label class="full">الاسم الكامل *<input id="f_name" name="name" required value="${esc(p.name)}" autocomplete="off" data-input="dupCheck"></label>
    <div id="dupBox" class="full" hidden></div>
    <label>رقم الموبايل<input id="f_phone" name="phone" type="tel" dir="ltr" value="${esc(p.phone)}" placeholder="07XX XXX XXXX" data-input="dupCheck"></label>
    <label>رقم آخر<input id="f_phone2" name="phone2" type="tel" dir="ltr" value="${esc(p.phone2)}" placeholder="07XX XXX XXXX"></label>
    <div id="phoneHint" class="full" hidden></div>
    <label>الجنس<select id="f_gender" name="gender" data-change="genderPreg">${opts(['ذكر', 'أنثى'], p.gender, '—')}</select></label>
    <label>تاريخ الميلاد<input id="f_dob" name="dob" type="date" value="${esc(p.dob)}" max="${today()}"></label>
    <label>أو العمر بالسنوات<input id="f_age" type="number" min="0" max="120" placeholder="إذا التاريخ غير معروف" data-input="ageToDob"></label>
    <label id="pregL" ${p.gender === 'أنثى' ? '' : 'hidden'}>الحمل والرضاعة<select id="f_preg" name="pregnancy">${opts(['حامل', 'مرضع'], p.pregnancy, 'لا')}</select></label>
    <label>رقم البطاقة الوطنية<input id="f_nid" name="nid" dir="ltr" value="${esc(p.nid)}"></label>
    <label>الحالة الاجتماعية<select id="f_marital" name="marital">${opts(['أعزب/باكر', 'متزوج/ة', 'مطلق/ة', 'أرمل/ة'], p.marital, '—')}</select></label>
    <label>المهنة<input id="f_job" name="job" value="${esc(p.job)}"></label>
    <label>المحافظة<select id="f_prov" name="province">${opts(PROVINCES, p.province || (p.id ? '' : S.province), '—')}</select></label>
    <label>المنطقة / المحلة<input id="f_address" name="address" value="${esc(p.address)}" placeholder="مثل: الكرادة، حي الجامعة"></label>
    <div class="sec-h">التاريخ الطبي</div>
    <label>فصيلة الدم<select id="f_blood" name="blood" dir="ltr">${opts(BLOOD, p.blood, '—')}</select></label>
    <label>التدخين<select id="f_smoking" name="smoking">${opts(['لا يدخن', 'مدخن', 'مدخن سابق'], p.smoking, '—')}</select></label>
    <label class="full">الحساسية (أدوية، أطعمة، غيرها)<input id="f_allergies" name="allergies" value="${esc(p.allergies)}" placeholder="مثل: البنسلين، الأسبرين — اتركه فارغًا إن لا يوجد"></label>
    <label class="full">أمراض مزمنة<input id="f_chronic" name="chronic" value="${esc(p.chronic)}" placeholder="مثل: سكري النوع الثاني، ارتفاع ضغط الدم"></label>
    <label class="full">أدوية يتناولها حاليًا<input id="f_meds" name="currentMeds" value="${esc(p.currentMeds)}"></label>
    <label>عمليات سابقة<input id="f_surg" name="surgeries" value="${esc(p.surgeries)}"></label>
    <label>تاريخ عائلي<input id="f_fam" name="familyHx" value="${esc(p.familyHx)}" placeholder="سكري، ضغط، أورام…"></label>
    <div class="sec-h">التأمين والطوارئ</div>
    <label>الجهة المتكفلة (شركة / دائرة / تأمين)<input id="f_ins" name="insurer" value="${esc(p.insurer)}" placeholder="اتركه فارغًا إذا المريض يدفع بنفسه"></label>
    <label>رقم الهوية / البطاقة لدى الجهة<input id="f_insno" name="insNo" dir="ltr" value="${esc(p.insNo)}"></label>
    <label>اسم قريب للطوارئ<input id="f_emn" name="emName" value="${esc(p.emName)}"></label>
    <label>هاتف الطوارئ<input id="f_emp" name="emPhone" type="tel" dir="ltr" value="${esc(p.emPhone)}"></label>
    <label class="full">شلون تعرّف على العيادة<select id="f_src" name="source">${opts(['توصية مريض أو قريب', 'تحويل من طبيب', 'فيسبوك / إنستغرام', 'تيك توك', 'بحث كوكل', 'لافتة العيادة', 'صيدلية قريبة', 'أخرى'], p.source, '—')}</select></label>
    <label class="full">ملاحظات<textarea id="f_notes" name="notes" rows="2">${esc(p.notes)}</textarea></label>
    ${mfoot(isNew ? 'تسجيل المريض وفتح ملف' : 'حفظ التعديلات')}</form>`, {
    submit: async d => {
      const obj = { ...p, ...d, name: d.name.trim().replace(/\s+/g, ' ') };
      if (!obj.name) return formErr('اكتب اسم المريض.');
      if (isNew) { obj.id = uid('p'); obj.fileNo = Math.max(0, ...D.patients.map(x => x.fileNo || 0)) + 1; }
      await save('patients', obj);
      toast(isNew ? `فُتح ملف ${obj.name} برقم ${fileNo(obj)}` : 'حُفظت بيانات المريض');
      if (o.onDone) { closeModal(); o.onDone(obj); return 'handled'; }
      if (isNew) { closeModal(); openPatient(obj.id); return 'handled'; }
      return true;
    }
  });
}
INP.ageToDob = t => { const a = +t.value; if (t.value !== '' && a >= 0) $('#f_dob').value = `${new Date().getFullYear() - a}-01-01`; };
CHG.genderPreg = t => { const l = $('#pregL'); if (l) l.hidden = t.value !== 'أنثى'; if (t.value !== 'أنثى' && $('#f_preg')) $('#f_preg').value = ''; };
INP.dupCheck = debounce(() => {
  const ph0 = $('#f_phone')?.value, hint = $('#phoneHint');
  if (hint) { hint.hidden = phoneOk(ph0); hint.innerHTML = phoneOk(ph0) ? '' : '<div class="hint" style="margin:0">رقم الموبايل العراقي يتكون من 11 رقمًا ويبدأ بـ 07 (مثل 0770 123 4567). تأكد منه لتعمل رسائل واتساب.</div>'; }
  const box = $('#dupBox'); if (!box) return;
  const n = norm($('#f_name').value), ph = ($('#f_phone').value || '').replace(/\D/g, '');
  const hits = D.patients.filter(p => (n.length > 4 && norm(p.name) === n) || (ph.length >= 7 && (p.phone || '').replace(/\D/g, '') === ph));
  box.hidden = !hits.length;
  box.innerHTML = hits.length ? `<div class="hint" style="margin:0">قد يكون المريض مسجلًا: ${hits.slice(0, 3).map(p => `<button type="button" class="link" data-act="openPatientM" data-id="${p.id}">${esc(p.name)} ${fileNo(p)}</button>`).join('، ')}</div>` : '';
}, 250);
ACT.newPatient = q => patientForm(q && q.trim() ? q.trim() : null);
