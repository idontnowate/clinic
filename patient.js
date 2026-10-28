'use strict';
/* ============================================================
   patient.js — patient file, visit (encounter) screen, prescriptions,
   labs, attachments, medical documents
   ============================================================ */

const VITAL_DEFS = [
  ['bp', 'الضغط', 'mmHg'], ['pulse', 'النبض', 'نبضة/د'], ['temp', 'الحرارة', '°C'], ['rr', 'التنفس', '/د'],
  ['spo2', 'تشبع الأكسجين', '%'], ['weight', 'الوزن', 'كغ'], ['height', 'الطول', 'سم'], ['sugar', 'سكر عشوائي', 'mg/dL']
];
function vitalFlag(k, v) {
  if (v === '' || v == null) return false;
  if (k === 'bp') { const [s, d] = String(v).split('/').map(Number); return s >= 140 || d >= 90 || (s && s < 90); }
  const n = +v;
  return (k === 'temp' && (n >= 37.8 || n < 35.5)) || (k === 'pulse' && (n > 100 || n < 55)) || (k === 'spo2' && n < 94) || (k === 'sugar' && (n >= 200 || n < 70)) || (k === 'rr' && (n > 22 || n < 10));
}
const bpOf = vt => vt && vt.bps ? `${vt.bps}/${vt.bpd || ''}` : '';
function vitalsList(vt) {
  if (!vt) return [];
  const out = [];
  VITAL_DEFS.forEach(([k, l, u]) => { const v = k === 'bp' ? bpOf(vt) : vt[k]; if (v !== '' && v != null) out.push({ k, l, u, v }); });
  const b = bmi(vt.weight, vt.height);
  if (b) out.push({ k: 'bmi', l: 'مؤشر كتلة الجسم', u: bmiLabel(b), v: b.toFixed(1) });
  return out;
}
const vitalsHtml = vt => { const l = vitalsList(vt); return l.length ? `<div class="vit">${l.map(x => `<div class="${vitalFlag(x.k, x.v) ? 'hi' : ''}"><span>${esc(x.l)}</span><b class="${x.k === 'bp' ? 'ltr' : ''}">${esc(x.v)} <small>${esc(x.u)}</small></b></div>`).join('')}</div>` : ''; };
const rxLine = r => [r.form, r.dose, r.freq, r.duration ? 'لمدة ' + r.duration : '', r.notes].filter(Boolean).join(' — ');

