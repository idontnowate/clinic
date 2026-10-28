'use strict';
/* demo.js — عيادة تجريبية: «جرّب البرنامج بدون حساب» من صفحة الدخول.
   بيانات وهمية في الذاكرة فقط؛ لا شيء يُحفظ ولا يُرسل، وتختفي عند إغلاق الصفحة أو الخروج من التجربة. */
const Demo = {
  seed() {
    const t = today(), d = n => addDays(t, n), rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    S = { ...DEFAULT_SETTINGS, clinicName: 'عيادة د. تجربة للباطنية', doctorName: 'تجربة', specialty: 'أخصائي الأمراض الباطنة', degree: 'بورد عراقي في الباطنية',
      phone: '07700000000', province: 'بغداد', address: 'الكرادة — شارع الأطباء', hoursSet: true, start: '16:00', end: '22:00', slot: 15 };
    const names = [
      ['علي حسن كاظم', 'ذكر', 1978, 'سكري النوع الثاني، ارتفاع ضغط الدم'], ['زينب محمد عبد الله', 'أنثى', 1992, ''], ['حسين عباس جاسم', 'ذكر', 1965, 'ارتفاع ضغط الدم'],
      ['فاطمة كريم سلمان', 'أنثى', 1988, 'قصور الغدة الدرقية'], ['مصطفى عادل فاضل', 'ذكر', 2001, ''], ['نور الهدى صباح', 'أنثى', 1996, 'ربو قصبي'],
      ['أحمد جبار ناصر', 'ذكر', 1959, 'سكري، ارتفاع دهون الدم'], ['مريم حيدر علي', 'أنثى', 2015, ''], ['كرار سعد محمود', 'ذكر', 1983, ''],
      ['هدى رزاق مهدي', 'أنثى', 1971, 'ارتفاع ضغط الدم'], ['محمد قاسم يوسف', 'ذكر', 1999, ''], ['سارة ماجد حميد', 'أنثى', 1985, '']
    ];
    D.patients = names.map(([name, gender, y, chronic], i) => ({
      id: 'dp' + i, fileNo: i + 1, name, gender, dob: `${y}-${String(rnd(1, 12)).padStart(2, '0')}-${String(rnd(1, 28)).padStart(2, '0')}`,
      phone: '07' + ['70', '80', '50', '90'][i % 4] + String(1000000 + i * 734521).slice(0, 7), province: 'بغداد', chronic,
      allergies: i === 2 ? 'البنسلين' : '', blood: ['O+', 'A+', 'B+', 'AB+'][i % 4], createdAt: Date.now() - (60 - i) * 864e5
    }));
    D.services = [['كشفية', 25000], ['مراجعة', 10000], ['تخطيط قلب ECG', 15000], ['سونار', 30000], ['زرق إبرة', 5000], ['قياس سكر', 3000]]
      .map(([name, price], i) => ({ id: 'ds' + i, name, price, order: i }));
    D.meds = [
      ['ميتفورمين 500 ملغ', 'أقراص', 'قرص واحد', 'مرتين يوميًا', 'مستمر', 'بعد الأكل'], ['أملوديبين 5 ملغ', 'أقراص', 'قرص واحد', 'مرة يوميًا', 'مستمر', ''],
      ['أموكسيسيلين 500 ملغ', 'كبسولات', 'كبسولة', 'ثلاث مرات يوميًا', '7 أيام', ''], ['باراسيتامول 500 ملغ', 'أقراص', 'قرص أو قرصين', 'عند اللزوم', '', 'لا يزيد عن 8 يوميًا'],
      ['أوميبرازول 20 ملغ', 'كبسولات', 'كبسولة', 'مرة يوميًا', '14 يوم', 'قبل الفطور'], ['ليفوثيروكسين 50 مكغ', 'أقراص', 'قرص واحد', 'صباحًا', 'مستمر', 'على الريق']
    ].map(([name, form, dose, freq, duration, notes], i) => ({ id: 'dm' + i, name, form, dose, freq, duration, notes }));
    const dx = [['سكري النوع الثاني', 0], ['ارتفاع ضغط الدم', 1], ['التهاب البلعوم', 2], ['التهاب المعدة', 4], ['قصور الغدة الدرقية', 5], ['صداع توتري', 3]];
    D.visits = []; D.invoices = []; D.appointments = [];
    let no = 1;
    for (let i = 0; i < 26; i++) {
      const p = D.patients[i % D.patients.length], day = d(-rnd(1, 45)), [diag, mi] = dx[i % dx.length], m = D.meds[mi];
      const vid = 'dv' + i, iid = 'di' + i, price = i % 3 ? 25000 : 10000;
      D.visits.push({ id: vid, patientId: p.id, date: day, type: i % 3 ? 'new' : 'followup', complaint: ['ألم في المعدة', 'صداع متكرر', 'التهاب الحلق وحرارة', 'متابعة السكر', 'متابعة الضغط', 'تعب عام'][i % 6],
        diagnoses: [diag], rx: [{ drug: m.name, form: m.form, dose: m.dose, freq: m.freq, duration: m.duration, notes: m.notes }],
        labs: i % 4 === 0 ? [{ name: 'سكر تراكمي HbA1c', result: (6 + Math.random() * 3).toFixed(1) + '%', flag: 'abnormal', resultDate: day }] : [],
        vitals: { bps: rnd(110, 150), bpd: rnd(70, 95), pulse: rnd(66, 96), temp: (36.5 + Math.random()).toFixed(1), weight: rnd(55, 98) },
        invoiceId: iid, createdAt: Date.parse(day) });
      const paid = i % 5 === 0 ? price / 2 : price;
      D.invoices.push({ id: iid, no: no++, patientId: p.id, visitId: vid, date: day, items: [{ name: price === 25000 ? 'كشفية' : 'مراجعة', qty: 1, price }], discount: 0,
        payments: [{ date: day, amount: paid, method: i % 4 ? 'نقدي' : 'زين كاش' }], createdAt: Date.parse(day) });
    }
    const slots = daySlots(isWorkDay(t) ? t : nextWorkDayFrom(t)).filter(s => !s.brk).map(s => s.time);
    const apDay = isWorkDay(t) ? t : nextWorkDayFrom(t);
    const states = ['done', 'done', 'in', 'waiting', 'waiting', 'confirmed', 'booked', 'booked'];
    states.forEach((status, i) => D.appointments.push({ id: 'da' + i, patientId: D.patients[i].id, date: apDay, time: slots[i * 2] || '18:00', type: i % 3 ? 'new' : 'followup', status, reason: ['مراجعة نتائج تحاليل', 'ألم في المفاصل', 'متابعة السكر', 'حرارة وسعال', '', 'فحص دوري', 'ضيق تنفس', ''][i] }));
    // من كُشف اليوم: كشف وفاتورة مدفوعة اليوم
    D.appointments.filter(x => x.status === 'done').forEach((x, i) => {
      const vid = 'dt' + i, iid = 'dti' + i;
      D.visits.push({ id: vid, patientId: x.patientId, date: apDay, type: x.type, complaint: x.reason, diagnoses: [dx[i][0]], rx: [{ drug: D.meds[dx[i][1]].name, dose: D.meds[dx[i][1]].dose, freq: D.meds[dx[i][1]].freq, duration: D.meds[dx[i][1]].duration }], labs: [], vitals: { bps: 125, bpd: 80, pulse: 78 }, invoiceId: iid, apptId: x.id, createdAt: Date.now() - (2 - i) * 3600000 });
      D.invoices.push({ id: iid, no: no++, patientId: x.patientId, visitId: vid, date: apDay, items: [{ name: 'كشفية', qty: 1, price: 25000 }], discount: 0, payments: [{ date: apDay, amount: 25000, method: 'نقدي' }], createdAt: Date.now() });
    });
    for (let i = 0; i < 6; i++) D.appointments.push({ id: 'db' + i, patientId: D.patients[(i + 6) % 12].id, date: d(rnd(1, 9)), time: slots[i] || '17:00', type: 'followup', status: 'booked', reason: 'مراجعة' });
    D.expenses = [['إيجار', 'إيجار العيادة', 750000], ['رواتب', 'راتب السكرتيرة', 450000], ['اشتراك المولدة', 'أمبيرات الشهر', 120000], ['مستلزمات طبية', 'قفازات وشاش وكحول', 65000]]
      .map(([category, desc, amount], i) => ({ id: 'de' + i, date: d(-rnd(2, 20)), category, desc, amount, method: 'نقدي' }));
    D.inventory = [['قفازات لاتكس', 'مستلزمات', 'علبة', 3, 5, 9000], ['شاش معقم', 'مستلزمات', 'علبة', 12, 4, 3500], ['سرنجات 5 مل', 'حقن ومحاليل', 'قطعة', 140, 50, 250],
      ['محلول ملحي 500 مل', 'حقن ومحاليل', 'قطعة', 8, 10, 2000], ['شرائط فحص السكر', 'أدوات', 'علبة', 4, 2, 18000]]
      .map(([name, cat, unit, qty, min, cost], i) => ({ id: 'dk' + i, name, cat, unit, qty, min, cost, expiry: i === 3 ? d(20) : d(300) }));
    D.files = []; D.reports = [];
    COLS.forEach(reindex);
  }
};
function nextWorkDayFrom(iso) { for (let i = 1; i < 8; i++) { const x = addDays(iso, i); if (isWorkDay(x)) return x; } return iso; }
