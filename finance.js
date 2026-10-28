'use strict';
/* ============================================================
   finance.js — invoices & payments, expenses, inventory, reports, settings
   ============================================================ */

const nextInvNo = () => Math.max(1000, ...D.invoices.map(i => +i.no || 0)) + 1;
const payDates = inv => (inv.payments || []).map(p => p.date);
const paidInMonth = k => sum(D.invoices, i => sum((i.payments || []).filter(p => monthKey(p.date) === k), p => p.amount));
const expInMonth = k => sum(D.expenses.filter(e => monthKey(e.date) === k), e => e.amount);

function periodRange(per, custom) {
  const t = today(), m = thisMonth();
  if (per === 'today') return [t, t];
  if (per === 'week') return [addDays(t, -6), t];
  if (per === 'month') return [m + '-01', m + '-31'];
  if (per === 'last') { const l = addMonths(m, -1); return [l + '-01', l + '-31']; }
  if (per === 'custom' && custom) return [custom + '-01', custom + '-31'];
  return ['0000', '9999'];
}
const PERIODS = [['today', 'اليوم'], ['week', 'آخر 7 أيام'], ['month', 'هذا الشهر'], ['last', 'الشهر الماضي'], ['custom', 'شهر محدد'], ['all', 'كل الفترات']];

/* ================= FINANCE ================= */
VIEWS.finance = {
  shell() {
    const f = ui.fin = { tab: 'invoices', period: 'month', status: 'all', month: thisMonth(), q: '', ...(ui.fin || {}) };
    return `<div class="head"><div class="grow"><h1>الحسابات</h1><div class="sub">الفواتير والمدفوعات والمصروفات</div></div>
      <label class="ctl" for="finPer">الفترة<select id="finPer" data-change="finPer">${opts(PERIODS, f.period)}</select></label>
      <label class="ctl" for="finMonth" ${f.period === 'custom' ? '' : 'hidden'} id="finMonthL">الشهر<input type="month" id="finMonth" value="${f.month}" data-change="finMonth"></label>
      ${f.tab === 'invoices' ? `<label class="ctl" for="finSt">الحالة<select id="finSt" data-change="finSt">${opts([['all', 'الكل'], ['due', 'عليها مستحقات'], ['paid', 'مدفوعة بالكامل']], f.status)}</select></label>
      <label class="ctl" for="finQ">بحث<input type="search" id="finQ" value="${esc(f.q)}" data-input="finQ" placeholder="اسم المريض أو رقم الفاتورة"></label>` : ''}
      <button class="btn" data-act="finExport">تصدير CSV</button><button class="btn" data-act="cashClose">كشف صندوق اليوم</button>
      ${W() ? (f.tab === 'invoices' ? `<button class="btn primary" data-act="newInvoice">فاتورة جديدة</button>` : `<button class="btn primary" data-act="newExpense">مصروف جديد</button>`) : ''}</div>
      <div class="tabs" role="tablist"><button role="tab" data-act="finTab" data-id="invoices" aria-selected="${f.tab === 'invoices'}">الفواتير والتحصيل</button><button role="tab" data-act="finTab" data-id="expenses" aria-selected="${f.tab === 'expenses'}">المصروفات</button><button role="tab" data-act="finTab" data-id="summary" aria-selected="${f.tab === 'summary'}">الصافي</button></div>
      <div id="vbody"></div>`;
  },
  body() {
    const f = ui.fin, [a, b] = periodRange(f.period, f.month);
    const inR = d => d >= a && d <= b;
    if (f.tab === 'expenses') return expensesBody(inR);
    if (f.tab === 'summary') return summaryBody(inR);
    let list = D.invoices.filter(i => inR(i.date));
    if (f.status === 'due') list = list.filter(i => invCalc(i).due > 0);
    if (f.status === 'paid') list = list.filter(i => invCalc(i).status === 'paid');
    if (f.q) { const n = norm(f.q); list = list.filter(i => norm(pName(i.patientId)).includes(n) || String(i.no) === f.q.trim()); }
    list.sort((x, y) => (y.no || 0) - (x.no || 0));
    const collected = sum(D.invoices, i => sum((i.payments || []).filter(p => inR(p.date)), p => p.amount));
    const billed = sum(list, i => invCalc(i).total), due = sum(list, i => invCalc(i).due);
    const allDue = sum(D.invoices, i => invCalc(i).due);
    return `<div class="kpis"><div class="kpi"><div class="l">قيمة الفواتير</div><div class="v">${money(billed)}</div><div class="h">${list.length} فاتورة</div></div>
      <div class="kpi good"><div class="l">المحصَّل في الفترة</div><div class="v">${money(collected)}</div><div class="h">بحسب تاريخ الدفع</div></div>
      <div class="kpi ${due ? 'bad' : ''}"><div class="l">مستحق من فواتير الفترة</div><div class="v">${money(due)}</div></div>
      <div class="kpi"><div class="l">إجمالي الذمم لكل الفترات</div><div class="v">${money(allDue)}</div><div class="h">${new Set(D.invoices.filter(i => invCalc(i).due > 0).map(i => i.patientId)).size} مريض</div></div></div>
      ${list.length ? invoiceTable(list, true) : `<div class="panel">${emptyBox('لا فواتير في هذه الفترة', '<br>تُنشأ الفاتورة من شاشة الكشف تلقائيًا، أو يدويًا من هنا.', 'newInvoice', 'فاتورة جديدة')}</div>`}`;
  }
};
ACT.finTab = t => { ui.fin.tab = t; buildShell(); };
CHG.finPer = t => { ui.fin.period = t.value; $('#finMonthL').hidden = t.value !== 'custom'; renderBody(); };
CHG.finMonth = t => { if (t.value) { ui.fin.month = t.value; renderBody(); } };
CHG.finSt = t => { ui.fin.status = t.value; renderBody(); };
INP.finQ = debounce(t => { ui.fin.q = t.value; renderBody(); }, 150);

function invoiceTable(list, showPatient) {
  return `<div class="tbl"><table><thead><tr><th>رقم</th><th>التاريخ</th>${showPatient ? '<th>المريض</th>' : ''}<th>البنود</th><th class="n">الإجمالي</th><th class="n">المدفوع</th><th class="n">المتبقي</th><th>الحالة</th><th></th></tr></thead><tbody>
    ${list.map(i => { const c = invCalc(i); return `<tr><td class="num"><button class="link" data-act="openInvoice" data-id="${i.id}">${i.no}</button></td><td class="muted">${esc(fmtDate(i.date))}</td>${showPatient ? `<td><button class="link" data-act="openPatient" data-id="${i.patientId}">${esc(pName(i.patientId))}</button></td>` : ''}
      <td>${esc((i.items || []).map(x => x.name + ((+x.qty || 1) > 1 ? ' ×' + x.qty : '')).join('، '))}</td><td class="n">${money(c.total)}</td><td class="n">${num(c.paid)}</td><td class="n">${c.due ? `<b style="color:var(--danger)">${num(c.due)}</b>` : '<span class="muted">—</span>'}</td><td>${pill(c.status, INV_STATUS[c.status])}</td>
      <td><div class="acts">${W() && c.due ? `<button class="btn sm primary" data-act="addPayment" data-id="${i.id}">تحصيل</button>` : ''}<button class="btn sm ghost" data-act="printReceipt" data-id="${i.id}">إيصال</button></div></td></tr>`; }).join('')}
    </tbody></table></div>`;
}

