'use strict';
/* ============================================================
   core.js — utilities, state, storage, routing, modal, documents
   ============================================================ */
document.documentElement.lang = 'ar';
document.documentElement.dir = 'rtl';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => isoDate(new Date());
const dObj = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1, 12); };
const addDays = (s, n) => { const d = dObj(s); d.setDate(d.getDate() + n); return isoDate(d); };
const daysBetween = (a, b) => Math.round((dObj(b) - dObj(a)) / 864e5);
const monthKey = s => String(s || '').slice(0, 7);
const thisMonth = () => today().slice(0, 7);
const addMonths = (k, n) => { const [y, m] = k.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };

// ar-IQ gives the month names used in Iraq (كانون الثاني، شباط، آذار…) with Latin digits
const LOC = 'ar-IQ-u-nu-latn';
const _dtf = {};
const fmtWith = (s, o) => { if (!s) return ''; const k = JSON.stringify(o); _dtf[k] = _dtf[k] || new Intl.DateTimeFormat(LOC, o); return _dtf[k].format(dObj(s)); };
const fmtDate = s => fmtWith(s, { day: 'numeric', month: 'long', year: 'numeric' });
const fmtShort = s => fmtWith(s, { day: 'numeric', month: 'short' });
const fmtWeekday = s => fmtWith(s, { weekday: 'long' });
const fmtDayFull = s => fmtWith(s, { weekday: 'long', day: 'numeric', month: 'long' });
const fmtMonth = k => fmtWith(k + '-01', { month: 'long', year: 'numeric' });
const fmtMonthShort = k => fmtWith(k + '-01', { month: 'short' });
const fmtTime = t => { if (!t) return ''; let [h, m] = t.split(':').map(Number); const s = h < 12 ? 'ص' : 'م'; h = h % 12 || 12; return `${h}:${pad(m)} ${s}`; };
const fmtTs = ts => { if (!ts) return ''; const d = new Date(ts); return fmtTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`); };
const tmin = t => { if (!t) return 0; const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
const mtime = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

const NF = new Intl.NumberFormat(LOC, { maximumFractionDigits: 2 });
const num = v => NF.format(+v || 0);
const money = v => `${num(v)} <small class="cur">${esc(S.currency)}</small>`;
const moneyT = v => `${num(v)} ${S.currency}`;
const sum = (arr, f) => arr.reduce((s, x) => s + (+f(x) || 0), 0);
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const norm = s => String(s || '').trim().toLowerCase()
  .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[ً-ْ]/g, '');

function ageYears(dob) {
  if (!dob) return null;
  const b = dObj(dob), n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return a;
}
function ageLabel(dob) {
  const a = ageYears(dob);
  if (a === null) return '';
  if (a >= 1) return a + ' سنة';
  const m = Math.max(0, Math.floor(daysBetween(dob, today()) / 30.4));
  return m + ' شهر';
}

/* ---------- constants ---------- */
const STATUS = {
  booked: 'محجوز', confirmed: 'مؤكَّد', waiting: 'في الانتظار', in: 'في غرفة الكشف',
  done: 'تم الكشف', noshow: 'لم يحضر', cancelled: 'ملغى'
};
const OPEN_STATUSES = ['booked', 'confirmed', 'waiting', 'in'];
const APPT_TYPES = { new: 'كشفية جديدة', followup: 'مراجعة', consult: 'استشارة', procedure: 'إجراء' };
const DAYS = [[6, 'السبت'], [0, 'الأحد'], [1, 'الإثنين'], [2, 'الثلاثاء'], [3, 'الأربعاء'], [4, 'الخميس'], [5, 'الجمعة']];
const DAY_NAME = Object.fromEntries(DAYS);
const PAY_METHODS = ['نقدي', 'زين كاش', 'كي كارد', 'آسيا حوالة', 'تحويل مصرفي', 'شركة / تأمين'];
const EXP_CATS = ['إيجار', 'رواتب', 'اشتراك المولدة', 'وقود المولدة', 'كهرباء وماء', 'مستلزمات طبية', 'أدوية', 'إنترنت واتصالات', 'صيانة', 'نظافة', 'إعلانات', 'رسوم النقابة والإجازة', 'أخرى'];
const PROVINCES = ['بغداد', 'البصرة', 'نينوى', 'أربيل', 'السليمانية', 'دهوك', 'كركوك', 'الأنبار', 'بابل', 'كربلاء', 'النجف', 'واسط', 'ديالى', 'صلاح الدين', 'القادسية', 'ذي قار', 'ميسان', 'المثنى', 'حلبجة'];
// Iraqi mobile: 07XX XXX XXXX → international 9647XXXXXXXXX
function iqIntl(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('964')) return d;
  if (d.startsWith('07') && d.length === 11) return '964' + d.slice(1);
  if (d.startsWith('7') && d.length === 10) return '964' + d;
  return d;
}
function fmtPhone(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('07')) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  return String(phone || '');
}
const phoneOk = p => { const d = String(p || '').replace(/\D/g, ''); return !d || (d.length === 11 && d.startsWith('07')) || d.startsWith('964') || d.startsWith('00'); };
const FREQS = ['مرة يوميًا', 'مرتين يوميًا', 'ثلاث مرات يوميًا', 'أربع مرات يوميًا', 'كل 6 ساعات', 'كل 8 ساعات', 'كل 12 ساعة', 'قبل النوم', 'صباحًا', 'عند اللزوم', 'مرة أسبوعيًا', 'جرعة واحدة'];
const FORMS = ['أقراص', 'كبسولات', 'شراب', 'حقن', 'مرهم', 'كريم', 'قطرة', 'بخاخ', 'لبوس', 'أكياس', 'جل'];
const COMMON_LABS = ['صورة دم CBC', 'سكر صائم FBS', 'سكر عشوائي RBS', 'سكر تراكمي HbA1c', 'وظائف كلى (يوريا وكرياتنين)', 'وظائف كبد LFT', 'دهون الدم', 'TSH', 'فحص إدرار عام GUE', 'فحص خروج عام GSE', 'فحص الحمى المالطية Brucella', 'فحص التيفوئيد Widal', 'فيتامين D', 'فيتامين B12', 'Ferritin', 'CRP', 'ESR', 'H. pylori', 'أشعة صدر', 'سونار بطن وحوض', 'تخطيط قلب ECG'];
const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const FILE_CATS = ['تحليل', 'أشعة', 'تقرير', 'وصفة خارجية', 'صورة', 'أخرى'];
const REPORT_TYPES = { report: 'تقرير طبي', leave: 'إجازة مرضية', referral: 'خطاب تحويل', fitness: 'شهادة لياقة صحية', attendance: 'إفادة مراجعة' };

const DEFAULT_SETTINGS = {
  clinicName: '', doctorName: '', specialty: '', degree: '', license: '',
  phone: '', phone2: '', province: 'بغداد', address: '', currency: 'د.ع',
  workDays: [6, 0, 1, 2, 3, 4], start: '16:00', end: '22:00', breakStart: '', breakEnd: '',
  slot: 15, docFooter: '', reminderTpl: 'هلا {الاسم}، نذكّرك بموعد مراجعتك في {العيادة} يوم {اليوم} الساعة {الوقت}. إذا ما تكدر تجي، بلّغنا على {الهاتف}. نتمنى لك السلامة.'
};

/* ---------- state ---------- */
const COLS = ['patients', 'appointments', 'visits', 'invoices', 'expenses', 'inventory', 'meds', 'services', 'files', 'reports'];
const D = Object.fromEntries(COLS.map(c => [c, []]));
const IDX = Object.fromEntries(COLS.map(c => [c, new Map()]));
let S = { ...DEFAULT_SETTINGS };
const app = { mode: 'loading', canWrite: true, db: null, assets: null, downloads: null, loaded: new Set(), settingsLoaded: false };
const ui = { route: 'home', param: null };
const VIEWS = {};      // route -> {shell(param), body(param), after?(param), title}
const ACT = {};        // data-act handlers
const CHG = {};        // data-change handlers
const INP = {};        // data-input handlers
const PAGEFORMS = {};  // data-form submit handlers (forms living on the page, not in a modal)

const reindex = col => { IDX[col] = new Map(D[col].map(x => [x.id, x])); };
const byId = (col, id) => IDX[col].get(id);
const pat = id => byId('patients', id);
const pName = id => pat(id)?.name || 'مريض محذوف';
const fileNo = p => '#' + String(p?.fileNo || 0).padStart(4, '0');
const isReady = () => app.mode === 'local' || app.mode === 'device' ||(app.mode === 'live' && app.loaded.size >= COLS.length);
const W = () => app.canWrite;
const docName = () => S.doctorName ? 'د. ' + S.doctorName : 'الطبيب';
const clinicName = () => S.clinicName || (S.doctorName ? 'عيادة د. ' + S.doctorName : 'العيادة');

/* derived helpers used across views */
const visitsOf = pid => D.visits.filter(v => v.patientId === pid).sort((a, b) => (b.date + (b.createdAt || '')).localeCompare(a.date + (a.createdAt || '')));
const apptsOf = pid => D.appointments.filter(a => a.patientId === pid).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
const invoicesOf = pid => D.invoices.filter(i => i.patientId === pid).sort((a, b) => (b.no || 0) - (a.no || 0));
const byTime = (a, b) => (a.date + a.time).localeCompare(b.date + b.time);
function invCalc(inv) {
  const gross = sum(inv.items || [], it => (+it.qty || 1) * (+it.price || 0));
  const total = Math.max(0, gross - (+inv.discount || 0));
  const paid = sum(inv.payments || [], p => p.amount);
  const due = Math.max(0, total - paid);
  const status = total === 0 ? 'paid' : paid >= total ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
  return { gross, total, paid, due, status };
}
const INV_STATUS = { paid: 'مدفوعة', partial: 'مدفوعة جزئيًا', unpaid: 'غير مدفوعة' };
const balanceOf = pid => sum(invoicesOf(pid), i => invCalc(i).due);
const lastVisit = pid => visitsOf(pid)[0];
function bmi(w, hcm) { const h = (+hcm || 0) / 100; return w && h ? (+w / (h * h)) : null; }
function bmiLabel(b) { if (!b) return ''; return b < 18.5 ? 'نحافة' : b < 25 ? 'طبيعي' : b < 30 ? 'زيادة وزن' : 'سمنة'; }
function isWorkDay(iso) { return (S.workDays || []).includes(dObj(iso).getDay()); }
function daySlots(iso) {
  const out = [];
  if (!isWorkDay(iso)) return out;
  const st = tmin(S.start), en = tmin(S.end), step = Math.max(5, +S.slot || 20);
  const bs = S.breakStart ? tmin(S.breakStart) : -1, be = S.breakEnd ? tmin(S.breakEnd) : -1;
  for (let m = st; m + step <= en || (m < en && out.length === 0); m += step) {
    out.push({ time: mtime(m), brk: bs >= 0 && m >= bs && m < be });
  }
  return out;
}
function freeSlots(iso, fromNow = false) {
  const taken = new Set(D.appointments.filter(a => a.date === iso && OPEN_STATUSES.concat('done').includes(a.status)).map(a => a.time));
  const nm = nowMin();
  return daySlots(iso).filter(s => !s.brk && !taken.has(s.time) && (!fromNow || iso !== today() || tmin(s.time) > nm));
}
function nextFreeSlot(fromIso = today()) {
  for (let i = 0; i < 60; i++) {
    const d = addDays(fromIso, i);
    const f = freeSlots(d, true);
    if (f.length) return { date: d, time: f[0].time };
  }
  return null;
}

/* ---------- storage ---------- */
function writeErr(e) {
  const c = e && e.code;
  if (c === 'quota_exceeded') return 'امتلأت مساحة قاعدة البيانات. احذف سجلات قديمة غير لازمة ثم أعد المحاولة.';
  if (c === 'invalid_argument') return 'تعذّر الحفظ: ليست لديك صلاحية تعديل بيانات العيادة، أو أن السجل كبير جدًا.';
  if (c === 'resource_exhausted') return 'عمليات كثيرة في وقت قصير. انتظر لحظات ثم أعد المحاولة.';
  return 'تعذّر الحفظ. تحقق من الاتصال ثم أعد المحاولة.';
}
function applyLocal(col, obj, del) {
  const a = D[col], i = a.findIndex(x => x.id === obj.id);
  if (del) { if (i >= 0) a.splice(i, 1); }
  else if (i >= 0) a[i] = obj; else a.push(obj);
  reindex(col);
}
/* Device storage: used only when the page runs outside claude.ai (e.g. GitHub Pages),
   where there is no shared database — records then live in this browser's IndexedDB. */
const IDB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('iraq-clinic', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('docs');
      r.onsuccess = () => { this.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  store(mode) { return this.db.transaction('docs', mode).objectStore('docs'); },
  all() {
    return new Promise((res, rej) => {
      const out = [], c = this.store('readonly').openCursor();
      c.onsuccess = () => { const cur = c.result; if (cur) { out.push([cur.key, cur.value]); cur.continue(); } else res(out); };
      c.onerror = () => rej(c.error);
    });
  },
  put(k, v) { return new Promise((res, rej) => { const r = this.store('readwrite').put(v, k); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }); },
  del(k) { return new Promise((res, rej) => { const r = this.store('readwrite').delete(k); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }); }
};
async function save(col, obj) {
  const now = Date.now();
  obj = { ...obj, updatedAt: now };
  if (!obj.createdAt) obj.createdAt = now;
  const body = JSON.parse(JSON.stringify(obj));
  if (app.mode === 'live') {
    try { await app.db.collection(col).doc(obj.id).set(body); }
    catch (e) { toast(writeErr(e)); throw e; }
  } else if (app.mode === 'device') {
    try { await IDB.put(col + '/' + obj.id, body); }
    catch (e) { toast('تعذّر الحفظ في ذاكرة الجهاز. قد تكون المساحة ممتلئة.'); throw e; }
  }
  applyLocal(col, obj);
  scheduleRender();
  return obj;
}
async function patch(col, id, fields) {
  const cur = byId(col, id);
  if (!cur) return;
  return save(col, { ...cur, ...fields });
}
async function remove(col, id) {
  if (app.mode === 'live') {
    try { await app.db.collection(col).doc(id).delete(); }
    catch (e) { toast(writeErr(e)); throw e; }
  } else if (app.mode === 'device') await IDB.del(col + '/' + id);
  applyLocal(col, { id }, true);
  scheduleRender();
}
async function saveSettings(next) {
  const s = { ...S, ...next };
  if (app.mode === 'live') {
    try { await app.db.doc('settings/clinic').set(JSON.parse(JSON.stringify(s))); }
    catch (e) { toast(writeErr(e)); throw e; }
  } else if (app.mode === 'device') await IDB.put('settings/clinic', JSON.parse(JSON.stringify(s)));
  S = s; applySettings(); scheduleRender();
}

/* ---------- local drafts (per-viewer convenience only) ---------- */
const lsGet = k => { try { const v = localStorage.getItem('clinic:' + k); return v ? JSON.parse(v) : null; } catch (e) { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem('clinic:' + k) : localStorage.setItem('clinic:' + k, JSON.stringify(v)); } catch (e) { } };

/* ---------- routing & rendering ---------- */
const NAV = [
  ['home', 'اليوم', '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5h4v5"/>'],
  ['calendar', 'المواعيد', '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'],
  ['patients', 'المرضى', '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.6 3.1-6 6.5-6s6 2.4 6.5 6"/><path d="M16 4.5a3.3 3.3 0 0 1 0 6.6M18 14.3c2 .8 3.3 2.9 3.5 5.7"/>'],
  ['finance', 'الحسابات', '<rect x="2.5" y="6" width="19" height="13" rx="2"/><path d="M2.5 10h19"/><circle cx="16.5" cy="14.5" r="1.4"/>'],
  ['inventory', 'المخزون', '<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/>'],
  ['reports', 'التقارير', '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'],
  ['settings', 'الإعدادات', '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>']
];
const TOP_ROUTES = NAV.map(n => n[0]);
const icon = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;

function buildNav() {
  const waiting = D.appointments.filter(a => a.date === today() && a.status === 'waiting').length;
  const top = TOP_ROUTES.includes(ui.route) ? ui.route : (ui.route === 'patient' || ui.route === 'visit' ? 'patients' : 'home');
  $('#nav').innerHTML = NAV.map(([k, t, p]) => `<button data-act="nav" data-id="${k}" ${top === k ? 'aria-current="page"' : ''}>${icon(p)}<span>${t}</span>${k === 'home' && waiting ? `<span class="badge" title="في الانتظار">${waiting}</span>` : ''}</button>`).join('');
  $('#topActs').innerHTML = W() ? `<button class="btn" data-act="newAppt">${icon('<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M12 13v5M9.5 15.5h5"/>')}موعد</button><button class="btn primary" data-act="newPatient">${icon('<path d="M12 5v14M5 12h14"/>')}مريض جديد</button>` : '';
  const modeTxt = app.mode === 'live' ? '<span class="dot live"></span>متصل — البيانات محفوظة' : app.mode === 'device' ? '<span class="dot live"></span>محفوظ على هذا الجهاز' : app.mode === 'local' ? '<span class="dot local"></span>عرض محلي — لا يُحفظ' : '<span class="dot"></span>جارٍ الاتصال…';
  $('#sideFoot').innerHTML = `<div><b>${esc(fmtDayFull(today()))}</b></div><div>${modeTxt}</div>`;
}
function applySettings() {
  $('#bClinic').textContent = clinicName();
  $('#bDoctor').textContent = S.doctorName ? `${docName()}${S.specialty ? ' — ' + S.specialty : ''}` : 'نظام إدارة العيادة';
  try { document.title = clinicName(); } catch (e) { }
}
function banner() {
  const b = $('#banner');
  let h = '';
  if (app.mode === 'local') h = 'وضع العرض المحلي: قاعدة البيانات غير متاحة في هذا العرض، لذلك تبقى التعديلات حتى إغلاق الصفحة فقط. افتح الرابط من claude.ai لحفظ بيانات العيادة.';
  else if (app.mode === 'device' && backupDue()) h = `البيانات محفوظة في متصفح هذا الجهاز فقط. ${S.lastBackup ? 'آخر نسخة احتياطية قبل ' + daysBetween(S.lastBackup, today()) + ' يوم' : 'لم تنزّل نسخة احتياطية بعد'}. <button class="btn sm" data-act="backup" style="margin-inline-start:8px">نزّل نسخة الآن</button>`;
  else if (app.mode === 'live' && !W()) h ='لديك صلاحية الاطلاع فقط. اطلب من الطبيب صلاحية «مساهم» من قائمة المشاركة لإضافة السجلات وتعديلها.';
  b.innerHTML = h ? `<div class="banner">${h}</div>` : '';
}
const backupDue = () => D.patients.length > 0 && (!S.lastBackup || daysBetween(S.lastBackup, today()) >= 7);
function nav(route, param = null, opts = {}) {
  if (!VIEWS[route]) route = 'home';
  if (VIEWS[ui.route]?.leave) VIEWS[ui.route].leave();
  ui.route = route; ui.param = param;
  if (TOP_ROUTES.includes(route)) { try { history.replaceState(null, '', '#' + route); } catch (e) { } }
  buildShell();
  if (!opts.keepScroll) window.scrollTo(0, 0);
}
function buildShell() {
  const v = VIEWS[ui.route];
  buildNav(); banner();
  $('#view').innerHTML = isReady() || v.noWait ? v.shell(ui.param) : `<div class="loading">جارٍ تحميل بيانات العيادة…</div>`;
  renderBody();
  v.mount?.(ui.param);
}
function renderBody() {
  const v = VIEWS[ui.route];
  if (!isReady() && !v.noWait) return;
  const b = $('#vbody');
  if (!b) { if (!$('#view').firstElementChild || $('#view .loading')) buildShell(); return; }
  b.innerHTML = v.body(ui.param);
  v.after?.(ui.param);
}
let rq = false;
function scheduleRender() {
  if (rq) return; rq = true;
  setTimeout(() => { rq = false; render(); }, 0);
}
function render() { buildNav(); banner(); renderBody(); if (modal.live) $('#mBody').innerHTML = modal.live(); }

/* ---------- modal ---------- */
const modal = { submit: null, live: null, onClose: null };
function openModal(title, html, o = {}) {
  modal.submit = o.submit || null; modal.live = o.live || null; modal.onClose = o.onClose || null;
  $('#mTitle').textContent = title;
  $('#mBody').innerHTML = html;
  $('#sheet').classList.toggle('wide', !!o.wide);
  $('#overlay').hidden = false;
  document.body.style.overflow = 'hidden';
  const f = $('#mBody').querySelector('[autofocus],input:not([type=hidden]):not([type=checkbox]),select,textarea');
  if (f && !o.noFocus) setTimeout(() => f.focus(), 30);
}
function closeModal() {
  $('#overlay').hidden = true; $('#mBody').innerHTML = '';
  document.body.style.overflow = '';
  const cb = modal.onClose; modal.submit = modal.live = modal.onClose = null;
  cb && cb();
}
function confirmBox(msg, yes, label = 'حذف نهائي') {
  openModal('تأكيد', `<form id="mForm" class="form"><p class="full" style="margin:0;font-size:1rem">${msg}</p><div class="m-foot"><button class="btn danger-fill" type="submit">${label}</button><button class="btn" type="button" data-act="closeModal">تراجع</button></div></form>`, { submit: async () => { await yes(); return true; } });
}
function formErr(m) { const e = $('#mErr') || $('#pErr'); if (e) { e.textContent = m; e.hidden = false; e.scrollIntoView({ block: 'nearest' }); } else toast(m); return false; }
const mfoot = (label = 'حفظ', extra = '') => `<div id="mErr" class="err" hidden></div><div class="m-foot"><button class="btn primary" type="submit">${label}</button>${extra}<button class="btn" type="button" data-act="closeModal">إلغاء</button></div>`;
const opts = (arr, sel, ph) => (ph != null ? `<option value="">${esc(ph)}</option>` : '') + arr.map(x => { const [v, t] = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(v)}" ${String(sel ?? '') === String(v) ? 'selected' : ''}>${esc(t)}</option>`; }).join('');
const patOpts = sel => opts([...D.patients].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar')).map(p => [p.id, `${p.name} — ${fileNo(p)}${p.phone ? ' — ' + p.phone : ''}`]), sel, 'اختر المريض');

/* ---------- toast & tooltip ---------- */
let toastT;
function toast(msg, action) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button" id="toastBtn">${esc(action.label)}</button>` : ''}`;
  t.hidden = false;
  if (action) $('#toastBtn').onclick = () => { t.hidden = true; action.fn(); };
  clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, action ? 7000 : 3400);
}
document.addEventListener('mouseover', e => {
  const el = e.target.closest('[data-tip]'); const tip = $('#tip');
  if (!el) { tip.hidden = true; return; }
  tip.textContent = el.getAttribute('data-tip'); tip.hidden = false;
});
document.addEventListener('mousemove', e => {
  const tip = $('#tip'); if (tip.hidden) return;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let x = e.clientX + 14, y = e.clientY - h - 12;
  if (x + w > innerWidth - 8) x = e.clientX - w - 14;
  if (y < 8) y = e.clientY + 18;
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
});

