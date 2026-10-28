'use strict';
/* ============================================================
   extras.js — waiting-room screen, daily cash close, appointment card
   ============================================================ */

/* ---------- waiting-room display (for a TV in the waiting hall) ---------- */
const shortName = n => { const w = String(n || '').trim().split(/\s+/); return w.length > 1 ? `${w[0]} ${w[1][0]}.` : w[0] || ''; };
let tvLastIn = null, tvAudio = null;
function tvBeep() {
  try {
    tvAudio = tvAudio || new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.28].forEach((d, i) => {
      const o = tvAudio.createOscillator(), g = tvAudio.createGain();
      o.frequency.value = i ? 660 : 880; o.connect(g); g.connect(tvAudio.destination);
      g.gain.setValueAtTime(0.0001, tvAudio.currentTime + d);
      g.gain.exponentialRampToValueAtTime(0.25, tvAudio.currentTime + d + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, tvAudio.currentTime + d + 0.25);
      o.start(tvAudio.currentTime + d); o.stop(tvAudio.currentTime + d + 0.3);
    });
  } catch (e) { }
}
VIEWS.tv = {
  shell: () => `<div id="vbody"></div>`,
  body() {
    const t = today();
    const ap = D.appointments.filter(a => a.date === t);
    const cur = ap.find(a => a.status === 'in');
    const waiting = ap.filter(a => a.status === 'waiting').sort((a, b) => (a.arrivedAt || 0) - (b.arrivedAt || 0) || a.time.localeCompare(b.time));
    const curId = cur ? cur.id : null;
    if (tvLastIn !== null && curId && curId !== tvLastIn) tvBeep();
    tvLastIn = curId || '';
    const d = new Date();
    const clock = fmtTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
    return `<div class="tv"><div class="tv-h"><div><b>${esc(clinicName())}</b><span>${esc(docName())}${S.specialty ? ' — ' + esc(S.specialty) : ''}</span></div><div class="tv-clock">${esc(clock)}<span>${esc(fmtDayFull(t))}</span></div></div>
      <div class="tv-main"><section class="tv-now"><span class="lbl">في غرفة الكشف الآن</span>${cur ? `<b>${esc(shortName(pName(cur.patientId)))}</b><em>ملف ${fileNo(pat(cur.patientId))}</em>` : `<b class="idle">—</b><em>الطبيب سيستقبل المريض التالي قريبًا</em>`}</section>
      <section class="tv-next"><span class="lbl">الدور</span>${waiting.length ? `<ol>${waiting.slice(0, 6).map((a, i) => `<li><span class="n">${i + 1}</span><span class="nm">${esc(shortName(pName(a.patientId)))}</span><span class="fn">${fileNo(pat(a.patientId))}</span></li>`).join('')}</ol>${waiting.length > 6 ? `<p>و ${waiting.length - 6} آخرين بالانتظار</p>` : ''}` : '<p class="empty-q">لا أحد في الانتظار</p>'}</section></div>
      <div class="tv-foot"><span>نتمنى لكم الشفاء العاجل</span><span class="tv-acts"><button class="btn sm" data-act="tvFull">ملء الشاشة</button><button class="btn sm" data-act="nav" data-id="home">رجوع</button></span></div></div>`;
  },
  mount() { document.body.classList.add('tv-mode'); tvLastIn = null; },
  leave() { document.body.classList.remove('tv-mode'); try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { } }
};
ACT.tv = () => nav('tv');
ACT.tvFull = () => { tvBeep(); try { const p = document.documentElement.requestFullscreen?.(); p && p.catch(() => toast('ملء الشاشة غير متاح هنا. استخدم زر F11 في المتصفح.')); } catch (e) { toast('ملء الشاشة غير متاح هنا.'); } };