ACT.newInvoice = pid => invoiceForm(null, pid);
ACT.openInvoice = id => {
  const i = byId('invoices', id); if (!i) return;
  const c = invCalc(i);
  openModal(`فاتورة رقم ${i.no}`, `<div class="facts" style="margin-bottom:10px"><span>المريض <b>${esc(pName(i.patientId))}</b></span><span>التاريخ <b>${esc(fmtDate(i.date))}</b></span><span>${pill(c.status, INV_STATUS[c.status])}</span></div>
    <div class="tbl" style="margin-bottom:12px"><table style="min-width:0"><thead><tr><th>البند</th><th class="n">الكمية</th><th class="n">السعر</th><th class="n">المجموع</th></tr></thead><tbody>${(i.items || []).map(x => `<tr><td>${esc(x.name)}</td><td class="n">${x.qty || 1}</td><td class="n">${num(x.price)}</td><td class="n">${num((x.qty || 1) * x.price)}</td></tr>`).join('')}</tbody>
    <tfoot>${i.discount ? `<tr><td colspan="3">الخصم</td><td class="n">- ${num(i.discount)}</td></tr>` : ''}<tr><td colspan="3">الإجمالي</td><td class="n">${money(c.total)}</td></tr><tr><td colspan="3">المدفوع</td><td class="n">${num(c.paid)}</td></tr><tr><td colspan="3">المتبقي</td><td class="n">${num(c.due)}</td></tr></tfoot></table></div>
    ${(i.payments || []).length ? `<div class="fl" style="margin-bottom:4px">الدفعات</div><ul class="list" style="border:1px solid var(--line);border-radius:10px;margin-bottom:12px">${i.payments.map((p, k) => `<li><div class="grow">${esc(fmtDate(p.date))} · ${esc(p.method || '')}</div><b>${money(p.amount)}</b>${W() ? `<button class="btn sm ghost danger" data-act="delPayment" data-id="${i.id}|${k}" aria-label="حذف الدفعة">×</button>` : ''}</li>`).join('')}</ul>` : ''}
    ${i.notes ? `<p class="muted">${esc(i.notes)}</p>` : ''}
    <div class="m-foot">${W() && c.due ? `<button class="btn primary" data-act="addPayment" data-id="${i.id}">تسجيل دفعة</button>` : ''}<button class="btn" data-act="printReceipt" data-id="${i.id}">طباعة الإيصال</button>${W() ? `<button class="btn" data-act="editInvoice" data-id="${i.id}">تعديل</button><button class="btn danger" data-act="delInvoice" data-id="${i.id}">حذف</button>` : ''}<button class="btn" data-act="closeModal">إغلاق</button></div>`, { wide: true });
};
ACT.editInvoice = id => invoiceForm(byId('invoices', id));
ACT.delInvoice = id => confirmBox('حذف هذه الفاتورة ودفعاتها نهائيًا؟', async () => {
  const inv = byId('invoices', id);
  await remove('invoices', id);
  if (inv && inv.visitId) { const v = byId('visits', inv.visitId); if (v && v.invoiceId === id) await save('visits', { ...v, invoiceId: '' }); }
  toast('حُذفت الفاتورة');
});
ACT.delPayment = key => { const [id, k] = key.split('|'); const i = byId('invoices', id); if (!i) return; confirmBox(`حذف دفعة بقيمة ${moneyT(i.payments[+k].amount)}؟`, async () => { const payments = i.payments.filter((_, j) => j !== +k); await patch('invoices', id, { payments }); toast('حُذفت الدفعة'); }); };
ACT.addPayment = id => {
  const i = byId('invoices', id); if (!i) return; const c = invCalc(i);
  openModal(`تحصيل — فاتورة ${i.no}`, `<form id="mForm" class="form"><div class="full">${esc(pName(i.patientId))} · المتبقي <b>${money(c.due)}</b></div>
    <label>المبلغ *<input id="py_a" name="amount" type="number" min="0.01" step="any" max="${c.due}" value="${c.due}" required></label>
    <label>طريقة الدفع<select id="py_m" name="method">${opts(PAY_METHODS, 'نقدي')}</select></label>
    <label>التاريخ<input id="py_d" name="date" type="date" value="${today()}"></label>
    ${mfoot('تسجيل الدفعة')}</form>`, {
    submit: async d => {
      const amt = +d.amount; if (!(amt > 0)) return formErr('أدخل مبلغًا صحيحًا.');
      await patch('invoices', id, { payments: [...(i.payments || []), { date: d.date || today(), amount: Math.min(amt, c.due), method: d.method }] });
      toast(`سُجّلت دفعة ${moneyT(Math.min(amt, c.due))}`); return true;
    }
  });
};
ACT.printReceipt = id => {
  const i = byId('invoices', id); if (!i) return; const c = invCalc(i); const p = pat(i.patientId);
  const inner = `<h1>إيصال / فاتورة رقم ${i.no}</h1>${patientMeta(p, i.date)}
    <table><thead><tr><th>البند</th><th>الكمية</th><th>السعر</th><th>المجموع</th></tr></thead><tbody>${(i.items || []).map(x => `<tr><td>${esc(x.name)}</td><td>${x.qty || 1}</td><td>${num(x.price)}</td><td>${num((x.qty || 1) * x.price)}</td></tr>`).join('')}</tbody></table>
    <table style="margin-top:10px;width:60%;margin-inline-start:auto"><tbody>${i.discount ? `<tr><th>الخصم</th><td>${num(i.discount)}</td></tr>` : ''}<tr><th>الإجمالي</th><td><b>${esc(moneyT(c.total))}</b></td></tr><tr><th>المدفوع</th><td>${esc(moneyT(c.paid))}</td></tr><tr><th>المتبقي</th><td>${esc(moneyT(c.due))}</td></tr></tbody></table>
    ${(i.payments || []).length ? `<p style="font-size:13px">الدفعات: ${i.payments.map(x => `${esc(fmtDate(x.date))} — ${esc(moneyT(x.amount))} (${esc(x.method || '')})`).join(' · ')}</p>` : ''}`;
  showDoc(`إيصال ${i.no}`, inner, `إيصال-${i.no}`);
};