/* ---------- clipboard & downloads ---------- */
async function copyText(txt, okMsg = 'تم النسخ') {
  try { await navigator.clipboard.writeText(txt); toast(okMsg); return true; }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (_) { }
    ta.remove(); toast(ok ? okMsg : 'تعذّر النسخ تلقائيًا. حدّد النص وانسخه يدويًا.'); return ok;
  }
}
async function downloadFile(filename, data) {
  if (app.mode === 'device') {
    // outside claude.ai the browser can save files directly
    const a = document.createElement('a');
    a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: /\.csv$/.test(filename) ? 'text/csv' : /\.json$/.test(filename) ? 'application/json' : 'text/html' }));
    a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('جاهز: ' + filename); return true;
  }
  if (!app.downloads) { toast('تنزيل الملفات غير متاح في هذا العرض. افتح الصفحة من claude.ai.'); return false; }
  try { await app.downloads.save({ filename, data }); toast('جاهز: ' + filename); return true; }
  catch (e) {
    if (e && e.code === 'declined') return false;
    if (e && e.code === 'rate_limited') { toast('هناك طلب تنزيل مفتوح بالفعل. أكمله ثم أعد المحاولة.'); return false; }
    toast('تعذّر تنزيل الملف.'); return false;
  }
}
const safeName = s => String(s || '').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'ملف';
function toCSV(rows) {
  const q = v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return '﻿' + rows.map(r => r.map(q).join(',')).join('\r\n');
}