/* ---------- daily cash close ---------- */
function cashRows(iso) {
  const rows = [];
  D.invoices.forEach(i => (i.payments || []).forEach(p => { if (p.date === iso && +p.amount > 0) rows.push({ inv: i, p }); }));
  return rows.sort((a, b) => (a.inv.no || 0) - (b.inv.no || 0));
}
ACT.cashClose = iso => {
  iso = iso && /^\d{4}-/.test(iso) ? iso : today();
  const rows = cashRows(iso);
  const byM = {}; rows.forEach(r => { const m = r.p.method || 'نقدي'; byM[m] = (byM[m] || 0) + (+r.p.amount || 0); });
  const exps = D.expenses.filter(e => e.date === iso);
  const tin = sum(rows, r => r.p.amount), tout = sum(exps, e => e.amount);
  const cashIn = byM['نقدي'] || 0, cashOut = sum(exps.filter(e => (e.method || 'نقدي') === 'نقدي'), e => e.amount);
  const visits = D.visits.filter(v => v.date === iso).length;
  const dueNew = sum(D.invoices.filter(i => i.date === iso), i => invCalc(i).due);
  const inner = `<h1>كشف الصندوق اليومي</h1><div class="meta"><span>اليوم: <b>${esc(fmtDayFull(iso))}</b></span><span>الكشوفات: <b>${visits}</b></span><span>عدد الدفعات: <b>${rows.length}</b></span></div>
    <table><tbody>${Object.entries(byM).map(([m, v]) => `<tr><th>${esc(m)}</th><td>${esc(moneyT(v))}</td></tr>`).join('')}
    <tr><th>مجموع المقبوضات</th><td><b>${esc(moneyT(tin))}</b></td></tr><tr><th>المصروفات</th><td>${esc(moneyT(tout))}</td></tr>
    <tr><th>الصافي</th><td><b>${esc(moneyT(tin - tout))}</b></td></tr><tr><th>النقد المتوقع في الدرج</th><td><b>${esc(moneyT(cashIn - cashOut))}</b></td></tr>
    ${dueNew ? `<tr><th>ديون جديدة (آجل اليوم)</th><td>${esc(moneyT(dueNew))}</td></tr>` : ''}</tbody></table>
    ${rows.length ? `<h3 style="font-size:15px;margin:16px 0 6px">تفاصيل المقبوضات</h3><table><thead><tr><th>الفاتورة</th><th>المريض</th><th>البند</th><th>الطريقة</th><th>المبلغ</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r.inv.no}</td><td>${esc(pName(r.inv.patientId))}</td><td>${esc((r.inv.items || []).map(x => x.name).join('، '))}</td><td>${esc(r.p.method || '')}</td><td>${esc(num(r.p.amount))}</td></tr>`).join('')}</tbody></table>` : '<p>لا مقبوضات في هذا اليوم.</p>'}
    ${exps.length ? `<h3 style="font-size:15px;margin:16px 0 6px">المصروفات</h3><table><tbody>${exps.map(e => `<tr><td>${esc(e.category)}</td><td>${esc(e.desc || '')}</td><td>${esc(num(e.amount))}</td></tr>`).join('')}</tbody></table>` : ''}
    <p style="margin-top:14px">النقد الفعلي في الدرج: ____________ &nbsp;&nbsp; الفرق: ____________</p>`;
  showDoc('كشف الصندوق', inner, `صندوق-${iso}`);
};

/* ---------- appointment card for the patient ---------- */
ACT.apptCard = pid => {
  const p = pat(pid); if (!p) return;
  const next = apptsOf(pid).find(a => a.date >= today() && OPEN_STATUSES.includes(a.status));
  if (!next) { toast('لا يوجد موعد قادم لهذا المريض. احجز موعدًا أولًا.'); return; }
  const inner = `<h1>بطاقة مراجعة</h1><div class="meta"><span>الاسم: <b>${esc(p.name)}</b></span><span>رقم الملف: <b>${fileNo(p)}</b></span></div>
    <table><tbody><tr><th>موعد المراجعة</th><td><b style="font-size:17px">${esc(fmtDayFull(next.date))}</b></td></tr><tr><th>الساعة</th><td><b style="font-size:17px">${esc(fmtTime(next.time))}</b></td></tr>${next.reason ? `<tr><th>السبب</th><td>${esc(next.reason)}</td></tr>` : ''}</tbody></table>
    <p>يرجى الحضور قبل الموعد بعشر دقائق، وجلب الوصفة السابقة ونتائج التحاليل إن وجدت.${S.phone ? ` للاعتذار أو تغيير الموعد اتصل على <b dir="ltr">${esc(fmtPhone(S.phone))}</b>.` : ''}</p>`;
  showDoc('بطاقة مراجعة', inner, `بطاقة-مراجعة-${p.name}`);
};