function invoiceForm(inv, pid) {
  if (!W()) return;
  const isNew = !inv;
  inv = inv ? JSON.parse(JSON.stringify(inv)) : { patientId: pid || '', date: today(), items: [], discount: 0, payments: [], notes: '' };
  if (!inv.items.length) inv.items.push({ name: '', qty: 1, price: 0 });
  const st = { items: inv.items };
  const draw = () => {
    const c = invCalc({ items: st.items, discount: +($('#iv_disc')?.value || inv.discount || 0) });
    $('#ivItems').innerHTML = st.items.map((x, k) => `<tr><td><input list="svcList" value="${esc(x.name)}" data-ik="${k}" data-f="name" aria-label="البند" placeholder="البند"></td><td><input type="number" min="1" value="${x.qty || 1}" data-ik="${k}" data-f="qty" aria-label="الكمية"></td><td><input type="number" min="0" step="any" value="${x.price}" data-ik="${k}" data-f="price" aria-label="السعر"></td><td><button type="button" class="btn sm ghost danger" data-ivdel="${k}" aria-label="حذف">×</button></td></tr>`).join('');
    $('#ivTotal').innerHTML = money(c.total);
  };
  openModal(isNew ? 'فاتورة جديدة' : `تعديل فاتورة ${inv.no}`, `<form id="mForm" class="form">
    <label class="full">المريض *<select id="iv_p" name="patientId" required>${patOpts(inv.patientId)}</select></label>
    <label>التاريخ<input id="iv_d" name="date" type="date" value="${esc(inv.date)}"></label>
    <label>الخصم<input id="iv_disc" name="discount" type="number" min="0" step="any" value="${esc(inv.discount || '')}"></label>
    ${D.services.length ? `<div class="full chips">${D.services.map(s => `<button type="button" class="tog" data-ivsvc="${s.id}">${esc(s.name)} · ${num(s.price)}</button>`).join('')}</div>` : ''}
    <div class="full"><table class="items-t"><thead><tr><th>البند</th><th style="width:70px">الكمية</th><th style="width:110px">السعر</th><th style="width:34px"></th></tr></thead><tbody id="ivItems"></tbody></table>
    <button type="button" class="btn sm ghost" id="ivAdd">+ بند</button> <span style="margin-inline-start:12px">الإجمالي: <b id="ivTotal"></b></span></div>
    <datalist id="svcList">${D.services.map(s => `<option value="${esc(s.name)}">`).join('')}</datalist>
    ${isNew ? `<label>المدفوع الآن<input id="iv_paid" name="paidNow" type="number" min="0" step="any" placeholder="اتركه فارغًا لدفع كامل المبلغ"></label><label>طريقة الدفع<select id="iv_m" name="method">${opts(PAY_METHODS, 'نقدي')}</select></label><label class="chk full"><input type="checkbox" name="deferred" id="iv_def"> آجل (لم يُدفع شيء)</label>` : ''}
    <label class="full">ملاحظات<input id="iv_n" name="notes" value="${esc(inv.notes)}"></label>
    ${mfoot(isNew ? 'إصدار الفاتورة' : 'حفظ')}</form>`, {
    wide: true,
    submit: async d => {
      const items = st.items.filter(x => x.name).map(x => ({ name: x.name, qty: +x.qty || 1, price: +x.price || 0 }));
      if (!d.patientId) return formErr('اختر المريض.');
      if (!items.length) return formErr('أضف بندًا واحدًا على الأقل.');
      const obj = { ...inv, patientId: d.patientId, date: d.date || today(), discount: +d.discount || 0, items, notes: d.notes };
      if (isNew) {
        obj.id = uid('i'); obj.no = nextInvNo();
        const c = invCalc(obj);
        const paid = d.deferred ? 0 : d.paidNow !== '' && d.paidNow != null ? Math.min(c.total, +d.paidNow || 0) : c.total;
        obj.payments = paid > 0 ? [{ date: today(), amount: paid, method: d.method }] : [];
      }
      await save('invoices', obj); toast(isNew ? `صدرت الفاتورة ${obj.no}` : 'حُفظت الفاتورة'); return true;
    }
  });
  draw();
  const box = $('#mBody');
  box.addEventListener('input', e => { const k = e.target.dataset.ik; if (k != null) { st.items[+k][e.target.dataset.f] = e.target.dataset.f === 'name' ? e.target.value : +e.target.value; if (e.target.dataset.f === 'name') { const s = D.services.find(x => x.name === e.target.value); if (s) { st.items[+k].price = +s.price; draw(); } } else $('#ivTotal').innerHTML = money(invCalc({ items: st.items, discount: +$('#iv_disc').value || 0 }).total); } if (e.target.id === 'iv_disc') $('#ivTotal').innerHTML = money(invCalc({ items: st.items, discount: +e.target.value || 0 }).total); });
  box.addEventListener('click', e => {
    const sv = e.target.closest('[data-ivsvc]'), dl = e.target.closest('[data-ivdel]');
    if (sv) { const s = byId('services', sv.dataset.ivsvc); const empty = st.items.findIndex(x => !x.name); const it = { name: s.name, qty: 1, price: +s.price || 0 }; if (empty >= 0) st.items[empty] = it; else st.items.push(it); draw(); }
    if (dl) { st.items.splice(+dl.dataset.ivdel, 1); if (!st.items.length) st.items.push({ name: '', qty: 1, price: 0 }); draw(); }
    if (e.target.id === 'ivAdd') { st.items.push({ name: '', qty: 1, price: 0 }); draw(); }
  });
}

/* ---------- expenses ---------- */
function expensesBody(inR) {
  const list = D.expenses.filter(e => inR(e.date)).sort((a, b) => b.date.localeCompare(a.date));
  const total = sum(list, e => e.amount);
  const byCat = {}; list.forEach(e => byCat[e.category] = (byCat[e.category] || 0) + (+e.amount || 0));
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const mx = cats.length ? cats[0][1] : 1;
  return `<div class="split"><div>${list.length ? `<div class="tbl"><table><thead><tr><th>التاريخ</th><th>البند</th><th>الفئة</th><th>طريقة الدفع</th><th class="n">المبلغ</th><th></th></tr></thead><tbody>${list.map(e => `<tr><td class="muted">${esc(fmtDate(e.date))}</td><td>${esc(e.desc || '')}</td><td>${pill('neutral', e.category)}</td><td class="muted">${esc(e.method || '')}</td><td class="n"><b>${money(e.amount)}</b></td><td><div class="acts">${W() ? `<button class="btn sm ghost" data-act="editExpense" data-id="${e.id}">تعديل</button><button class="btn sm ghost danger" data-act="delExpense" data-id="${e.id}">حذف</button>` : ''}</div></td></tr>`).join('')}</tbody><tfoot><tr><td colspan="4">الإجمالي</td><td class="n">${money(total)}</td><td></td></tr></tfoot></table></div>`
    : `<div class="panel">${emptyBox('لا مصروفات في هذه الفترة', '<br>سجّل الإيجار والرواتب والمستلزمات لتعرف صافي دخل العيادة.', 'newExpense', 'مصروف جديد')}</div>`}</div>
    <section class="panel"><div class="ph"><h3>حسب الفئة</h3><span class="muted">${money(total)}</span></div><div class="pb">${cats.length ? `<div class="hbars">${cats.map(([c, v]) => `<div class="hbar" data-tip="${esc(c)}: ${esc(moneyT(v))}"><span class="lb">${esc(c)}</span><span class="tr"><span class="fl" style="width:${(v / mx * 100).toFixed(1)}%;background:var(--s2)"></span></span><span class="vv">${num(v)}</span></div>`).join('')}</div>` : '<span class="muted">—</span>'}</div></section></div>`;
}
ACT.newExpense = () => expenseForm();
ACT.editExpense = id => expenseForm(byId('expenses', id));
ACT.delExpense = id => confirmBox('حذف هذا المصروف؟', async () => { await remove('expenses', id); toast('حُذف المصروف'); });
function expenseForm(e) {
  if (!W()) return;
  const isNew = !e; e = e || { date: today(), category: 'مستلزمات طبية', method: 'نقدي' };
  openModal(isNew ? 'مصروف جديد' : 'تعديل المصروف', `<form id="mForm" class="form">
    <label>التاريخ<input id="ex_d" name="date" type="date" value="${esc(e.date)}"></label>
    <label>الفئة<select id="ex_c" name="category">${opts(EXP_CATS, e.category)}</select></label>
    <label class="full">الوصف *<input id="ex_desc" name="desc" required value="${esc(e.desc)}" placeholder="مثل: إيجار شهر أكتوبر، قفازات وشاش"></label>
    <label>المبلغ *<input id="ex_a" name="amount" type="number" min="0" step="any" required value="${esc(e.amount)}"></label>
    <label>طريقة الدفع<select id="ex_m" name="method">${opts(PAY_METHODS.filter(x => x !== 'شركة / تأمين'), e.method)}</select></label>
    ${isNew ? `<label class="chk full"><input type="checkbox" name="repeat" id="ex_rep"> كرّر هذا المصروف شهريًا لـ 12 شهرًا (مثل الإيجار والرواتب)</label>` : ''}
    ${mfoot()}</form>`, {
    submit: async d => {
      const base = { ...e, date: d.date, category: d.category, desc: d.desc, amount: +d.amount || 0, method: d.method };
      if (isNew && d.repeat) {
        const day = d.date.slice(8);
        for (let k = 0; k < 12; k++) { const mk = addMonths(monthKey(d.date), k); await save('expenses', { ...base, id: uid('e'), date: `${mk}-${day > '28' ? '28' : day}`, recurring: true }); }
        toast('سُجّل المصروف لـ 12 شهرًا');
      } else { await save('expenses', { ...base, id: base.id || uid('e') }); toast('حُفظ المصروف'); }
      return true;
    }
  });
}
function summaryBody(inR) {
  const income = sum(D.invoices, i => sum((i.payments || []).filter(p => inR(p.date)), p => p.amount));
  const exp = sum(D.expenses.filter(e => inR(e.date)), e => e.amount);
  const byMethod = {}; D.invoices.forEach(i => (i.payments || []).filter(p => inR(p.date)).forEach(p => byMethod[p.method || 'غير محدد'] = (byMethod[p.method || 'غير محدد'] || 0) + (+p.amount || 0)));
  const bySvc = {}; D.invoices.filter(i => inR(i.date)).forEach(i => (i.items || []).forEach(x => bySvc[x.name] = (bySvc[x.name] || 0) + (x.qty || 1) * x.price));
  const bars = (obj, color) => { const e = Object.entries(obj).sort((a, b) => b[1] - a[1]); const mx = e.length ? e[0][1] : 1; return e.length ? `<div class="hbars">${e.slice(0, 10).map(([k, v]) => `<div class="hbar" data-tip="${esc(k)}: ${esc(moneyT(v))}"><span class="lb">${esc(k)}</span><span class="tr"><span class="fl" style="width:${(v / mx * 100).toFixed(1)}%;background:${color}"></span></span><span class="vv">${num(v)}</span></div>`).join('')}</div>` : '<span class="muted">لا بيانات</span>'; };
  return `<div class="kpis k3"><div class="kpi good"><div class="l">الدخل المحصَّل</div><div class="v">${money(income)}</div></div><div class="kpi bad"><div class="l">المصروفات</div><div class="v">${money(exp)}</div></div><div class="kpi ${income - exp >= 0 ? 'good' : 'bad'}"><div class="l">الصافي</div><div class="v">${money(income - exp)}</div><div class="h">${income ? `هامش ${Math.round((income - exp) / income * 100)}%` : ''}</div></div></div>
    <div class="grid2"><section class="panel"><div class="ph"><h3>الدخل حسب الخدمة</h3></div><div class="pb">${bars(bySvc, 'var(--s1)')}</div></section><section class="panel"><div class="ph"><h3>التحصيل حسب طريقة الدفع</h3></div><div class="pb">${bars(byMethod, 'var(--s1)')}</div></section></div>`;
}
ACT.finExport = () => {
  const f = ui.fin, [a, b] = periodRange(f.period, f.month), inR = d => d >= a && d <= b;
  if (f.tab === 'expenses') {
    const rows = [['التاريخ', 'الفئة', 'الوصف', 'طريقة الدفع', 'المبلغ']];
    D.expenses.filter(e => inR(e.date)).sort((x, y) => x.date.localeCompare(y.date)).forEach(e => rows.push([e.date, e.category, e.desc, e.method, e.amount]));
    return downloadFile(`مصروفات-${today()}.csv`, toCSV(rows));
  }
  const rows = [['رقم الفاتورة', 'التاريخ', 'رقم الملف', 'المريض', 'البنود', 'الخصم', 'الإجمالي', 'المدفوع', 'المتبقي', 'الحالة']];
  D.invoices.filter(i => inR(i.date)).sort((x, y) => x.no - y.no).forEach(i => { const c = invCalc(i); rows.push([i.no, i.date, fileNo(pat(i.patientId)), pName(i.patientId), (i.items || []).map(x => x.name).join(' + '), i.discount || 0, c.total, c.paid, c.due, INV_STATUS[c.status]]); });
  downloadFile(`فواتير-${today()}.csv`, toCSV(rows));
};