/* ================= PATIENT PAGE ================= */
VIEWS.patient = {
  shell: () => `<div id="vbody"></div>`,
  body(pid) {
    const p = pat(pid);
    if (!p) return `<div class="panel">${emptyBox('الملف غير موجود', '<br>ربما حُذف هذا الملف.', '', '')}<div style="text-align:center;padding-bottom:20px"><button class="btn" data-act="nav" data-id="patients">العودة للمرضى</button></div></div>`;
    const vs = visitsOf(pid), inv = invoicesOf(pid), files = D.files.filter(f => f.patientId === pid), reps = D.reports.filter(r => r.patientId === pid);
    const labs = []; vs.forEach(v => (v.labs || []).forEach((l, i) => labs.push({ v, l, i })));
    const bal = balanceOf(pid);
    const next = apptsOf(pid).find(a => a.date >= today() && OPEN_STATUSES.includes(a.status));
    const tab = ui.ptab || 'overview';
    const tabs = [['overview', 'نظرة عامة'], ['visits', 'الكشوفات', vs.length], ['rx', 'الوصفات', vs.filter(v => (v.rx || []).length).length], ['labs', 'التحاليل والأشعة', labs.length], ['files', 'المرفقات', files.length], ['billing', 'الحساب', inv.length], ['docs', 'التقارير الطبية', reps.length], ['appts', 'المواعيد', apptsOf(pid).length]];
    const initials = (p.name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join(' ');
    let h = `<div class="p-hero"><div class="avatar" aria-hidden="true">${esc(initials)}</div>
      <div class="p-id"><div class="no">ملف رقم ${fileNo(p)} · سُجّل ${esc(fmtDate(isoDate(new Date(p.createdAt || Date.now()))))}</div><h1>${esc(p.name)}</h1>
        <div class="facts">${p.gender ? `<span>${esc(p.gender)}</span>` : ''}${p.dob ? `<span>العمر <b>${esc(ageLabel(p.dob))}</b></span>` : ''}${p.blood ? `<span>الفصيلة <b class="ltr">${esc(p.blood)}</b></span>` : ''}${p.phone ? `<span>الموبايل <b class="ltr">${esc(fmtPhone(p.phone))}</b></span>` : ''}${p.province ? `<span>${esc(p.province)}${p.address ? ' — ' + esc(p.address) : ''}</span>` : ''}${p.insurer ? `<span>التأمين <b>${esc(p.insurer)}</b></span>` : ''}
        <span>الزيارات <b>${vs.length}</b></span>${vs[0] ? `<span>آخر زيارة <b>${esc(fmtDate(vs[0].date))}</b></span>` : ''}${next ? `<span>الموعد القادم <b>${esc(fmtShort(next.date))} ${esc(fmtTime(next.time))}</b></span>` : ''}${bal > 0 ? `<span style="color:var(--danger)">مستحق <b style="color:var(--danger)">${money(bal)}</b></span>` : ''}</div></div>
      <div class="p-acts">${W() ? `<button class="btn primary" data-act="visitFor" data-id="${pid}">${icon('<path d="M9 3h6v4H9zM5 5h4M15 5h4v16H5V5"/><path d="M9 13h6M12 10v6"/>')}كشف جديد</button>
        <button class="btn" data-act="newApptFor" data-id="${pid}">حجز موعد</button><button class="btn" data-act="newInvoice" data-id="${pid}">فاتورة</button>
        <button class="btn" data-act="newReport" data-id="${pid}">تقرير / إجازة</button><button class="btn ghost" data-act="editPatient" data-id="${pid}">تعديل</button>` : ''}
        <button class="btn ghost" data-act="patientSummary" data-id="${pid}">ملخص الملف</button>${next ? `<button class="btn ghost" data-act="apptCard" data-id="${pid}">بطاقة مراجعة</button>` : ''}</div></div>`;
    const flags = [];
    if (p.allergies) flags.push(['bad', 'حساسية:', p.allergies]);
    if (p.pregnancy) flags.push(['bad', 'تنبيه:', p.pregnancy === 'حامل' ? 'المريضة حامل' : 'المريضة مرضع']);
    if (p.chronic) flags.push(['warn', 'أمراض مزمنة:', p.chronic]);
    if (p.currentMeds) flags.push(['info', 'أدوية حالية:', p.currentMeds]);
    if (flags.length) h += `<div class="flags">${flags.map(f => `<div class="flag ${f[0]}"><b>${f[1]}</b>${esc(f[2])}</div>`).join('')}</div>`;
    h += `<div class="tabs" role="tablist">${tabs.map(([k, t, c]) => `<button role="tab" data-act="ptab" data-id="${k}" aria-selected="${tab === k}">${t}${c ? `<span class="c">${c}</span>` : ''}</button>`).join('')}</div>`;
    h += ({ overview: pOverview, visits: pVisits, rx: pRx, labs: pLabs, files: pFiles, billing: pBilling, docs: pDocs, appts: pAppts }[tab] || pOverview)(p, { vs, inv, files, reps, labs });
    return h;
  },
  after() {
    $$('img[data-blob]').forEach(img => { img.onerror = () => { img.replaceWith(Object.assign(document.createElement('span'), { textContent: 'تعذّر عرض الصورة', className: 'muted' })); }; });
  }
};
ACT.ptab = t => { ui.ptab = t; renderBody(); };
ACT.editPatient = id => patientForm(pat(id));

function pOverview(p, { vs }) {
  const lastV = vs.find(v => vitalsList(v.vitals).length);
  const hist = [['فصيلة الدم', p.blood], ['التدخين', p.smoking], ['أمراض مزمنة', p.chronic], ['الحساسية', p.allergies], ['أدوية حالية', p.currentMeds], ['عمليات سابقة', p.surgeries], ['تاريخ عائلي', p.familyHx], ['ملاحظات', p.notes]].filter(x => x[1]);
  const pers = [['الموبايل', p.phone && `<span class="ltr">${esc(fmtPhone(p.phone))}</span>${p.phone2 ? ' / <span class="ltr">' + esc(fmtPhone(p.phone2)) + '</span>' : ''}${waLink(p.phone) ? ` <a class="btn sm ghost" href="${waLink(p.phone)}" target="_blank" rel="noopener">واتساب</a>` : ''}`, true], ['البطاقة الوطنية', p.nid], ['تاريخ الميلاد', p.dob && fmtDate(p.dob)], ['الحالة الاجتماعية', p.marital], ['المهنة', p.job], ['السكن', [p.province, p.address].filter(Boolean).join(' — ')], ['الجهة المتكفلة', [p.insurer, p.insNo].filter(Boolean).join(' — ')], ['الطوارئ', [p.emName, p.emPhone].filter(Boolean).join(' — ')], ['المصدر', p.source]].filter(x => x[1]);
  const dl = rows => `<dl class="dl">${rows.map(r => `<dt>${r[0]}</dt><dd>${r[2] ? r[1] : esc(r[1])}</dd>`).join('')}</dl>`;
  let h = `<div class="grid2"><div class="stack">`;
  h += `<section class="panel"><div class="ph"><h3>آخر زيارة</h3>${vs[0] ? `<span class="muted">${esc(fmtDate(vs[0].date))}</span>` : ''}</div><div class="pb">${vs[0] ? visitBrief(vs[0]) : '<span class="muted">لم يُسجَّل أي كشف بعد.</span>'}</div></section>`;
  h += `<section class="panel"><div class="ph"><h3>العلامات الحيوية</h3>${lastV ? `<span class="muted">${esc(fmtDate(lastV.date))}</span>` : ''}</div><div class="pb">${lastV ? vitalsHtml(lastV.vitals) : '<span class="muted">لا قياسات مسجلة.</span>'}${vitalsTrend(vs)}</div></section>`;
  h += `</div><div class="stack">`;
  h += `<section class="panel"><div class="ph"><h3>التاريخ الطبي</h3>${W() ? `<button class="btn sm ghost" data-act="editPatient" data-id="${p.id}">تعديل</button>` : ''}</div><div class="pb">${hist.length ? dl(hist) : '<span class="muted">لم يُسجَّل تاريخ طبي. أضف الحساسية والأمراض المزمنة من «تعديل».</span>'}</div></section>`;
  h += `<section class="panel"><div class="ph"><h3>البيانات الشخصية</h3></div><div class="pb">${pers.length ? dl(pers) : '<span class="muted">لا بيانات إضافية.</span>'}</div></section>`;
  const dx = {}; vs.forEach(v => (v.diagnoses || []).forEach(d => dx[d] = (dx[d] || 0) + 1));
  const dxs = Object.entries(dx).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (dxs.length) h += `<section class="panel"><div class="ph"><h3>التشخيصات السابقة</h3></div><div class="pb"><div class="dxs">${dxs.map(([d, n]) => `<span>${esc(d)}${n > 1 ? ` ×${n}` : ''}</span>`).join('')}</div></div></section>`;
  h += `</div></div>`;
  return h;
}
function visitBrief(v) {
  return `${(v.diagnoses || []).length ? `<div class="dxs">${v.diagnoses.map(d => `<span>${esc(d)}</span>`).join('')}</div>` : ''}${v.complaint ? `<div class="vsec"><div class="lbl">الشكوى</div><div class="txt">${esc(v.complaint)}</div></div>` : ''}
  ${(v.rx || []).length ? `<div class="vsec"><div class="lbl">الوصفة</div><ol class="rxl">${v.rx.map(r => `<li><span><span class="dr">${esc(r.drug)}</span> <span class="dd">${esc(rxLine(r))}</span></span></li>`).join('')}</ol></div>` : ''}
  ${v.followup ? `<div class="vsec"><div class="lbl">المتابعة</div><div class="txt">${esc(fmtDate(v.followup))}</div></div>` : ''}`;
}
function vitalsTrend(vs) {
  const pts = [...vs].reverse().filter(v => v.vitals && (v.vitals.weight || v.vitals.bps));
  if (pts.length < 2) return '';
  const W_ = 560, H = 170, L = 36, R = 12, T = 14, B = 26;
  const x = i => L + (pts.length === 1 ? 0 : i * (W_ - L - R) / (pts.length - 1));
  const line = (key, color, lab, unit, filter) => {
    const ser = pts.map((v, i) => ({ i, v: +(filter ? filter(v.vitals) : v.vitals[key]) || null, d: v.date })).filter(o => o.v);
    if (ser.length < 2) return null;
    return { ser, color, lab, unit };
  };
  const series = [line('weight', 'var(--s1)', 'الوزن', 'كغ'), line('bps', 'var(--s2)', 'الضغط الانقباضي', 'mmHg')].filter(Boolean);
  if (!series.length) return '';
  // one chart per measure (no dual axis)
  return series.map(s => {
    const vals = s.ser.map(o => o.v);
    let mn = Math.min(...vals), mx = Math.max(...vals);
    const padv = Math.max(1, (mx - mn) * 0.15); mn = Math.floor(mn - padv); mx = Math.ceil(mx + padv);
    const y = v => T + (H - T - B) * (1 - (v - mn) / (mx - mn || 1));
    const ticks = [mn, Math.round((mn + mx) / 2), mx];
    const path = s.ser.map((o, j) => `${j ? 'L' : 'M'}${x(o.i).toFixed(1)},${y(o.v).toFixed(1)}`).join('');
    const last = s.ser[s.ser.length - 1];
    return `<div style="margin-top:14px"><div class="legend"><span><i style="background:${s.color}"></i>${s.lab} (${s.unit})</span></div><div class="chart"><svg viewBox="0 0 ${W_} ${H}" dir="ltr" role="img" aria-label="${s.lab} عبر الزيارات">
      ${ticks.map(t => `<line x1="${L}" x2="${W_ - R}" y1="${y(t)}" y2="${y(t)}" stroke="var(--grid)" stroke-width="1"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${t}</text>`).join('')}
      <path d="${path}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${s.ser.map(o => `<circle cx="${x(o.i)}" cy="${y(o.v)}" r="${o === last ? 5 : 3.5}" fill="${s.color}" stroke="var(--surface)" stroke-width="2"/><circle cx="${x(o.i)}" cy="${y(o.v)}" r="12" fill="transparent" data-tip="${esc(fmtDate(o.d))}\n${s.lab}: ${o.v} ${s.unit}"/>`).join('')}
      ${s.ser.filter((o, j) => j === 0 || j === s.ser.length - 1).map(o => `<text x="${x(o.i)}" y="${H - 8}" text-anchor="middle">${esc(fmtShort(o.d))}</text>`).join('')}
      <text x="${x(last.i) - 8}" y="${y(last.v) - 10}" text-anchor="end" style="fill:var(--ink);font-weight:700">${last.v}</text>
    </svg></div></div>`;
  }).join('');
}

function visitCard(v, opts = {}) {
  const inv = v.invoiceId && byId('invoices', v.invoiceId);
  const ic = inv && invCalc(inv);
  return `<article class="visit"><div class="visit-h"><div><span class="d">${esc(fmtDayFull(v.date))}</span> <span class="muted" style="font-size:.85rem">${esc(APPT_TYPES[v.type] || '')}</span>${ic ? ` · ${pill(ic.status, INV_STATUS[ic.status])}` : ''}</div>
    <div class="acts">${(v.rx || []).length ? `<button class="btn sm" data-act="printRx" data-id="${v.id}">طباعة الوصفة</button>` : ''}${(v.labs || []).length ? `<button class="btn sm ghost" data-act="printLabs" data-id="${v.id}">طلب التحاليل</button>` : ''}${W() ? `<button class="btn sm ghost" data-act="editVisit" data-id="${v.id}">تعديل</button><button class="btn sm ghost danger" data-act="delVisit" data-id="${v.id}">حذف</button>` : ''}</div></div>
    ${opts.showPatient ? `<div><button class="link" data-act="openPatient" data-id="${v.patientId}">${esc(pName(v.patientId))}</button></div>` : ''}
    ${(v.diagnoses || []).length ? `<div class="vsec"><div class="dxs">${v.diagnoses.map(d => `<span>${esc(d)}</span>`).join('')}</div></div>` : ''}
    ${v.complaint ? `<div class="vsec"><div class="lbl">الشكوى</div><div class="txt">${esc(v.complaint)}</div></div>` : ''}
    ${v.hpi ? `<div class="vsec"><div class="lbl">التاريخ المرضي</div><div class="txt">${esc(v.hpi)}</div></div>` : ''}
    ${vitalsList(v.vitals).length ? `<div class="vsec"><div class="lbl">العلامات الحيوية</div>${vitalsHtml(v.vitals)}</div>` : ''}
    ${v.exam ? `<div class="vsec"><div class="lbl">الفحص السريري</div><div class="txt">${esc(v.exam)}</div></div>` : ''}
    ${(v.rx || []).length ? `<div class="vsec"><div class="lbl">الوصفة</div><ol class="rxl">${v.rx.map(r => `<li><span><span class="dr">${esc(r.drug)}</span> <span class="dd">${esc(rxLine(r))}</span></span></li>`).join('')}</ol></div>` : ''}
    ${(v.labs || []).length ? `<div class="vsec"><div class="lbl">تحاليل وأشعة</div><div class="txt">${v.labs.map(l => esc(l.name) + (l.result ? ` <b>← ${esc(l.result)}</b>` : ' <span class="muted">(بانتظار النتيجة)</span>')).join('<br>')}</div></div>` : ''}
    ${v.procedures ? `<div class="vsec"><div class="lbl">إجراءات</div><div class="txt">${esc(v.procedures)}</div></div>` : ''}
    ${v.plan ? `<div class="vsec"><div class="lbl">الخطة والتعليمات</div><div class="txt">${esc(v.plan)}</div></div>` : ''}
    ${v.followup ? `<div class="vsec"><div class="lbl">المتابعة</div><div class="txt">${esc(fmtDayFull(v.followup))}</div></div>` : ''}
    ${v.privateNotes ? `<div class="vsec"><div class="lbl">ملاحظات خاصة بالطبيب</div><div class="txt muted">${esc(v.privateNotes)}</div></div>` : ''}
  </article>`;
}
function pVisits(p, { vs }) {
  if (!vs.length) return `<div class="panel">${emptyBox('لا كشوفات', '<br>ابدأ أول كشف لهذا المريض.', 'visitFor', 'كشف جديد', p.id)}</div>`;
  return `<div class="tl">${vs.map(v => visitCard(v)).join('')}</div>`;
}
function pRx(p, { vs }) {
  const withRx = vs.filter(v => (v.rx || []).length);
  if (!withRx.length) return `<div class="panel">${emptyBox('لا وصفات', '<br>تُحفظ الوصفة مع كل كشف.', '', '')}</div>`;
  return `<div class="tl">${withRx.map(v => `<article class="visit"><div class="visit-h"><div><span class="d">${esc(fmtDate(v.date))}</span> <span class="muted">${esc((v.diagnoses || []).join('، '))}</span></div><div class="acts"><button class="btn sm" data-act="printRx" data-id="${v.id}">طباعة</button>${W() ? `<button class="btn sm ghost" data-act="repeatRx" data-id="${v.id}">تكرار في كشف جديد</button>` : ''}</div></div>
    <div class="vsec"><ol class="rxl">${v.rx.map(r => `<li><span><span class="dr">${esc(r.drug)}</span> <span class="dd">${esc(rxLine(r))}</span></span></li>`).join('')}</ol></div></article>`).join('')}</div>`;
}
function pLabs(p, { labs }) {
  if (!labs.length) return `<div class="panel">${emptyBox('لا تحاليل أو أشعة', '<br>اطلبها من شاشة الكشف، ثم سجّل النتائج هنا.', '', '')}</div>`;
  labs.sort((a, b) => b.v.date.localeCompare(a.v.date));
  return `<div class="tbl"><table><thead><tr><th>الفحص</th><th>تاريخ الطلب</th><th>النتيجة</th><th>تاريخ النتيجة</th><th></th></tr></thead><tbody>${labs.map(({ v, l, i }) => `<tr><td><b>${esc(l.name)}</b></td><td class="muted">${esc(fmtDate(v.date))}</td><td>${l.result ? `<span style="white-space:pre-wrap">${esc(l.result)}</span>${l.flag === 'abnormal' ? ' ' + pill('bad', 'غير طبيعي') : l.flag === 'normal' ? ' ' + pill('ok', 'طبيعي') : ''}` : pill('warn', 'بانتظار النتيجة')}</td><td class="muted">${l.resultDate ? esc(fmtDate(l.resultDate)) : ''}</td><td><div class="acts">${W() ? `<button class="btn sm" data-act="labResult" data-id="${v.id}|${i}">${l.result ? 'تعديل' : 'إدخال النتيجة'}</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div>`;
}
function pFiles(p, { files }) {
  const can = W();
  let h = `<div class="head" style="margin-bottom:12px"><div class="grow muted" style="font-size:.9rem">صور التحاليل والسونار والأشعة والتقارير الخارجية (صور أو PDF حتى 20 ميغابايت).</div>${can ? `<label class="btn primary" style="cursor:pointer">${icon('<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>')}رفع ملف<input type="file" id="upFile" accept="image/*,application/pdf" data-change="upload" data-pid="${p.id}" hidden multiple></label>` : ''}</div>`;
  if (!files.length) return h + `<div class="panel"><div class="empty"><b>لا مرفقات</b>ارفع صورة تحليل أو أشعة لتبقى في ملف المريض.</div></div>`;
  return h + `<div class="files">${[...files].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).map(f => {
    const src = f.data || (f.path ? Cloud.thumb(f.path) : '');
    const isImg = (f.type || '').startsWith('image/');
    const open = f.data || f.path ? `data-act="openFile" data-id="${f.id}" href="#"` : `href="${src}" target="_blank" rel="noopener"`;
    return `<div class="file"><a class="th" ${open}>${isImg ? `<img src="${src}" alt="${esc(f.name)}" loading="lazy" data-blob="1">` : icon('<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>')}</a>
      <div class="fi"><b title="${esc(f.name)}">${esc(f.title || f.name)}</b><span class="muted">${esc(f.cat || '')} · ${esc(fmtShort(f.date))}</span></div>
      <div class="fa"><a class="btn sm" ${open}>فتح</a>${W() ?`<button class="btn sm ghost danger" data-act="delFile" data-id="${f.id}">حذف</button>` : ''}</div></div>`;
  }).join('')}</div>`;
}
function pBilling(p, { inv }) {
  const tot = sum(inv, i => invCalc(i).total), paid = sum(inv, i => invCalc(i).paid);
  let h = `<div class="kpis k3"><div class="kpi"><div class="l">إجمالي الفواتير</div><div class="v">${money(tot)}</div></div><div class="kpi good"><div class="l">المدفوع</div><div class="v">${money(paid)}</div></div><div class="kpi ${tot - paid > 0 ? 'bad' : ''}"><div class="l">المستحق</div><div class="v">${money(Math.max(0, tot - paid))}</div></div></div>`;
  if (!inv.length) return h + `<div class="panel">${emptyBox('لا فواتير', '', 'newInvoice', 'فاتورة جديدة', p.id)}</div>`;
  return h + invoiceTable(inv, false);
}
function pDocs(p, { reps }) {
  let h = W() ? `<div class="head" style="margin-bottom:12px"><div class="grow"></div><button class="btn primary" data-act="newReport" data-id="${p.id}">تقرير أو إجازة جديدة</button></div>` : '';
  if (!reps.length) return h + `<div class="panel"><div class="empty"><b>لا تقارير صادرة</b>أصدر تقريرًا طبيًا أو إجازة مرضية أو خطاب تحويل.</div></div>`;
  return h + `<div class="tbl"><table><thead><tr><th>النوع</th><th>التاريخ</th><th>التفاصيل</th><th></th></tr></thead><tbody>${[...reps].sort((a, b) => b.date.localeCompare(a.date)).map(r => `<tr><td><b>${esc(REPORT_TYPES[r.type] || r.type)}</b></td><td class="muted">${esc(fmtDate(r.date))}</td><td>${r.type === 'leave' ? `${r.days} يوم من ${esc(fmtShort(r.from))}` : esc((r.body || '').slice(0, 80))}${r.to ? ' · إلى ' + esc(r.to) : ''}</td><td><div class="acts"><button class="btn sm" data-act="printReport" data-id="${r.id}">طباعة</button>${W() ? `<button class="btn sm ghost danger" data-act="delReport" data-id="${r.id}">حذف</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div>`;
}
function pAppts(p) {
  const list = apptsOf(p.id).reverse();
  if (!list.length) return `<div class="panel">${emptyBox('لا مواعيد', '', 'newApptFor', 'حجز موعد', p.id)}</div>`;
  const ns = list.filter(a => a.status === 'noshow').length;
  return `${ns ? `<div class="banner" style="margin-bottom:12px">لم يحضر هذا المريض ${ns} موعد سابقًا.</div>` : ''}<div class="tbl"><table><thead><tr><th>التاريخ</th><th>الوقت</th><th>النوع</th><th>السبب</th><th>الحالة</th><th></th></tr></thead><tbody>${list.map(a => `<tr><td>${esc(fmtDayFull(a.date))}</td><td class="num">${esc(fmtTime(a.time))}</td><td>${esc(APPT_TYPES[a.type] || '')}</td><td class="muted">${esc(a.reason || '')}</td><td>${stPill(a.status)}</td><td><div class="acts">${W() ? `<button class="btn sm ghost" data-act="apptMenu" data-id="${a.id}">خيارات</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div>`;
}
ACT.delVisit = id => confirmBox('حذف هذا الكشف من السجل الطبي نهائيًا؟ الفاتورة المرتبطة به لن تُحذف.', async () => { await remove('visits', id); toast('حُذف الكشف'); });
ACT.editVisit = id => openVisit(id);
ACT.repeatRx = id => { const v = byId('visits', id); if (v) openVisit(null, { patientId: v.patientId, rx: JSON.parse(JSON.stringify(v.rx || [])) }); };

ACT.patientSummary = pid => {
  const p = pat(pid); if (!p) return;
  const vs = visitsOf(pid);
  const lastV = vs.find(v => vitalsList(v.vitals).length);
  const inner = `<h1>ملخص الملف الطبي</h1>
    <div class="meta"><span>الاسم: <b>${esc(p.name)}</b></span><span>رقم الملف: <b>${fileNo(p)}</b></span>${p.dob ? `<span>العمر: <b>${esc(ageLabel(p.dob))}</b></span>` : ''}${p.gender ? `<span>الجنس: <b>${esc(p.gender)}</b></span>` : ''}${p.blood ? `<span>الفصيلة: <b dir="ltr">${esc(p.blood)}</b></span>` : ''}</div>
    <table><tbody>${[['الحساسية', p.allergies || 'لا توجد'], ['أمراض مزمنة', p.chronic || 'لا توجد'], ['أدوية حالية', p.currentMeds], ['عمليات سابقة', p.surgeries], ['تاريخ عائلي', p.familyHx]].filter(r => r[1]).map(r => `<tr><th style="width:30%">${r[0]}</th><td>${esc(r[1])}</td></tr>`).join('')}</tbody></table>
    ${lastV ? `<h3 style="margin:16px 0 6px;font-size:15px">آخر قياسات (${esc(fmtDate(lastV.date))})</h3><p>${vitalsList(lastV.vitals).map(x => `${esc(x.l)}: <b dir="ltr">${esc(x.v)}</b> ${esc(x.u)}`).join(' · ')}</p>` : ''}
    <h3 style="margin:16px 0 6px;font-size:15px">الزيارات (${vs.length})</h3>
    ${vs.length ? `<table><thead><tr><th>التاريخ</th><th>التشخيص</th><th>العلاج</th></tr></thead><tbody>${vs.slice(0, 15).map(v => `<tr><td style="white-space:nowrap">${esc(fmtDate(v.date))}</td><td>${esc((v.diagnoses || []).join('، ') || v.complaint || '')}</td><td>${(v.rx || []).map(r => esc(r.drug)).join('، ')}</td></tr>`).join('')}</tbody></table>` : '<p>لا زيارات.</p>'}`;
  showDoc('ملخص الملف الطبي', inner, `ملخص-${p.name}`);
};

/* ---------- prescriptions & lab request documents ---------- */
function patientMeta(p, date) {
  return `<div class="meta"><span>الاسم: <b>${esc(p?.name || '')}</b></span>${p?.dob ? `<span>العمر: <b>${esc(ageLabel(p.dob))}</b></span>` : ''}${p?.gender ? `<span>الجنس: <b>${esc(p.gender)}</b></span>` : ''}<span>رقم الملف: <b>${fileNo(p)}</b></span><span>التاريخ: <b>${esc(fmtDate(date))}</b></span></div>`;
}
ACT.printRx = id => {
  const v = byId('visits', id); if (!v) return;
  const p = pat(v.patientId);
  const inner = `${patientMeta(p, v.date)}${p?.allergies ? `<p style="color:#b2212d"><b>حساسية:</b> ${esc(p.allergies)}</p>` : ''}${p?.pregnancy ? `<p style="color:#b2212d"><b>${esc(p.pregnancy)}</b></p>` : ''}
    ${(v.diagnoses || []).length ? `<p><b>التشخيص:</b> ${esc(v.diagnoses.join('، '))}</p>` : ''}
    <div class="rxsym">℞</div>
    <ol>${(v.rx || []).map(r => `<li style="margin-bottom:8px"><b>${esc(r.drug)}</b>${r.form ? ` (${esc(r.form)})` : ''}<br><span>${esc([r.dose, r.freq, r.duration ? 'لمدة ' + r.duration : ''].filter(Boolean).join(' — '))}</span>${r.notes ? `<br><small>${esc(r.notes)}</small>` : ''}</li>`).join('')}</ol>
    ${v.plan ? `<p><b>تعليمات:</b> ${esc(v.plan)}</p>` : ''}${v.followup ? `<p><b>موعد المراجعة:</b> ${esc(fmtDayFull(v.followup))}</p>` : ''}`;
  showDoc('وصفة طبية', inner, `وصفة-${p?.name || ''}-${v.date}`);
};
ACT.printLabs = id => {
  const v = byId('visits', id); if (!v) return;
  const p = pat(v.patientId);
  const inner = `<h1>طلب تحاليل / أشعة</h1>${patientMeta(p, v.date)}${(v.diagnoses || []).length ? `<p><b>التشخيص المبدئي:</b> ${esc(v.diagnoses.join('، '))}</p>` : ''}
    <table><thead><tr><th style="width:40px">#</th><th>الفحص المطلوب</th><th>ملاحظات</th></tr></thead><tbody>${(v.labs || []).map((l, i) => `<tr><td>${i + 1}</td><td><b>${esc(l.name)}</b></td><td>${esc(l.note || '')}</td></tr>`).join('')}</tbody></table>`;
  showDoc('طلب تحاليل', inner, `طلب-تحاليل-${p?.name || ''}-${v.date}`);
};
ACT.labResult = key => {
  const [vid, idx] = key.split('|'); const v = byId('visits', vid); if (!v) return;
  const l = (v.labs || [])[+idx]; if (!l) return;
  openModal('نتيجة: ' + l.name, `<form id="mForm" class="form"><div class="full muted">${esc(pName(v.patientId))} · طُلب ${esc(fmtDate(v.date))}</div>
    <label class="full">النتيجة *<textarea id="lr_res" name="result" rows="3" required placeholder="مثل: HbA1c 7.2%">${esc(l.result)}</textarea></label>
    <label>تاريخ النتيجة<input id="lr_date" name="resultDate" type="date" value="${esc(l.resultDate || today())}"></label>
    <label>التقييم<select id="lr_flag" name="flag">${opts([['', '—'], ['normal', 'طبيعي'], ['abnormal', 'غير طبيعي']], l.flag)}</select></label>
    ${mfoot('حفظ النتيجة')}</form>`, {
    submit: async d => {
      const labs = JSON.parse(JSON.stringify(v.labs)); labs[+idx] = { ...labs[+idx], ...d };
      await patch('visits', vid, { labs }); toast('حُفظت نتيجة ' + l.name); return true;
    }
  });
};

/* ---------- attachments ---------- */
CHG.upload = async t => {
  const pid = t.dataset.pid, fl = [...t.files]; t.value = '';
  if (!fl.length || !W()) return;
  const f0 = fl[0];
  openModal(fl.length > 1 ? `رفع ${fl.length} ملفات` : 'رفع ملف', `<form id="mForm" class="form">
    <div class="full muted">${fl.map(f => esc(f.name)).join('<br>')}</div>
    ${fl.length === 1 ? `<label class="full">العنوان<input id="up_t" name="title" value="${esc(f0.name.replace(/\.[^.]+$/, ''))}"></label>` : ''}
    <label>النوع<select id="up_c" name="cat">${opts(FILE_CATS, (f0.type || '').includes('pdf') ? 'تقرير' : 'تحليل')}</select></label>
    <label>التاريخ<input id="up_d" name="date" type="date" value="${today()}"></label>
    ${mfoot('رفع')}</form>`, {
    submit: async d => {
      let ok = 0;
      for (const f of fl) {
        if (f.size > 20 * 1024 * 1024) { toast(`${f.name}: الملف أكبر من 20 ميغابايت`); continue; }
        const rec = { id: uid('f'), patientId: pid, name: f.name, title: fl.length === 1 ? (d.title || f.name) : f.name.replace(/\.[^.]+$/, ''), cat: d.cat, date: d.date || today() };
        if (app.mode === 'demo') {
          // التجربة: الملف يبقى في الذاكرة حتى إغلاق الصفحة
          const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
          await save('files', { ...rec, data, type: f.type, size: f.size });
          ok++; continue;
        }
        try {
          const r = await Cloud.upload(f);
          await save('files', { ...rec, path: r.path, type: r.contentType, size: r.sizeBytes });
          ok++;
        } catch (e) {
          toast(f.name + ': ' + ({ cloud_too_large: 'الملف كبير جدًا', cloud_denied: 'لا صلاحية لرفع الملفات' }[e && e.code] || 'تعذّر الرفع. تحقق من الاتصال.'));
        }
      }
      if (ok) toast(ok === 1 ? 'رُفع الملف' : `رُفع ${ok} ملفات`);
      return true;
    }
  });
};
ACT.openFile = async id => {
  const f = byId('files', id); if (!f) return;
  if (f.path) {
    // the window opens before the await so popup blockers allow it
    const w = window.open('', '_blank');
    try { const url = await Cloud.signedUrl(f.path); if (w) w.location.href = url; else location.href = url; }
    catch (e) { if (w) w.close(); toast('تعذّر فتح الملف. تحقق من الاتصال.'); }
    return;
  }
  if (!f.data) return;
  const url = URL.createObjectURL(await (await fetch(f.data)).blob());
  const w = window.open(url, '_blank');
  if (!w) downloadFile(f.name, await (await fetch(f.data)).blob());
};
ACT.delFile = id => {
  const f = byId('files', id); if (!f) return;
  confirmBox(`حذف «${esc(f.title || f.name)}» نهائيًا من ملف المريض؟`, async () => {
    if (f.path && app.mode === 'cloud') { try { await Cloud.delFile(f.path); } catch (e) { toast('تعذّر حذف الملف. تحقق من الاتصال.'); throw e; } }
    await remove('files', id); toast('حُذف الملف');
  });
};

/* ---------- medical reports / sick leave ---------- */
ACT.newReport = pid => reportForm(pid);
function reportTemplate(type, p, d) {
  const lv = lastVisit(p.id);
  const dx = lv ? (lv.diagnoses || []).join('، ') : '';
  const who = `${p.gender === 'أنثى' ? 'المريضة' : 'المريض'} ${p.name}${p.dob ? `، العمر ${ageLabel(p.dob)}` : ''}`;
  if (type === 'leave') return `راجع${p.gender === 'أنثى' ? 'ت' : ''} ${who} العيادة بتاريخ ${fmtDate(d.date || today())}${dx ? ` وتبيّن أنه${p.gender === 'أنثى' ? 'ا' : ''} يعاني من ${dx}` : ''}، ويحتاج${p.gender === 'أنثى' ? '' : ''} إلى راحة مرضية.`;
  if (type === 'referral') return `الزميل الكريم،\nنحيل إليكم ${who}${dx ? ` لديه تشخيص مبدئي: ${dx}` : ''}، للتكرم بالفحص والتقييم وإبداء الرأي.\nمع الشكر والتقدير.`;
  if (type === 'fitness') return `بعد الفحص السريري لـ${who}، تبيّن أنه${p.gender === 'أنثى' ? 'ا' : ''} لائق${p.gender === 'أنثى' ? 'ة' : ''} صحيًا ولا يعاني${p.gender === 'أنثى' ? '' : ''} من أمراض معدية ظاهرة وقت الفحص.`;
  if (type === 'attendance') return `نفيد بأن ${who} راجع${p.gender === 'أنثى' ? 'ت' : ''} العيادة بتاريخ ${fmtDate(d.date || today())} من الساعة ____ إلى الساعة ____.`;
  return `راجع${p.gender === 'أنثى' ? 'ت' : ''} ${who} العيادة${dx ? `، وبعد الفحص تبيّن: ${dx}` : ''}.\n`;
}
function reportForm(pid, type = 'report') {
  if (!W()) return;
  const p = pat(pid); if (!p) return;
  openModal('إصدار مستند طبي', `<form id="mForm" class="form">
    <div class="full"><b>${esc(p.name)}</b> <span class="muted">${fileNo(p)}</span></div>
    <label>النوع<select id="r_type" name="type" data-change="repType" data-pid="${pid}">${opts(Object.entries(REPORT_TYPES), type)}</select></label>
    <label>تاريخ الإصدار<input id="r_date" name="date" type="date" value="${today()}"></label>
    <label class="r-leave" ${type === 'leave' ? '' : 'hidden'}>عدد أيام الإجازة<input id="r_days" name="days" type="number" min="1" max="90" value="3"></label>
    <label class="r-leave" ${type === 'leave' ? '' : 'hidden'}>تبدأ من<input id="r_from" name="from" type="date" value="${today()}"></label>
    <label class="full r-ref" ${type === 'referral' ? '' : 'hidden'}>مُحال إلى<input id="r_to" name="to" placeholder="مثل: استشاري أمراض القلب — مستشفى…"></label>
    <label class="full">نص المستند<textarea id="r_body" name="body" rows="6">${esc(reportTemplate(type, p, {}))}</textarea></label>
    <label class="full">يُعطى إلى<input id="r_for" name="forWhom" placeholder="مثل: جهة العمل، المدرسة — اختياري"></label>
    ${mfoot('حفظ ومعاينة')}</form>`, {
    submit: async d => {
      const r = { id: uid('r'), patientId: pid, ...d, days: +d.days || 0 };
      await save('reports', r); closeModal(); ACT.printReport(r.id); return 'handled';
    }
  });
}
CHG.repType = t => {
  const p = pat(t.dataset.pid);
  $$('.r-leave').forEach(e => e.hidden = t.value !== 'leave');
  $$('.r-ref').forEach(e => e.hidden = t.value !== 'referral');
  $('#r_body').value = reportTemplate(t.value, p, { date: $('#r_date').value });
};
ACT.printReport = id => {
  const r = byId('reports', id); if (!r) return;
  const p = pat(r.patientId);
  const to = r.type === 'leave' && r.from ? addDays(r.from, (r.days || 1) - 1) : '';
  const inner = `<h1>${esc(REPORT_TYPES[r.type] || 'تقرير طبي')}</h1>${patientMeta(p, r.date)}
    ${r.forWhom ? `<p>إلى: <b>${esc(r.forWhom)}</b></p>` : ''}${r.to ? `<p>مُحال إلى: <b>${esc(r.to)}</b></p>` : ''}
    <p style="white-space:pre-wrap;font-size:15px;line-height:2">${esc(r.body)}</p>
    ${r.type === 'leave' ? `<table><tbody><tr><th>مدة الإجازة</th><td><b>${r.days} يوم</b></td></tr><tr><th>من</th><td>${esc(fmtDayFull(r.from))}</td></tr><tr><th>إلى</th><td>${esc(fmtDayFull(to))}</td></tr></tbody></table>` : ''}
    <p style="font-size:12px;color:#666;margin-top:14px">أُعطي هذا المستند بناءً على طلب صاحب العلاقة دون أدنى مسؤولية على العيادة تجاه الغير.</p>`;
  showDoc(REPORT_TYPES[r.type] || 'تقرير', inner, `${REPORT_TYPES[r.type] || 'تقرير'}-${p?.name || ''}-${r.date}`);
};
ACT.delReport = id => confirmBox('حذف هذا المستند من السجل؟', async () => { await remove('reports', id); toast('حُذف المستند'); });

/* ================= VISIT (ENCOUNTER) SCREEN ================= */
function openVisit(id, ctx = {}) {
  ui.prev = { route: ui.route, param: ui.param };
  ui.vctx = ctx;
  nav('visit', id || 'new');
}
let VS = null; // working state of the open visit form
VIEWS.visit = {
  shell(param) {
    const existing = param !== 'new' ? byId('visits', param) : null;
    const ctx = ui.vctx || {};
    const pid = existing ? existing.patientId : ctx.patientId;
    const appt = ctx.appointmentId ? byId('appointments', ctx.appointmentId) : null;
    const draftKey = existing ? 'v:' + existing.id : 'v:new:' + (pid || '') + ':' + (ctx.appointmentId || '');
    const draft = lsGet(draftKey);
    const base = existing ? JSON.parse(JSON.stringify(existing)) : {
      patientId: pid || '', date: today(), type: appt?.type || (pid && visitsOf(pid).length ? 'followup' : 'new'),
      complaint: appt?.reason || '', diagnoses: [], rx: ctx.rx || [], labs: [], vitals: {}, appointmentId: ctx.appointmentId || ''
    };
    VS = { existing, draftKey, v: draft && !existing ? { ...base, ...draft.v } : (draft && existing && draft.v.updatedAt === existing.updatedAt ? { ...base, ...draft.v } : base), restored: !!draft, bill: draft?.bill || null };
    if (!VS.v.rx.length) VS.v.rx.push({});
    const v = VS.v, vt = v.vitals || {};
    const p = pat(v.patientId);
    const svc = defaultBill(v);
    VS.bill = VS.bill || svc;
    return `<div class="head"><div class="grow"><h1>${existing ? 'تعديل الكشف' : 'كشف جديد'}</h1><div class="sub">${p ? `<button class="link" data-act="openPatient" data-id="${p.id}">${esc(p.name)}</button> · ${fileNo(p)}${p.dob ? ' · ' + esc(ageLabel(p.dob)) : ''}${p.gender ? ' · ' + esc(p.gender) : ''}` : 'اختر المريض'}</div></div>
      ${VS.restored ? `<span class="pill p-accent">استُعيدت مسودة غير محفوظة</span><button class="btn sm ghost" data-act="discardDraft">تجاهل المسودة</button>` : ''}</div>
    <form id="visitForm" data-form="visit" autocomplete="off" data-input="vDraft" data-change="vDraft">
    <div class="ve"><div>
      ${!p ? `<div class="fs"><h3>المريض</h3><label class="fl">المريض *<select id="v_pid" name="patientId" required data-change="vPatient">${patOpts(v.patientId)}</select></label></div>` : `<input type="hidden" name="patientId" value="${esc(v.patientId)}">`}
      <div class="fs"><h3>الزيارة</h3><div class="form f3">
        <label>التاريخ<input id="v_date" name="date" type="date" value="${esc(v.date)}"></label>
        <label>النوع<select id="v_type" name="type" data-change="vType">${opts(Object.entries(APPT_TYPES), v.type)}</select></label>
        <label>الشكوى الرئيسية<input id="v_cc" name="complaint" value="${esc(v.complaint)}" placeholder="مثل: صداع منذ 3 أيام"></label>
        <label class="full">التاريخ المرضي والأعراض<textarea id="v_hpi" name="hpi" rows="3" placeholder="بداية الأعراض، مدتها، شدتها، ما يزيدها أو يخففها…">${esc(v.hpi)}</textarea></label>
      </div></div>

      <div class="fs"><h3>العلامات الحيوية <span class="muted">القيم خارج المعدل الطبيعي تظهر باللون الأحمر في الملف</span></h3><div class="form f4">
        <label>ضغط الدم<div class="bp"><input id="v_bps" name="vt_bps" type="number" inputmode="numeric" placeholder="120" value="${esc(vt.bps)}" aria-label="الانقباضي"><span>/</span><input id="v_bpd" name="vt_bpd" type="number" inputmode="numeric" placeholder="80" value="${esc(vt.bpd)}" aria-label="الانبساطي"></div></label>
        <label>النبض<div class="unit"><input id="v_pulse" name="vt_pulse" type="number" inputmode="numeric" value="${esc(vt.pulse)}"><em>نبضة/د</em></div></label>
        <label>الحرارة<div class="unit"><input id="v_temp" name="vt_temp" type="number" step="0.1" inputmode="decimal" value="${esc(vt.temp)}"><em>°C</em></div></label>
        <label>تشبع الأكسجين<div class="unit"><input id="v_spo2" name="vt_spo2" type="number" inputmode="numeric" value="${esc(vt.spo2)}"><em>%</em></div></label>
        <label>الوزن<div class="unit"><input id="v_w" name="vt_weight" type="number" step="0.1" inputmode="decimal" value="${esc(vt.weight)}" data-input="bmi"><em>كغ</em></div></label>
        <label>الطول<div class="unit"><input id="v_h" name="vt_height" type="number" inputmode="numeric" value="${esc(vt.height || lastHeight(v.patientId))}" data-input="bmi"><em>سم</em></div></label>
        <label>التنفس<div class="unit"><input id="v_rr" name="vt_rr" type="number" inputmode="numeric" value="${esc(vt.rr)}"><em>/د</em></div></label>
        <label>سكر عشوائي<div class="unit"><input id="v_sugar" name="vt_sugar" type="number" inputmode="numeric" value="${esc(vt.sugar)}"><em>mg/dL</em></div></label>
      </div><div class="bmi" id="bmiOut"></div></div>

      <div class="fs"><h3>الفحص السريري</h3><textarea id="v_exam" name="exam" rows="3" style="width:100%" placeholder="الفحص العام والموضعي">${esc(v.exam)}</textarea></div>

      <div class="fs"><h3>التشخيص</h3>
        <div class="chips" id="dxChips"></div>
        <div class="tagin" style="margin-top:8px"><input id="dxIn" list="dxList" placeholder="اكتب التشخيص ثم Enter" data-keyenter="addDx"><button type="button" class="btn" data-act="addDx">إضافة</button></div>
        <datalist id="dxList">${knownDiagnoses().map(d => `<option value="${esc(d)}">`).join('')}</datalist>
      </div>

      <div class="fs"><h3>الوصفة الطبية <span style="display:flex;gap:6px">${lastRx(v.patientId, existing?.id) ? `<button type="button" class="btn sm" data-act="copyLastRx">نسخ آخر وصفة</button>` : ''}<button type="button" class="btn sm" data-act="addRx">+ دواء</button></span></h3>
        <div class="rx-scroll"><table class="rx-t"><thead><tr><th style="width:26%">الدواء</th><th style="width:12%">الشكل</th><th style="width:13%">الجرعة</th><th style="width:17%">التكرار</th><th style="width:11%">المدة</th><th>ملاحظات</th><th></th></tr></thead><tbody id="rxBody"></tbody></table></div>
        <datalist id="medList">${D.meds.map(m => `<option value="${esc(m.name)}">`).join('')}</datalist>
        <datalist id="durList">${['3 أيام', '5 أيام', '7 أيام', '10 أيام', '14 يومًا', 'شهر', '3 أشهر', 'مستمر'].map(x => `<option value="${x}">`).join('')}</datalist>
        ${p && p.allergies ? `<div class="flag bad" style="margin-top:10px"><b>انتبه — حساسية:</b>${esc(p.allergies)}</div>` : ''}
        <div id="rxWarn"></div>
      </div>

      <div class="fs"><h3>التحاليل والأشعة المطلوبة</h3>
        <div class="chips" id="labToggles"></div>
        <div class="tagin" style="margin-top:8px"><input id="labIn" placeholder="فحص آخر…" data-keyenter="addLab"><button type="button" class="btn" data-act="addLab">إضافة</button></div>
      </div>

      <div class="fs"><h3>الخطة والمتابعة</h3><div class="form">
        <label class="full">الخطة والتعليمات للمريض<textarea id="v_plan" name="plan" rows="3" placeholder="تظهر في الوصفة المطبوعة: الراحة، الحمية، متى يعود…">${esc(v.plan)}</textarea></label>
        <label class="full">إجراءات تمت في العيادة<input id="v_proc" name="procedures" value="${esc(v.procedures)}" placeholder="مثل: غيار جرح، حقنة عضلية، تخطيط قلب"></label>
        <label>موعد المراجعة<input id="v_fu" name="followup" type="date" value="${esc(v.followup)}" min="${today()}"></label>
        <div class="fl">بعد<div class="chips">${[3, 7, 14, 30, 90].map(n => `<button type="button" class="tog" data-act="fuIn" data-id="${n}">${n === 30 ? 'شهر' : n === 90 ? '3 أشهر' : n + ' أيام'}</button>`).join('')}</div></div>
        ${!existing ? `<label class="chk full"><input type="checkbox" id="v_book" name="bookFU" ${v.followup ? 'checked' : ''}> احجز موعد المراجعة تلقائيًا في أقرب وقت متاح من ذلك اليوم</label>` : ''}
        <label class="full">ملاحظات خاصة بالطبيب (لا تُطبع)<textarea id="v_priv" name="privateNotes" rows="2">${esc(v.privateNotes)}</textarea></label>
      </div></div>

      ${!existing || !existing.invoiceId ? `<div class="fs" id="billBox"><h3>المحاسبة <label class="chk" style="font-weight:500"><input type="checkbox" id="b_on" name="billOn" ${VS.bill.on ? 'checked' : ''} data-change="billOn"> إصدار فاتورة لهذا الكشف</label></h3><div id="billInner"></div></div>` : `<div class="fs"><h3>المحاسبة</h3><div class="muted">لهذا الكشف فاتورة رقم ${byId('invoices', existing.invoiceId)?.no || ''}. <button type="button" class="link" data-act="openInvoice" data-id="${existing.invoiceId}">عرض الفاتورة</button></div></div>`}
      <div id="pErr" class="err" hidden></div>
    </div>
    <aside class="ve-aside">${visitAside(v.patientId, existing?.id)}</aside></div>
    <div class="ve-foot"><button class="btn primary" type="submit" name="go" value="save">${icon('<path d="M5 12l5 5L20 7"/>')}حفظ الكشف</button>
      <button class="btn" type="submit" name="go" value="print" data-act="submitPrint">حفظ وطباعة الوصفة</button>
      <button class="btn ghost" type="button" data-act="cancelVisit">إلغاء</button>
      <div class="sum" id="veSum"></div></div>
    </form><div id="vbody" hidden></div>`;
  },
  body: () => '',
  noWait: false,
  mount() { drawDx(); drawRx(); drawLabs(); drawBill(); updBmi(); rxCheck(); },
  leave() { VS = null; }
};
function lastHeight(pid) { if (!pid) return ''; const v = visitsOf(pid).find(x => x.vitals && x.vitals.height); return v ? v.vitals.height : ''; }
function lastRx(pid, exceptId) { if (!pid) return null; return visitsOf(pid).find(x => x.id !== exceptId && (x.rx || []).length); }
function knownDiagnoses() { const s = new Set(); D.visits.forEach(v => (v.diagnoses || []).forEach(d => s.add(d))); return [...s].sort((a, b) => a.localeCompare(b, 'ar')).slice(0, 400); }
function visitAside(pid, exceptId) {
  const p = pat(pid); if (!p) return `<div class="panel"><div class="pb muted">اختر المريض لعرض ملخص ملفه هنا.</div></div>`;
  const vs = visitsOf(pid).filter(v => v.id !== exceptId);
  const lv = vs[0], lvt = vs.find(v => vitalsList(v.vitals).length);
  return `<section class="panel"><div class="ph"><h3>ملخص الملف</h3><button type="button" class="btn sm ghost" data-act="openPatient" data-id="${pid}">فتح</button></div><div class="pb" style="display:flex;flex-direction:column;gap:8px;font-size:.9rem">
    ${p.allergies ? `<div class="flag bad"><b>حساسية:</b>${esc(p.allergies)}</div>` : '<div class="muted">لا حساسية مسجلة.</div>'}
    ${p.pregnancy ? `<div class="flag bad"><b>تنبيه:</b>${p.pregnancy === 'حامل' ? 'المريضة حامل' : 'المريضة مرضع'}</div>` : ''}
    ${p.chronic ? `<div class="flag warn"><b>مزمن:</b>${esc(p.chronic)}</div>` : ''}
    ${p.currentMeds ? `<div class="flag info"><b>أدوية حالية:</b>${esc(p.currentMeds)}</div>` : ''}
    <div>عدد الزيارات السابقة: <b>${vs.length}</b>${balanceOf(pid) > 0 ? ` · <span style="color:var(--danger)">مستحق ${money(balanceOf(pid))}</span>` : ''}</div></div></section>
    ${lv ? `<section class="panel"><div class="ph"><h3>الزيارة السابقة</h3><span class="muted">${esc(fmtDate(lv.date))}</span></div><div class="pb">${visitBrief(lv)}</div></section>` : ''}
    ${lvt ? `<section class="panel"><div class="ph"><h3>آخر قياسات</h3><span class="muted">${esc(fmtShort(lvt.date))}</span></div><div class="pb">${vitalsHtml(lvt.vitals)}</div></section>` : ''}
    ${vs.length > 1 ? `<section class="panel"><div class="ph"><h3>زيارات أقدم</h3></div><ul class="list">${vs.slice(1, 6).map(v => `<li><div class="grow"><div class="s">${esc(fmtDate(v.date))}</div><div>${esc((v.diagnoses || []).join('، ') || v.complaint || '—')}</div></div></li>`).join('')}</ul></section>` : ''}`;
}

/* --- diagnoses --- */
function drawDx() {
  const box = $('#dxChips'); if (!box || !VS) return;
  box.innerHTML = VS.v.diagnoses.length ? VS.v.diagnoses.map((d, i) => `<span class="chip on">${esc(d)}<button type="button" data-act="rmDx" data-id="${i}" aria-label="إزالة">×</button></span>`).join('') : '<span class="muted" style="font-size:.88rem">لم يُضف تشخيص بعد.</span>';
}
ACT.addDx = () => { const i = $('#dxIn'); const val = i.value.trim(); if (!val) return; if (!VS.v.diagnoses.includes(val)) VS.v.diagnoses.push(val); i.value = ''; drawDx(); saveDraft(); i.focus(); };
ACT.rmDx = i => { VS.v.diagnoses.splice(+i, 1); drawDx(); saveDraft(); };
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.dataset && e.target.dataset.keyenter) { e.preventDefault(); ACT[e.target.dataset.keyenter](); }
});

/* --- prescription rows --- */
function readRx() {
  const rows = $$('#rxBody tr');
  if (!rows.length || !VS) return;
  VS.v.rx = rows.map(tr => ({ drug: $('[data-k=drug]', tr).value.trim(), form: $('[data-k=form]', tr).value, dose: $('[data-k=dose]', tr).value.trim(), freq: $('[data-k=freq]', tr).value, duration: $('[data-k=duration]', tr).value.trim(), notes: $('[data-k=notes]', tr).value.trim() }));
}
function drawRx() {
  const b = $('#rxBody'); if (!b || !VS) return;
  b.innerHTML = VS.v.rx.map((r, i) => `<tr><td><input data-k="drug" list="medList" value="${esc(r.drug)}" placeholder="اسم الدواء وتركيزه" data-change="rxDrug" data-i="${i}" aria-label="الدواء ${i + 1}"></td>
    <td><select data-k="form" aria-label="الشكل">${opts(FORMS, r.form, '—')}</select></td>
    <td><input data-k="dose" value="${esc(r.dose)}" placeholder="قرص واحد" aria-label="الجرعة"></td>
    <td><select data-k="freq" aria-label="التكرار">${opts(FREQS, r.freq, '—')}</select></td>
    <td><input data-k="duration" list="durList" value="${esc(r.duration)}" placeholder="7 أيام" aria-label="المدة"></td>
    <td><input data-k="notes" value="${esc(r.notes)}" placeholder="بعد الأكل" aria-label="ملاحظات"></td>
    <td class="del"><button type="button" class="btn sm ghost danger" data-act="rmRx" data-id="${i}" aria-label="حذف السطر">×</button></td></tr>`).join('');
}
ACT.addRx = () => { readRx(); VS.v.rx.push({}); drawRx(); const ins = $$('#rxBody [data-k=drug]'); ins[ins.length - 1]?.focus(); };
ACT.rmRx = i => { readRx(); VS.v.rx.splice(+i, 1); if (!VS.v.rx.length) VS.v.rx.push({}); drawRx(); saveDraft(); rxCheck(); };
ACT.copyLastRx = () => { const lv = lastRx(VS.v.patientId, VS.existing?.id); if (!lv) return; readRx(); VS.v.rx = VS.v.rx.filter(r => r.drug).concat(JSON.parse(JSON.stringify(lv.rx))); drawRx(); saveDraft(); rxCheck(); toast('نُسخت وصفة ' + fmtDate(lv.date)); };
CHG.rxDrug = t => {
  const m = D.meds.find(x => norm(x.name) === norm(t.value));
  const tr = t.closest('tr');
  if (m && tr) {
    const set = (k, v) => { const el = $(`[data-k=${k}]`, tr); if (el && !el.value && v) el.value = v; };
    set('form', m.form); set('dose', m.dose); set('freq', m.freq); set('duration', m.duration); set('notes', m.notes);
  }
  readRx(); rxCheck(); saveDraft();
};
function rxCheck() {
  const box = $('#rxWarn'); if (!box || !VS) return;
  const p = pat(VS.v.patientId); const warn = [];
  readRx();
  if (p && p.allergies) {
    const al = norm(p.allergies).split(/[،,;\s]+/).filter(w => w.length >= 4);
    VS.v.rx.forEach(r => { const d = norm(r.drug); if (d && al.some(a => d.includes(a) || a.includes(d.split(' ')[0]))) warn.push(`«${r.drug}» قد يتعارض مع حساسية المريض (${p.allergies}).`); });
  }
  if (p && p.pregnancy && VS.v.rx.some(r => r.drug)) warn.push(`المريضة ${p.pregnancy}؛ تأكد من سلامة كل دواء في الوصفة أثناء ${p.pregnancy === 'حامل' ? 'الحمل' : 'الرضاعة'}.`);
  const names = VS.v.rx.map(r => norm(r.drug)).filter(Boolean);
  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  if (dup.length) warn.push('يوجد دواء مكرر في الوصفة.');
  box.innerHTML = warn.map(w => `<div class="flag bad" style="margin-top:8px"><b>تحقق:</b>${esc(w)}</div>`).join('');
}

/* --- labs --- */
function drawLabs() {
  const b = $('#labToggles'); if (!b || !VS) return;
  const sel = new Set(VS.v.labs.map(l => l.name));
  const extra = VS.v.labs.filter(l => !COMMON_LABS.includes(l.name));
  b.innerHTML = COMMON_LABS.map(n => `<button type="button" class="tog" data-act="togLab" data-id="${esc(n)}" aria-pressed="${sel.has(n)}">${esc(n)}</button>`).join('') + extra.map(l => `<span class="chip on">${esc(l.name)}<button type="button" data-act="togLab" data-id="${esc(l.name)}" aria-label="إزالة">×</button></span>`).join('');
}
ACT.togLab = n => { const i = VS.v.labs.findIndex(l => l.name === n); if (i >= 0) { if (VS.v.labs[i].result && !confirmLabRemove()) return; VS.v.labs.splice(i, 1); } else VS.v.labs.push({ name: n }); drawLabs(); saveDraft(); drawBill(); };
function confirmLabRemove() { toast('لهذا الفحص نتيجة مسجلة؛ أُزيل من الطلب مع نتيجته.'); return true; }
ACT.addLab = () => { const i = $('#labIn'); const v = i.value.trim(); if (!v) return; if (!VS.v.labs.some(l => l.name === v)) VS.v.labs.push({ name: v }); i.value = ''; drawLabs(); saveDraft(); };

/* --- follow-up, bmi --- */
ACT.fuIn = n => { const base = $('#v_date').value || today(); let d = addDays(base, +n); for (let i = 0; i < 7 && !isWorkDay(d) && (S.workDays || []).length; i++) d = addDays(d, 1); $('#v_fu').value = d;const b = $('#v_book'); if (b) b.checked = true; saveDraft(); };
function updBmi() {
  const o = $('#bmiOut'); if (!o) return;
  const b = bmi($('#v_w')?.value, $('#v_h')?.value);
  o.innerHTML = b ? `مؤشر كتلة الجسم: <b>${b.toFixed(1)}</b> — ${bmiLabel(b)}` : '';
}
INP.bmi = () => { updBmi(); saveDraft(); };

/* --- billing inside the visit --- */
function defaultBill(v) {
  const svcs = [...D.services].sort((a, b) => (a.order || 0) - (b.order || 0));
  const pick = svcs.find(s => v.type === 'followup' ? /متابع|مراجع/.test(s.name) : /كشف|استشار/.test(s.name)) || svcs[0];
  const followFree = v.type === 'followup' && pick && !/متابع|مراجع/.test(pick.name);
  return { on: !!svcs.length, items: pick && !followFree ? [{ sid: pick.id, name: pick.name, qty: 1, price: +pick.price || 0 }] : [], discount: 0, pay: 'full', method: 'نقدي', paidAmt: '' };
}
function drawBill() {
  const box = $('#billInner'); if (!box || !VS) return;
  const B = VS.bill;
  if (!B.on) { box.innerHTML = '<div class="muted" style="font-size:.9rem">لن تُصدر فاتورة. يمكنك إصدارها لاحقًا من ملف المريض.</div>'; updSum(); return; }
  if (!D.services.length) { box.innerHTML = `<div class="muted" style="font-size:.9rem">أضف الخدمات وأسعارها من <button type="button" class="link" data-act="nav" data-id="settings">الإعدادات</button> لتظهر هنا، أو أضف بندًا يدويًا.</div>${billItemsHtml(B)}`; updSum(); return; }
  const chosen = new Set(B.items.map(i => i.sid));
  box.innerHTML = `<div class="chips" style="margin-bottom:10px">${D.services.map(s => `<button type="button" class="tog" data-act="togSvc" data-id="${s.id}" aria-pressed="${chosen.has(s.id)}">${esc(s.name)} · ${num(s.price)}</button>`).join('')}</div>${billItemsHtml(B)}`;
  updSum();
}
function billItemsHtml(B) {
  const c = invCalc({ items: B.items, discount: B.discount });
  return `<div class="rx-scroll"><table class="items-t" style="min-width:420px"><thead><tr><th>البند</th><th style="width:70px">الكمية</th><th style="width:110px">السعر</th><th style="width:34px"></th></tr></thead><tbody>
    ${B.items.map((it, i) => `<tr><td><input value="${esc(it.name)}" data-bi="${i}" data-bk="name" data-input="billEdit" aria-label="البند"></td><td><input type="number" min="1" value="${esc(it.qty || 1)}" data-bi="${i}" data-bk="qty" data-input="billEdit" aria-label="الكمية"></td><td><input type="number" min="0" step="any" value="${esc(it.price)}" data-bi="${i}" data-bk="price" data-input="billEdit" aria-label="السعر"></td><td><button type="button" class="btn sm ghost danger" data-act="rmBillItem" data-id="${i}" aria-label="حذف">×</button></td></tr>`).join('')}
    </tbody></table></div><button type="button" class="btn sm ghost" data-act="addBillItem" style="margin-top:4px">+ بند يدوي</button>
    <div class="form f4" style="margin-top:10px">
      <label>الخصم<input type="number" min="0" step="any" id="b_disc" value="${esc(B.discount || '')}" data-input="billDisc"></label>
      <label>الدفع<select id="b_pay" data-change="billPay">${opts([['full', 'دفع كامل الآن'], ['part', 'دفع جزئي'], ['none', 'آجل']], B.pay)}</select></label>
      <label ${B.pay === 'part' ? '' : 'hidden'} id="b_amtL">المبلغ المدفوع<input type="number" min="0" step="any" id="b_amt" value="${esc(B.paidAmt)}" data-input="billAmt"></label>
      <label ${B.pay === 'none' ? 'hidden' : ''}>طريقة الدفع<select id="b_method" data-change="billMethod">${opts(PAY_METHODS, B.method)}</select></label>
    </div><div style="margin-top:8px;font-size:.95rem">الإجمالي: <b>${money(c.total)}</b></div>`;
}
function updSum() {
  const s = $('#veSum'); if (!s || !VS) return;
  const B = VS.bill; const c = invCalc({ items: B.items, discount: B.discount });
  s.innerHTML = B.on && c.total ? `الفاتورة: <b>${money(c.total)}</b>${B.pay === 'none' ? ' — آجل' : B.pay === 'part' ? ` — يُدفع ${num(B.paidAmt)}` : ''}` : '';
}
CHG.billOn = t => { VS.bill.on = t.checked; drawBill(); saveDraft(); };
ACT.togSvc = sid => { const B = VS.bill; const i = B.items.findIndex(x => x.sid === sid); if (i >= 0) B.items.splice(i, 1); else { const s = byId('services', sid); B.items.push({ sid, name: s.name, qty: 1, price: +s.price || 0 }); } drawBill(); saveDraft(); };
ACT.addBillItem = () => { VS.bill.items.push({ name: '', qty: 1, price: 0 }); drawBill(); };
ACT.rmBillItem = i => { VS.bill.items.splice(+i, 1); drawBill(); saveDraft(); };
INP.billEdit = t => { const it = VS.bill.items[+t.dataset.bi]; if (!it) return; it[t.dataset.bk] = t.dataset.bk === 'name' ? t.value : +t.value; updSum(); saveDraft(); };
INP.billDisc = t => { VS.bill.discount = +t.value || 0; updSum(); saveDraft(); };
INP.billAmt = t => { VS.bill.paidAmt = t.value; updSum(); saveDraft(); };
CHG.billPay = t => { VS.bill.pay = t.value; drawBill(); saveDraft(); };
CHG.billMethod = t => { VS.bill.method = t.value; saveDraft(); };
CHG.vType = t => { if (!VS) return; VS.v.type = t.value; if (!VS.existing && VS.bill.on) { const nb = defaultBill(VS.v); VS.bill.items = nb.items; drawBill(); } saveDraft(); };
CHG.vPatient = t => { if (!VS) return; collectVisit(); VS.v.patientId = t.value; ui.vctx = { ...(ui.vctx || {}), patientId: t.value }; lsSet(VS.draftKey, null); buildShell(); };

/* --- draft persistence (local, per viewer) --- */
function collectVisit() {
  const f = $('#visitForm'); if (!f || !VS) return VS && VS.v;
  const fd = new FormData(f), v = VS.v;
  ['patientId', 'date', 'type', 'complaint', 'hpi', 'exam', 'plan', 'procedures', 'followup', 'privateNotes'].forEach(k => { if (fd.has(k)) v[k] = String(fd.get(k) || '').trim(); });
  const vt = {};
  ['bps', 'bpd', 'pulse', 'temp', 'spo2', 'weight', 'height', 'rr', 'sugar'].forEach(k => { const x = fd.get('vt_' + k); if (x !== null && x !== '') vt[k] = +x; });
  v.vitals = vt;
  readRx();
  return v;
}
const saveDraft = debounce(() => { if (!VS) return; collectVisit(); lsSet(VS.draftKey, { v: VS.v, bill: VS.bill, at: Date.now() }); }, 600);
INP.vDraft = () => saveDraft();
CHG.vDraft = () => saveDraft();
ACT.discardDraft = () => { if (!VS) return; lsSet(VS.draftKey, null); buildShell(); };
ACT.cancelVisit = () => {
  const goBack = () => { if (VS) lsSet(VS.draftKey, null); const pv = ui.prev; if (pv && pv.route !== 'visit') nav(pv.route, pv.param); else nav('home'); };
  collectVisit();
  const dirty = VS && (VS.v.diagnoses.length || VS.v.rx.some(r => r.drug) || VS.v.complaint || VS.v.hpi || VS.v.exam);
  if (dirty && !VS.existing) confirmBox('الخروج دون حفظ الكشف؟ ستُفقد البيانات المدخلة.', async () => goBack(), 'خروج دون حفظ');
  else goBack();
};
ACT.submitPrint = (id, b, e) => { const f = $('#visitForm'); f.dataset.print = '1'; f.requestSubmit(); };

PAGEFORMS.visit = async (data, fd, form) => {
  const printAfter = form.dataset.print === '1'; form.dataset.print = '';
  const v = collectVisit();
  const err = m => { const e = $('#pErr'); e.textContent = m; e.hidden = false; e.scrollIntoView({ block: 'center', behavior: 'smooth' }); return false; };
  if (!v.patientId) return err('اختر المريض.');
  if ($('#dxIn') && $('#dxIn').value.trim()) ACT.addDx();
  v.rx = v.rx.filter(r => r.drug);
  if (!v.diagnoses.length && !v.complaint) return err('أضف تشخيصًا أو الشكوى الرئيسية على الأقل.');
  const isNew = !VS.existing;
  const obj = { ...(VS.existing || {}), ...v, id: VS.existing ? VS.existing.id : uid('v') };
  // bill
  const B = VS.bill;
  let invoice = null;
  if (isNew || !obj.invoiceId) {
    if (B.on && B.items.filter(i => i.name).length) {
      const items = B.items.filter(i => i.name).map(i => ({ name: i.name, qty: +i.qty || 1, price: +i.price || 0, sid: i.sid || '' }));
      const c = invCalc({ items, discount: B.discount });
      const paidAmt = B.pay === 'full' ? c.total : B.pay === 'part' ? Math.min(c.total, +B.paidAmt || 0) : 0;
      invoice = { id: uid('i'), no: nextInvNo(), patientId: obj.patientId, visitId: obj.id, date: obj.date, items, discount: +B.discount || 0, payments: paidAmt > 0 ? [{ date: today(), amount: paidAmt, method: B.method }] : [], notes: '' };
      obj.invoiceId = invoice.id;
    }
  }
  await save('visits', obj);
  if (invoice) await save('invoices', invoice);
  if (obj.appointmentId) { const a = byId('appointments', obj.appointmentId); if (a && a.status !== 'done') await save('appointments', { ...a, status: 'done', doneAt: Date.now() }); }
  else if (isNew) {
    const a = D.appointments.find(x => x.patientId === obj.patientId && x.date === obj.date && ['waiting', 'in', 'booked', 'confirmed'].includes(x.status));
    if (a) { obj.appointmentId = a.id; await save('appointments', { ...a, status: 'done', doneAt: Date.now() }); await save('visits', obj); }
  }
  // follow-up booking
  if (isNew && obj.followup && fd.get('bookFU')) {
    let d = obj.followup, slot = null;
    for (let i = 0; i < 14 && !slot; i++) { const f = freeSlots(addDays(obj.followup, i))[0]; if (f) { d = addDays(obj.followup, i); slot = f.time; } }
    await save('appointments', { id: uid('a'), patientId: obj.patientId, date: d, time: slot || S.start || '10:00', type: 'followup', reason: 'مراجعة' + ((obj.diagnoses || [])[0] ? ': ' + obj.diagnoses[0] : ''), status: 'booked', fromVisit: obj.id });
    if (d !== obj.followup) { obj.followup = d; await save('visits', obj); }
    toast(`حُجزت المراجعة ${fmtDayFull(d)} ${fmtTime(slot || S.start)}`);
  }
  // learn new medicines into the library
  for (const r of obj.rx) {
    if (!D.meds.some(m => norm(m.name) === norm(r.drug))) await save('meds', { id: uid('m'), name: r.drug, form: r.form || '', dose: r.dose || '', freq: r.freq || '', duration: r.duration || '', notes: r.notes || '' }).catch(() => { });
  }
  lsSet(VS.draftKey, null);
  ui.ptab = 'visits';
  const pid = obj.patientId;
  VS = null;
  nav('patient', pid);
  if (!obj.followup || !fd.get('bookFU')) toast('حُفظ الكشف في ملف ' + pName(pid));
  if (printAfter && obj.rx.length) ACT.printRx(obj.id);
  else if (printAfter) toast('لا توجد أدوية في الوصفة لطباعتها');
  return false;
};