/* ---------- printable documents ---------- */
function docHeaderHtml() {
  return `<div class="dh"><div><h2>${esc(clinicName())}</h2><small>${esc(docName())}${S.degree ? ' — ' + esc(S.degree) : ''}</small>${S.specialty ? `<small>${esc(S.specialty)}</small>` : ''}${S.license ? `<small>رقم الهوية النقابية: ${esc(S.license)}</small>` : ''}</div>
  <div style="text-align:left">${S.phone ? `<small dir="ltr">${esc(fmtPhone(S.phone))}${S.phone2 ? ' / ' + esc(fmtPhone(S.phone2)) : ''}</small>` : ''}${S.province || S.address ? `<small>${esc([S.province, S.address].filter(Boolean).join(' — '))}</small>` : ''}</div></div>`;
}
function docFooterHtml() {
  return `<div class="sig"><div>ختم العيادة</div><div>توقيع ${esc(docName())}</div></div>${S.docFooter ? `<div class="df">${esc(S.docFooter)}</div>` : ''}`;
}
const DOC_CSS = `@page{size:A5;margin:12mm}*{box-sizing:border-box}body{font-family:"IBM Plex Sans Arabic","Segoe UI",Tahoma,sans-serif;color:#1b1b1b;margin:0;background:#eef2f1;font-size:14px;line-height:1.7}
.docprev{background:#fff;max-width:640px;margin:24px auto;padding:30px 32px;border-radius:6px;box-shadow:0 2px 12px rgba(0,0,0,.1)}
.dh{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #0b6a62;padding-bottom:12px;margin-bottom:14px}.dh h2{margin:0;font-family:"Reem Kufi",Tahoma,sans-serif;color:#0b6a62;font-size:21px}.dh small{display:block;color:#555}
h1{font-size:18px;text-align:center;margin:6px 0 14px;font-family:"Reem Kufi",Tahoma,sans-serif}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:6px 8px;text-align:right}th{background:#f2f6f5}
.meta{display:flex;flex-wrap:wrap;gap:4px 22px;background:#f2f6f5;padding:8px 12px;border-radius:6px;margin-bottom:12px}.rxsym{font-size:26px;font-weight:700;color:#0b6a62;font-family:serif}ol{padding-right:22px}
.sig{margin-top:44px;display:flex;justify-content:space-between;gap:20px}.sig div{min-width:170px;text-align:center;border-top:1px solid #999;padding-top:6px;color:#555}.df{margin-top:24px;border-top:1px solid #ddd;padding-top:8px;font-size:12px;color:#666;text-align:center}
.bar{max-width:640px;margin:16px auto 0;display:flex;justify-content:flex-start}.bar button{font:inherit;background:#0b6a62;color:#fff;border:0;border-radius:6px;padding:8px 18px;cursor:pointer}
@media print{body{background:#fff}.docprev{box-shadow:none;margin:0;max-width:none;padding:0}.bar{display:none}}`;
function docFile(title, inner) {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&family=Reem+Kufi:wght@600;700&display=swap"><style>${DOC_CSS}</style></head>
<body><div class="bar"><button onclick="print()">طباعة</button></div><div class="docprev">${docHeaderHtml()}${inner}${docFooterHtml()}</div></body></html>`;
}
function showDoc(title, inner, filename) {
  const full = `${docHeaderHtml()}${inner}${docFooterHtml()}`;
  openModal(title, `<div class="docprev" id="docPrev">${full}</div>
    <div class="m-foot" style="margin-top:12px">
      <button class="btn primary" type="button" id="docDl">${icon('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>')}تنزيل للطباعة</button>
      <button class="btn" type="button" id="docCopy">نسخ النص</button>
      <button class="btn" type="button" data-act="closeModal">إغلاق</button>
    </div>
    <p class="muted" style="font-size:.82rem;margin:8px 0 0">يُنزَّل المستند كملف HTML بحجم A5؛ افتحه في المتصفح واضغط «طباعة» أو احفظه PDF.</p>`, { wide: true, noFocus: true });
  $('#docDl').onclick = () => downloadFile(safeName(filename) + '.html', docFile(title, inner));
  $('#docCopy').onclick = () => copyText($('#docPrev').innerText, 'نُسخ نص المستند');
}

/* ---------- global events ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (b) {
    if (b.tagName === 'A' && !b.dataset.act) return;
    e.preventDefault();
    const fn = ACT[b.dataset.act];
    if (fn) Promise.resolve(fn(b.dataset.id, b, e)).catch(err => { if (err && !err.code) console.error(err); });
    return;
  }
  if (e.target.id === 'overlay') closeModal();
  if (!e.target.closest('.search')) $('#gres').hidden = true;
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (!$('#overlay').hidden) closeModal(); else $('#gres').hidden = true; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#gq').focus(); }
});
document.addEventListener('change', e => {
  const t = e.target.closest && e.target.closest('[data-change]'), h = t && t.dataset.change;
  if (h && CHG[h]) Promise.resolve(CHG[h](t === e.target ? t : e.target, e)).catch(() => { });
});
document.addEventListener('input', e => {
  const t = e.target.closest && e.target.closest('[data-input]'), h = t && t.dataset.input;
  if (h && INP[h]) INP[h](t === e.target ? t : e.target, e);
});
document.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, fd = new FormData(f), data = Object.fromEntries(fd);
  const btn = f.querySelector('[type=submit]');
  const run = async fn => {
    if (btn) btn.disabled = true;
    try { return await fn(data, fd, f); }
    catch (err) { if (err && err.code) formErr(writeErr(err)); else { console.error(err); formErr('حدث خطأ غير متوقع. أعد المحاولة.'); } return false; }
    finally { if (btn && btn.isConnected) btn.disabled = false; }
  };
  if (f.id === 'mForm' && modal.submit) { const ok = await run(modal.submit); if (ok === true) closeModal(); return; }
  const pf = f.dataset.form && PAGEFORMS[f.dataset.form];
  if (pf) await run(pf);
});

ACT.nav = id => nav(id);
ACT.closeModal = () => closeModal();
ACT.back = () => history.length > 1 && ui.prev ? nav(ui.prev.route, ui.prev.param) : nav('home');

/* ---------- global patient search ---------- */
function searchPatients(q, limit = 8) {
  const n = norm(q); if (!n) return [];
  const digits = q.replace(/\D/g, '');
  return D.patients.filter(p => norm(p.name).includes(n) || (digits && ((p.phone || '').replace(/\D/g, '').includes(digits) || String(p.fileNo) === digits.replace(/^0+/, '') || (p.nid || '').includes(digits))))
    .sort((a, b) => norm(a.name).indexOf(n) - norm(b.name).indexOf(n)).slice(0, limit);
}
let gSel = -1;
function drawGres() {
  const q = $('#gq').value, box = $('#gres');
  if (!q.trim()) { box.hidden = true; return; }
  const r = searchPatients(q);
  box.innerHTML = r.length ? r.map((p, i) => `<button type="button" data-act="openPatient" data-id="${p.id}" class="${i === gSel ? 'on' : ''}"><span><b>${esc(p.name)}</b> <span class="muted num">${fileNo(p)}</span></span><span class="muted ltr num">${esc(p.phone || '')}</span></button>`).join('')
    : `<div class="none">لا يوجد مريض بهذا الاسم أو الرقم.${W() ? ` <button class="btn sm" data-act="newPatient" data-id="${esc(q)}" style="margin-inline-start:6px">تسجيل «${esc(q)}»</button>` : ''}</div>`;
  box.hidden = false;
}
$('#gq').addEventListener('input', () => { gSel = -1; drawGres(); });
$('#gq').addEventListener('focus', drawGres);
$('#gq').addEventListener('keydown', e => {
  const items = $$('#gres button[data-act="openPatient"]');
  if (e.key === 'ArrowDown') { gSel = Math.min(items.length - 1, gSel + 1); drawGres(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { gSel = Math.max(0, gSel - 1); drawGres(); e.preventDefault(); }
  else if (e.key === 'Enter') { const it = items[gSel < 0 ? 0 : gSel]; if (it) { it.click(); } }
});
ACT.openPatient = id => { $('#gq').value = ''; $('#gres').hidden = true; openPatient(id); };
function openPatient(id, tab) { ui.prev = { route: ui.route, param: ui.param }; if (tab) ui.ptab = tab; else ui.ptab = 'overview'; nav('patient', id); }

/* ---------- boot ---------- */
const App = {
  async start() {
    applySettings();
    const h = (location.hash || '').slice(1);
    nav(TOP_ROUTES.includes(h) ? h : 'home');
    setInterval(() => { if (ui.route === 'home' && $('#overlay').hidden) renderBody(); }, 60000);
    setInterval(() => { if (ui.route === 'tv') renderBody(); }, 20000);
    const c = window.claude;
    if (!c || typeof c.use !== 'function') {
      // standalone (GitHub Pages or a local file): keep records in this browser
      try {
        await IDB.open();
        for (const [k, v] of await IDB.all()) {
          const i = k.indexOf('/'), col = k.slice(0, i);
          if (k === 'settings/clinic') S = { ...DEFAULT_SETTINGS, ...v };
          else if (D[col]) D[col].push({ ...v, id: k.slice(i + 1) });
        }
        COLS.forEach(reindex);
        app.mode = 'device'; app.settingsLoaded = true;
        try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { }
      } catch (e) { app.mode = 'local'; }
      applySettings(); buildShell(); return;
    }
    let db = null;
    try { db = await c.use('db'); } catch (e) { db = null; }
    if (!db) { app.mode = 'local'; buildShell(); return; }
    app.db = db; app.mode = 'live';
    const wasReady = new Set();
    COLS.forEach(col => db.collection(col).onSnapshot(snap => {
      D[col] = snap.docs.map(x => ({ ...x.data(), id: x.id }));
      reindex(col); app.loaded.add(col);
      if (app.loaded.size === COLS.length && !wasReady.has('all')) { wasReady.add('all'); buildShell(); }
      else scheduleRender();
    }, err => {
      app.loaded.add(col);
      if (err && err.code === 'revoked') { app.mode = 'local'; buildShell(); }
      else toast('تعذّر تحميل جزء من البيانات. أعد تحميل الصفحة.');
    }));
    db.doc('settings/clinic').onSnapshot(s => {
      if (s.exists) S = { ...DEFAULT_SETTINGS, ...s.data() };
      app.settingsLoaded = true; applySettings();
      if (ui.route === 'settings' && !document.activeElement?.closest('#view form')) buildShell(); else scheduleRender();
    }, () => { });
    c.use('user').then(u => u ? u.can('data.write') : null).then(v => { if (v === false) { app.canWrite = false; buildShell(); } }).catch(() => { });
    c.use('downloads').then(x => { app.downloads = x; }).catch(() => { });
    c.use('assets').then(x => { app.assets = x; if (ui.route === 'patient') scheduleRender(); }).catch(() => { });
  }
};