/* ================= INVENTORY ================= */
function stockState(x) {
  const t = today();
  if (x.expiry && x.expiry < t) return ['bad', 'منتهي الصلاحية'];
  if ((+x.qty || 0) <= 0) return ['bad', 'نفد'];
  if ((+x.qty || 0) <= (+x.min || 0)) return ['warn', 'تحت الحد الأدنى'];
  if (x.expiry && daysBetween(t, x.expiry) <= 60) return ['warn', `ينتهي خلال ${daysBetween(t, x.expiry)} يوم`];
  return ['ok', 'متوفر'];
}
VIEWS.inventory = {
  shell() {
    const f = ui.inv = { q: '', filter: 'all', ...(ui.inv || {}) };
    return `<div class="head"><div class="grow"><h1>المخزون</h1><div class="sub">المستلزمات الطبية والأدوية المتوفرة في العيادة</div></div>
      <label class="ctl" for="invQ">بحث<input type="search" id="invQ" value="${esc(f.q)}" data-input="invQ"></label>
      <label class="ctl" for="invF">عرض<select id="invF" data-change="invF">${opts([['all', 'الكل'], ['alert', 'يحتاج انتباه'], ['ok', 'متوفر']], f.filter)}</select></label>
      ${W() ? `<button class="btn primary" data-act="newItem">صنف جديد</button>` : ''}</div><div id="vbody"></div>`;
  },
  body() {
    const f = ui.inv;
    let list = D.inventory.filter(x => !f.q || norm(x.name).includes(norm(f.q)) || norm(x.cat).includes(norm(f.q)));
    if (f.filter === 'alert') list = list.filter(x => stockState(x)[0] !== 'ok');
    if (f.filter === 'ok') list = list.filter(x => stockState(x)[0] === 'ok');
    list.sort((a, b) => ({ bad: 0, warn: 1, ok: 2 }[stockState(a)[0]] - { bad: 0, warn: 1, ok: 2 }[stockState(b)[0]]) || (a.name || '').localeCompare(b.name || '', 'ar'));
    const alerts = D.inventory.filter(x => stockState(x)[0] !== 'ok').length;
    const value = sum(D.inventory, x => (+x.qty || 0) * (+x.cost || 0));
    if (!D.inventory.length) return `<div class="panel">${emptyBox('المخزون فارغ', '<br>أضف القفازات والشاش والحقن والأدوية المتوفرة لتنبيهك عند النفاد أو قرب انتهاء الصلاحية.', 'newItem', 'إضافة صنف')}</div>`;
    return `<div class="kpis k3"><div class="kpi"><div class="l">عدد الأصناف</div><div class="v">${D.inventory.length}</div></div><div class="kpi ${alerts ? 'hl' : ''}"><div class="l">تحتاج انتباه</div><div class="v">${alerts}</div></div><div class="kpi"><div class="l">قيمة المخزون التقريبية</div><div class="v">${money(value)}</div></div></div>
    <div class="tbl"><table><thead><tr><th>الصنف</th><th>الفئة</th><th class="n">الكمية</th><th class="n">الحد الأدنى</th><th>الصلاحية</th><th>الحالة</th><th></th></tr></thead><tbody>${list.map(x => { const [c, t] = stockState(x); return `<tr><td><b>${esc(x.name)}</b>${x.supplier ? `<span class="rowsub">${esc(x.supplier)}</span>` : ''}</td><td class="muted">${esc(x.cat || '')}</td><td class="n"><b>${num(x.qty)}</b> <span class="muted">${esc(x.unit || '')}</span></td><td class="n muted">${num(x.min)}</td><td class="muted">${x.expiry ? esc(fmtDate(x.expiry)) : '—'}</td><td>${pill(c, t)}</td>
      <td><div class="acts">${W() ? `<button class="btn sm" data-act="stockOut" data-id="${x.id}" aria-label="صرف">− صرف</button><button class="btn sm" data-act="stockIn" data-id="${x.id}">+ توريد</button><button class="btn sm ghost" data-act="editItem" data-id="${x.id}">تعديل</button>` : ''}</div></td></tr>`; }).join('')}</tbody></table></div>`;
  }
};
INP.invQ = debounce(t => { ui.inv.q = t.value; renderBody(); }, 150);
CHG.invF = t => { ui.inv.filter = t.value; renderBody(); };
ACT.newItem = () => itemForm();
ACT.editItem = id => itemForm(byId('inventory', id));
function itemForm(x) {
  if (!W()) return;
  const isNew = !x; x = x || { unit: 'قطعة', min: 5, qty: 0, cat: 'مستلزمات' };
  openModal(isNew ? 'صنف جديد' : 'تعديل الصنف', `<form id="mForm" class="form">
    <label class="full">اسم الصنف *<input id="it_n" name="name" required value="${esc(x.name)}" placeholder="مثل: قفازات لاتكس مقاس M"></label>
    <label>الفئة<select id="it_c" name="cat">${opts(['مستلزمات', 'أدوية', 'حقن ومحاليل', 'أدوات', 'مواد تعقيم', 'مطبوعات', 'أخرى'], x.cat)}</select></label>
    <label>الوحدة<input id="it_u" name="unit" value="${esc(x.unit)}" list="unitList"><datalist id="unitList">${['قطعة', 'علبة', 'كرتون', 'زجاجة', 'أمبولة', 'شريط', 'لفة', 'زوج'].map(u => `<option value="${u}">`).join('')}</datalist></label>
    <label>الكمية الحالية<input id="it_q" name="qty" type="number" min="0" step="any" value="${esc(x.qty)}"></label>
    <label>الحد الأدنى للتنبيه<input id="it_m" name="min" type="number" min="0" step="any" value="${esc(x.min)}"></label>
    <label>تاريخ الصلاحية<input id="it_e" name="expiry" type="date" value="${esc(x.expiry)}"></label>
    <label>تكلفة الوحدة<input id="it_cost" name="cost" type="number" min="0" step="any" value="${esc(x.cost)}"></label>
    <label class="full">المورّد<input id="it_s" name="supplier" value="${esc(x.supplier)}"></label>
    ${mfoot(isNew ? 'إضافة' : 'حفظ', isNew ? '' : `<button type="button" class="btn danger" data-act="delItem" data-id="${x.id}">حذف الصنف</button>`)}</form>`, {
    submit: async d => { const obj = { ...x, ...d, qty: +d.qty || 0, min: +d.min || 0, cost: +d.cost || 0, id: x.id || uid('s') }; await save('inventory', obj); toast('حُفظ الصنف'); return true; }
  });
}
ACT.delItem = id => confirmBox('حذف هذا الصنف من المخزون؟', async () => { await remove('inventory', id); toast('حُذف الصنف'); });
function stockMove(id, dir) {
  const x = byId('inventory', id); if (!x) return;
  openModal(`${dir > 0 ? 'توريد' : 'صرف'}: ${x.name}`, `<form id="mForm" class="form"><div class="full muted">الكمية الحالية: <b>${num(x.qty)} ${esc(x.unit || '')}</b></div>
    <label>الكمية *<input id="mv_q" name="q" type="number" min="0.01" step="any" value="1" required></label>
    ${dir > 0 ? `<label>تاريخ صلاحية الدفعة الجديدة<input id="mv_e" name="expiry" type="date" value="${esc(x.expiry)}"></label>` : `<label>السبب<select id="mv_r" name="reason">${opts(['استخدام في العيادة', 'تالف', 'منتهي الصلاحية', 'أخرى'])}</select></label>`}
    ${mfoot(dir > 0 ? 'إضافة للمخزون' : 'صرف')}</form>`, {
    submit: async d => {
      const q = +d.q || 0; if (!(q > 0)) return formErr('أدخل كمية صحيحة.');
      const nq = Math.max(0, (+x.qty || 0) + dir * q);
      const log = [...(x.log || []), { date: today(), q: dir * q, reason: d.reason || 'توريد' }].slice(-30);
      await patch('inventory', id, { qty: nq, log, ...(dir > 0 && d.expiry ? { expiry: d.expiry } : {}) });
      toast(`${x.name}: الكمية الآن ${num(nq)}`); return true;
    }
  });
}
ACT.stockIn = id => stockMove(id, 1);
ACT.stockOut = id => stockMove(id, -1);

/* ================= REPORTS ================= */
VIEWS.reports = {
  shell() {
    ui.rep = ui.rep || { month: thisMonth() };
    return `<div class="head"><div class="grow"><h1>التقارير</h1><div class="sub">أداء العيادة الشهري والإحصاءات الطبية</div></div>
      <label class="ctl" for="repM">الشهر<input type="month" id="repM" value="${ui.rep.month}" data-change="repM"></label></div><div id="vbody"></div>`;
  },
  body() {
    const k = ui.rep.month, prev = addMonths(k, -1);
    const inM = d => monthKey(d) === k;
    const rev = paidInMonth(k), revP = paidInMonth(prev), exp = expInMonth(k);
    const vis = D.visits.filter(v => inM(v.date)), visP = D.visits.filter(v => monthKey(v.date) === prev);
    const newP = D.patients.filter(p => monthKey(isoDate(new Date(p.createdAt || 0))) === k).length;
    const ap = D.appointments.filter(a => inM(a.date) && a.date <= today());
    const noshow = ap.filter(a => a.status === 'noshow').length, attended = ap.filter(a => a.status === 'done').length;
    const waits = ap.filter(a => a.arrivedAt && a.startedAt).map(a => (a.startedAt - a.arrivedAt) / 60000).filter(x => x >= 0 && x < 600);
    const avgWait = waits.length ? Math.round(sum(waits, x => x) / waits.length) : null;
    const delta = (a, b) => b ? `<span style="color:${a >= b ? 'var(--ok)' : 'var(--danger)'}">${a >= b ? '▲' : '▼'} ${Math.abs(Math.round((a - b) / b * 100))}%</span> عن الشهر السابق` : '&nbsp;';
    let h = `<div class="kpis">
      <div class="kpi"><div class="l">الدخل المحصَّل</div><div class="v">${money(rev)}</div><div class="h">${delta(rev, revP)}</div></div>
      <div class="kpi ${rev - exp >= 0 ? '' : 'bad'}"><div class="l">صافي الشهر</div><div class="v">${money(rev - exp)}</div><div class="h">المصروفات ${esc(moneyT(exp))}</div></div>
      <div class="kpi"><div class="l">الكشوفات</div><div class="v">${vis.length}</div><div class="h">${delta(vis.length, visP.length)}</div></div>
      <div class="kpi"><div class="l">مرضى جدد</div><div class="v">${newP}</div><div class="h">متوسط الدخل لكل كشف ${vis.length ? esc(moneyT(Math.round(rev / vis.length))) : '—'}</div></div></div>`;
    h += `<section class="panel" style="margin-bottom:16px"><div class="ph"><h3>الدخل والمصروفات — آخر 12 شهرًا</h3></div><div class="pb">${monthsChart(k)}</div></section>`;
    // diagnoses
    const dx = {}; vis.forEach(v => (v.diagnoses || []).forEach(d => dx[d] = (dx[d] || 0) + 1));
    const dxs = Object.entries(dx).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const mx = dxs.length ? dxs[0][1] : 1;
    // demographics for patients seen this month
    const seen = [...new Set(vis.map(v => v.patientId))].map(pat).filter(Boolean);
    const groups = [['أقل من 12', 0, 11], ['12–17', 12, 17], ['18–39', 18, 39], ['40–59', 40, 59], ['60 فأكثر', 60, 200]];
    const ag = groups.map(([l, a, b]) => [l, seen.filter(p => { const y = ageYears(p.dob); return y !== null && y >= a && y <= b; }).length]);
    const agMx = Math.max(1, ...ag.map(x => x[1]));
    const male = seen.filter(p => p.gender === 'ذكر').length, female = seen.filter(p => p.gender === 'أنثى').length;
    const types = Object.entries(APPT_TYPES).map(([t, l]) => [l, vis.filter(v => v.type === t).length]).filter(x => x[1]);
    const wd = DAYS.map(([n, l]) => [l, vis.filter(v => dObj(v.date).getDay() === n).length]);
    const wdMx = Math.max(1, ...wd.map(x => x[1]));
    const hbar = (rows, mxv, color = 'var(--s1)') => `<div class="hbars">${rows.map(([l, v]) => `<div class="hbar" data-tip="${esc(l)}: ${v}"><span class="lb">${esc(l)}</span><span class="tr"><span class="fl" style="width:${(v / mxv * 100).toFixed(1)}%;background:${color}"></span></span><span class="vv">${v}</span></div>`).join('')}</div>`;
    h += `<div class="grid2" style="margin-bottom:16px"><section class="panel"><div class="ph"><h3>أكثر التشخيصات</h3><span class="muted">${esc(fmtMonth(k))}</span></div><div class="pb">${dxs.length ? hbar(dxs, mx) : '<span class="muted">لا كشوفات في هذا الشهر.</span>'}</div></section>
      <section class="panel"><div class="ph"><h3>المواعيد والانتظار</h3></div><div class="pb"><dl class="dl">
        <dt>مواعيد الشهر حتى اليوم</dt><dd class="num">${ap.length}</dd><dt>حضروا وتم الكشف</dt><dd class="num">${attended}</dd>
        <dt>لم يحضروا</dt><dd class="num">${noshow}${ap.length ? ` (${Math.round(noshow / ap.length * 100)}%)` : ''}</dd><dt>ملغاة</dt><dd class="num">${ap.filter(a => a.status === 'cancelled').length}</dd>
        <dt>متوسط الانتظار</dt><dd class="num">${avgWait !== null ? avgWait + ' دقيقة' : 'يُحسب من تسجيل الوصول والإدخال'}</dd>
        <dt>نوع الزيارات</dt><dd>${types.length ? types.map(t => `${t[0]}: ${t[1]}`).join(' · ') : '—'}</dd></dl></div></section></div>`;
    h += `<div class="grid3"><section class="panel"><div class="ph"><h3>الفئات العمرية</h3><span class="muted">${seen.length} مريض</span></div><div class="pb">${seen.length ? hbar(ag, agMx) : '<span class="muted">—</span>'}</div></section>
      <section class="panel"><div class="ph"><h3>الجنس</h3></div><div class="pb">${seen.length ? hbar([['ذكور', male], ['إناث', female], ['غير محدد', seen.length - male - female]].filter(x => x[1]), Math.max(male, female, 1)) : '<span class="muted">—</span>'}</div></section>
      <section class="panel"><div class="ph"><h3>الكشوفات حسب اليوم</h3></div><div class="pb">${vis.length ? hbar(wd, wdMx) : '<span class="muted">—</span>'}</div></section></div>`;
    const debtors = D.patients.map(p => [p, balanceOf(p.id)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (debtors.length) h += `<section class="panel" style="margin-top:16px"><div class="ph"><h3>أعلى الأرصدة المستحقة</h3></div><ul class="list">${debtors.map(([p, b]) => `<li><div class="grow"><button class="link" data-act="openPatientBill" data-id="${p.id}">${esc(p.name)}</button> <span class="muted num">${fileNo(p)}</span></div><span class="ltr muted num">${esc(p.phone || '')}</span><b style="color:var(--danger)">${money(b)}</b></li>`).join('')}</ul></section>`;
    return h;
  }
};
CHG.repM = t => { if (t.value) { ui.rep.month = t.value; renderBody(); } };
ACT.openPatientBill = id => openPatient(id, 'billing');
function monthsChart(endK) {
  const ms = [...Array(12)].map((_, i) => addMonths(endK, i - 11));
  const rows = ms.map(m => ({ m, r: paidInMonth(m), e: expInMonth(m) }));
  const mxv = Math.max(1, ...rows.map(x => Math.max(x.r, x.e)));
  const nice = (() => { const p = Math.pow(10, Math.floor(Math.log10(mxv))); const c = [1, 2, 2.5, 5, 10].map(x => x * p).find(x => x * 4 >= mxv) || 10 * p; return c; })();
  const top = nice * 4;
  const Wd = 760, H = 240, L = 56, R = 10, T = 12, B = 30;
  const bw = (Wd - L - R) / 12, barW = Math.min(18, bw / 3);
  const y = v => T + (H - T - B) * (1 - v / top);
  let s = `<div class="legend"><span><i style="background:var(--s1)"></i>الدخل المحصَّل</span><span><i style="background:var(--s2)"></i>المصروفات</span></div><div class="chart"><svg viewBox="0 0 ${Wd} ${H}" dir="ltr" role="img" aria-label="الدخل والمصروفات لآخر 12 شهرًا">`;
  for (let i = 0; i <= 4; i++) { const v = nice * i; s += `<line x1="${L}" x2="${Wd - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${num(v)}</text>`; }
  rows.forEach((x, i) => {
    const cx = L + bw * i + bw / 2;
    const bar = (v, off, color) => v > 0 ? `<path d="M${cx + off},${y(0)} V${y(v) + 4} q0,-4 4,-4 h${barW - 8} q4,0 4,4 V${y(0)} Z" fill="${color}"/>` : '';
    s += bar(x.r, -barW - 1, 'var(--s1)') + bar(x.e, 1, 'var(--s2)');
    s += `<rect x="${cx - bw / 2}" y="${T}" width="${bw}" height="${H - T - B}" fill="transparent" data-tip="${esc(fmtMonth(x.m))}\nالدخل: ${esc(moneyT(x.r))}\nالمصروفات: ${esc(moneyT(x.e))}\nالصافي: ${esc(moneyT(x.r - x.e))}"/>`;
    s += `<text x="${cx}" y="${H - 10}" text-anchor="middle" ${x.m === endK ? 'style="fill:var(--ink);font-weight:700"' : ''}>${esc(fmtMonthShort(x.m))}</text>`;
  });
  s += `<line x1="${L}" x2="${Wd - R}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line-2)"/></svg></div>`;
  s += `<details style="margin-top:8px"><summary class="muted" style="cursor:pointer;font-size:.85rem">عرض الأرقام كجدول</summary><div class="tbl" style="margin-top:8px"><table style="min-width:0"><thead><tr><th>الشهر</th><th class="n">الدخل</th><th class="n">المصروفات</th><th class="n">الصافي</th></tr></thead><tbody>${rows.slice().reverse().map(x => `<tr><td>${esc(fmtMonth(x.m))}</td><td class="n">${num(x.r)}</td><td class="n">${num(x.e)}</td><td class="n">${num(x.r - x.e)}</td></tr>`).join('')}</tbody></table></div></details>`;
  return s;
}

/* ================= SETTINGS ================= */
VIEWS.settings = {
  shell() {
    const tab = ui.stab = ui.stab || 'clinic';
    const dis = W() ? '' : 'disabled';
    const tabs = [['clinic', 'الطبيب والعيادة'], ['hours', 'أوقات العمل'], ['services', 'الخدمات والأسعار'], ['meds', 'قائمة الأدوية'], ['messages', 'الرسائل والمستندات'], ['data', 'النسخ الاحتياطي']];
    let h = `<div class="head"><div class="grow"><h1>الإعدادات</h1></div></div><div class="tabs" role="tablist">${tabs.map(([k, t]) => `<button role="tab" data-act="stab" data-id="${k}" aria-selected="${tab === k}">${t}</button>`).join('')}</div>`;
    if (tab === 'clinic') h += `<form class="fs" data-form="settings" style="max-width:820px"><div class="form">
      <label>اسم الطبيب *<input id="s_dn" name="doctorName" value="${esc(S.doctorName)}" placeholder="بدون «د.»" ${dis} required></label>
      <label>التخصص<input id="s_sp" name="specialty" value="${esc(S.specialty)}" placeholder="مثل: أخصائي الباطنة" ${dis}></label>
      <label>المؤهل / الدرجة العلمية<input id="s_dg" name="degree" value="${esc(S.degree)}" placeholder="مثل: ماجستير الأمراض الباطنة" ${dis}></label>
      <label>رقم الهوية النقابية / إجازة ممارسة المهنة<input id="s_lic" name="license" value="${esc(S.license)}" dir="ltr" ${dis}></label>
      <label class="full">اسم العيادة<input id="s_cn" name="clinicName" value="${esc(S.clinicName)}" placeholder="إذا تُرك فارغًا: عيادة د. (اسم الطبيب)" ${dis}></label>
      <label>موبايل العيادة<input id="s_ph" name="phone" value="${esc(S.phone)}" dir="ltr" placeholder="07XX XXX XXXX" ${dis}></label>
      <label>رقم آخر<input id="s_ph2" name="phone2" value="${esc(S.phone2)}" dir="ltr" ${dis}></label>
      <label>المحافظة<select id="s_prov" name="province" ${dis}>${opts(PROVINCES, S.province)}</select></label>
      <label>العنوان<input id="s_ad" name="address" value="${esc(S.address)}" placeholder="مثل: شارع الأطباء، قرب صيدلية…" ${dis}></label>
      <label>العملة<input id="s_cur" name="currency" value="${esc(S.currency)}" list="curList" ${dis}><datalist id="curList">${['د.ع', '$'].map(c => `<option value="${c}">`).join('')}</datalist></label>
      ${W() ? '<div class="m-foot"><button class="btn primary" type="submit">حفظ البيانات</button></div>' : ''}</div></form>`;
    if (tab === 'hours') h += `<form class="fs" data-form="settings" style="max-width:820px"><div class="form">
      <div class="full fl">أيام العمل<div class="daypick">${DAYS.map(([n, l]) => `<label><input type="checkbox" name="workDays" value="${n}" ${(S.workDays || []).includes(n) ? 'checked' : ''} ${dis}><span>${l}</span></label>`).join('')}</div></div>
      <label>بداية الدوام<input id="s_st" name="start" type="time" value="${esc(S.start)}" ${dis}></label>
      <label>نهاية الدوام<input id="s_en" name="end" type="time" value="${esc(S.end)}" ${dis}></label>
      <label>بداية الاستراحة (اختياري)<input id="s_bs" name="breakStart" type="time" value="${esc(S.breakStart)}" ${dis}></label>
      <label>نهاية الاستراحة<input id="s_be" name="breakEnd" type="time" value="${esc(S.breakEnd)}" ${dis}></label>
      <label>مدة الموعد الواحد<select id="s_sl" name="slot" ${dis}>${opts([[10, '10 دقائق'], [15, '15 دقيقة'], [20, '20 دقيقة'], [30, '30 دقيقة'], [45, '45 دقيقة'], [60, 'ساعة']], S.slot)}</select></label>
      <div class="hint">بهذه الإعدادات: ${daySlots(nextWorkDay()).filter(s => !s.brk).length} موعدًا في اليوم.</div>
      ${W() ? '<div class="m-foot"><button class="btn primary" type="submit">حفظ أوقات العمل</button></div>' : ''}</div></form>`;
    if (tab === 'messages') h += `<form class="fs" data-form="settings" style="max-width:820px"><div class="form">
      <label class="full">نص رسالة تذكير الموعد<textarea id="s_rt" name="reminderTpl" rows="3" ${dis}>${esc(S.reminderTpl)}</textarea></label>
      <div class="hint">المتغيرات المتاحة: {الاسم} {العيادة} {الطبيب} {اليوم} {الوقت} {الهاتف}</div>
      <label class="full">تذييل الوصفات والتقارير المطبوعة<input id="s_df" name="docFooter" value="${esc(S.docFooter)}" placeholder="مثل: أوقات العمل من السبت إلى الأربعاء 4–10 مساءً" ${dis}></label>
      ${W() ? '<div class="m-foot"><button class="btn primary" type="submit">حفظ</button><button class="btn" type="button" data-act="previewRx">معاينة شكل الوصفة</button></div>' : ''}</div></form>`;
    return h + `<div id="vbody"></div>`;
  },
  body() {
    const tab = ui.stab;
    if (tab === 'services') {
      const list = [...D.services].sort((a, b) => (a.order || 0) - (b.order || 0));
      const sugg = ['كشفية', 'مراجعة', 'كشفية مستعجلة', 'سونار', 'تخطيط قلب ECG', 'زرق إبرة', 'تعليق مغذي', 'تضميد جرح', 'قياس سكر', 'تقرير طبي'].filter(n => !list.some(s => s.name === n));
      return `<div style="max-width:820px"><section class="panel"><div class="ph"><h3>الخدمات وأسعارها</h3>${W() ? '<button class="btn sm primary" data-act="newSvc">+ خدمة</button>' : ''}</div>
        ${list.length ? `<ul class="list">${list.map(s => `<li><div class="grow"><div class="t">${esc(s.name)}</div></div><b>${money(s.price)}</b>${W() ? `<button class="btn sm ghost" data-act="editSvc" data-id="${s.id}">تعديل</button><button class="btn sm ghost danger" data-act="delSvc" data-id="${s.id}">حذف</button>` : ''}</li>`).join('')}</ul>` : `<div class="empty"><b>لا خدمات بعد</b>أضف أسعار الكشف والمتابعة لتُحسب الفاتورة تلقائيًا في شاشة الكشف.</div>`}
        ${W() && sugg.length ? `<div class="pb" style="border-top:1px solid var(--line)"><div class="fl" style="margin-bottom:6px">إضافة سريعة</div><div class="chips">${sugg.map(n => `<button class="tog" data-act="newSvc" data-id="${esc(n)}">+ ${esc(n)}</button>`).join('')}</div></div>` : ''}</section></div>`;
    }
    if (tab === 'meds') {
      const q = ui.medQ || '';
      const list = D.meds.filter(m => !q || norm(m.name).includes(norm(q))).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
      return `<div style="max-width:980px"><div class="head" style="margin-bottom:10px"><div class="grow muted" style="font-size:.9rem">الأدوية التي تصفها كثيرًا مع جرعاتها المعتادة. تُضاف الأدوية الجديدة تلقائيًا عند حفظ أي كشف، وتُملأ جرعتها تلقائيًا عند اختيارها في الوصفة.</div>${W() ? '<button class="btn primary" data-act="newMed">+ دواء</button>' : ''}</div>
        ${D.meds.length ? `<div class="tbl"><table><thead><tr><th>الدواء</th><th>الشكل</th><th>الجرعة</th><th>التكرار</th><th>المدة</th><th>ملاحظات</th><th class="n">مرات الوصف</th><th></th></tr></thead><tbody>${list.map(m => { const n = D.visits.filter(v => (v.rx || []).some(r => norm(r.drug) === norm(m.name))).length; return `<tr><td><b>${esc(m.name)}</b></td><td>${esc(m.form || '')}</td><td>${esc(m.dose || '')}</td><td>${esc(m.freq || '')}</td><td>${esc(m.duration || '')}</td><td class="muted">${esc(m.notes || '')}</td><td class="n">${n}</td><td><div class="acts">${W() ? `<button class="btn sm ghost" data-act="editMed" data-id="${m.id}">تعديل</button><button class="btn sm ghost danger" data-act="delMed" data-id="${m.id}">حذف</button>` : ''}</div></td></tr>`; }).join('')}</tbody></table></div>` : `<div class="panel"><div class="empty"><b>القائمة فارغة</b>ستمتلئ تلقائيًا مع أول وصفة تكتبها.</div></div>`}</div>`;
    }
    if (tab === 'data') {
      const counts = COLS.map(c => [c, D[c].length]);
      const label = { patients: 'مرضى', appointments: 'مواعيد', visits: 'كشوفات', invoices: 'فواتير', expenses: 'مصروفات', inventory: 'أصناف مخزون', meds: 'أدوية', services: 'خدمات', files: 'مرفقات', reports: 'مستندات' };
      const total = sum(counts, c => c[1]);
      return `<div style="max-width:820px" class="stack"><section class="panel"><div class="ph"><h3>محتوى قاعدة البيانات</h3><span class="muted">${total} سجل من أصل 25,000 متاح</span></div><div class="pb"><div class="chips">${counts.map(([c, n]) => `<span class="chip" style="padding:2px 12px">${label[c]}: <b>${n}</b></span>`).join('')}</div></div></section>
        <section class="panel"><div class="ph"><h3>النسخ الاحتياطي</h3></div><div class="pb" style="display:flex;flex-direction:column;gap:10px">
          <div>نزّل نسخة كاملة من بيانات العيادة (بدون الملفات المرفقة) واحفظها على جهازك أسبوعيًا.</div>
          <div class="m-foot" style="padding:0"><button class="btn primary" data-act="backup">تنزيل نسخة احتياطية (JSON)</button><button class="btn" data-act="exportPatients">تصدير المرضى (CSV)</button><button class="btn" data-act="exportVisits">تصدير الكشوفات (CSV)</button></div>
          ${W() ? `<div style="border-top:1px solid var(--line);padding-top:10px"><b>استعادة من نسخة احتياطية</b><div class="muted" style="font-size:.88rem">تُضاف السجلات من الملف وتُحدَّث المطابقة لها. لا يُحذف شيء موجود.</div><label class="btn" style="margin-top:8px;cursor:pointer">اختيار ملف النسخة<input type="file" accept="application/json,.json" data-change="restore" hidden></label></div>` : ''}
        </div></section></div>`;
    }
    return '';
  }
};
function nextWorkDay() { for (let i = 0; i < 7; i++) { const d = addDays(today(), i); if (isWorkDay(d)) return d; } return today(); }
ACT.stab = t => { ui.stab = t; buildShell(); };
PAGEFORMS.settings = async (d, fd, form) => {
  const next = { ...d };
  if (form.querySelector('[name=workDays]')) { next.workDays = fd.getAll('workDays').map(Number); next.hoursSet = true; }
  if (next.slot) next.slot = +next.slot;
  if (next.start && next.end && tmin(next.end) <= tmin(next.start)) { toast('نهاية الدوام يجب أن تكون بعد بدايته.'); return false; }
  await saveSettings(next);
  toast('حُفظت الإعدادات');
  if (ui.stab === 'hours') buildShell();
  return false;
};
ACT.previewRx = () => {
  const inner = `${patientMeta({ name: 'اسم المريض', fileNo: 1, dob: addDays(today(), -365 * 34), gender: 'ذكر' }, today())}<p><b>التشخيص:</b> مثال للتشخيص</p><div class="rxsym">℞</div><ol><li><b>اسم الدواء 500 ملغ</b> (أقراص)<br>قرص واحد — مرتين يوميًا — لمدة 7 أيام</li></ol>`;
  showDoc('معاينة الوصفة', inner, 'معاينة-وصفة');
};
function svcForm(s, name) {
  if (!W()) return;
  const isNew = !s; s = s || { name: name || '', price: '' };
  openModal(isNew ? 'خدمة جديدة' : 'تعديل الخدمة', `<form id="mForm" class="form"><label class="full">اسم الخدمة *<input id="sv_n" name="name" required value="${esc(s.name)}"></label><label>السعر (${esc(S.currency)}) *<input id="sv_p" name="price" type="number" min="0" step="any" required value="${esc(s.price)}" ${name ? 'autofocus' : ''}></label>${mfoot()}</form>`, {
    submit: async d => { await save('services', { ...s, id: s.id || uid('sv'), name: d.name.trim(), price: +d.price || 0, order: s.order ?? D.services.length }); toast('حُفظت الخدمة'); return true; }
  });
}
ACT.newSvc = n => svcForm(null, n);
ACT.editSvc = id => svcForm(byId('services', id));
ACT.delSvc = id => confirmBox('حذف هذه الخدمة؟ لن تتأثر الفواتير السابقة.', async () => { await remove('services', id); });
function medForm(m) {
  if (!W()) return;
  const isNew = !m; m = m || {};
  openModal(isNew ? 'إضافة دواء' : 'تعديل الدواء', `<form id="mForm" class="form">
    <label class="full">اسم الدواء وتركيزه *<input id="md_n" name="name" required value="${esc(m.name)}" placeholder="مثل: أموكسيسيلين 500 ملغ"></label>
    <label>الشكل<select id="md_f" name="form">${opts(FORMS, m.form, '—')}</select></label>
    <label>الجرعة المعتادة<input id="md_d" name="dose" value="${esc(m.dose)}" placeholder="قرص واحد"></label>
    <label>التكرار<select id="md_q" name="freq">${opts(FREQS, m.freq, '—')}</select></label>
    <label>المدة<input id="md_u" name="duration" value="${esc(m.duration)}" placeholder="7 أيام"></label>
    <label class="full">ملاحظات<input id="md_no" name="notes" value="${esc(m.notes)}" placeholder="بعد الأكل"></label>${mfoot()}</form>`, {
    submit: async d => { await save('meds', { ...m, ...d, id: m.id || uid('m'), name: d.name.trim() }); toast('حُفظ الدواء'); return true; }
  });
}
ACT.newMed = () => medForm();
ACT.editMed = id => medForm(byId('meds', id));
ACT.delMed = id => confirmBox('حذف هذا الدواء من القائمة؟ لن تتأثر الوصفات السابقة.', async () => { await remove('meds', id); });
ACT.backup = () => {
  const data = { app: 'clinic', version: 1, exportedAt: new Date().toISOString(), settings: S, ...Object.fromEntries(COLS.map(c => [c, D[c]])) };
  downloadFile(`نسخة-احتياطية-العيادة-${today()}.json`, JSON.stringify(data, null, 1)).then(ok => { if (ok && W()) saveSettings({ lastBackup: today() }).catch(() => { }); });
};
ACT.exportVisits = () => {
  const rows = [['التاريخ', 'رقم الملف', 'المريض', 'النوع', 'الشكوى', 'التشخيص', 'الضغط', 'النبض', 'الحرارة', 'الوزن', 'الأدوية', 'التحاليل', 'المتابعة']];
  [...D.visits].sort((a, b) => a.date.localeCompare(b.date)).forEach(v => { const vt = v.vitals || {}; rows.push([v.date, fileNo(pat(v.patientId)), pName(v.patientId), APPT_TYPES[v.type] || '', v.complaint, (v.diagnoses || []).join(' + '), bpOf(vt), vt.pulse, vt.temp, vt.weight, (v.rx || []).map(r => r.drug).join(' + '), (v.labs || []).map(l => l.name).join(' + '), v.followup]); });
  downloadFile(`كشوفات-${today()}.csv`, toCSV(rows));
};
CHG.restore = async t => {
  const f = t.files[0]; t.value = ''; if (!f) return;
  let data;
  try { data = JSON.parse(await f.text()); } catch (e) { toast('الملف ليس نسخة احتياطية صالحة.'); return; }
  if (!data || data.app !== 'clinic') { toast('هذا الملف ليس نسخة احتياطية من هذا النظام.'); return; }
  const n = sum(COLS, c => (data[c] || []).length);
  confirmBox(`استعادة ${n} سجل من نسخة ${esc(String(data.exportedAt || '').slice(0, 10))}؟ ستُحدَّث السجلات المطابقة وتُضاف الجديدة.`, async () => {
    let done = 0;
    for (const c of COLS) for (const row of (data[c] || [])) { if (row && row.id) { await save(c, row); done++; if (done % 25 === 0) toast(`جارٍ الاستعادة… ${done}/${n}`); } }
    if (data.settings) await saveSettings(data.settings);
    toast(`اكتملت استعادة ${done} سجل`);
  }, 'استعادة');
};
