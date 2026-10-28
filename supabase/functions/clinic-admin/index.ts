// @ts-nocheck
// clinic-admin — عمليات لوحة مزود العيادات. كل طلب يتحقق أولًا أن المتصل موجود في جدول providers
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

// النسخة الدائمية: تُباع مرة واحدة ولا تنتهي
const LIFETIME_PLAN = "دائمي";
const INTERNAL_EMAIL_DOMAIN = "users.clinicapp.io";
const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;
// مدة الحظر عند تعطيل حساب (عمليًا دائم حتى يُفعَّل)
const BAN_FOREVER = "876000h";
const BUCKET = "clinic-files";

// خطأ يظهر للمزود كما هو
class UserError extends Error {
    status: number;
    constructor(message: string, status = 400) {
        super(message);
        this.status = status;
    }
}

function today() {
    return new Date().toISOString().slice(0, 10);
}

// نفس قاعدة clinic_is_active: تنبيه قبل 7 أيام، ومهلة 3 أيام بعد الانتهاء، ثم إيقاف
function statusOf(sub) {
    if (!sub) return { status: "none", daysLeft: null };
    const daysLeft = sub.expires_at
        ? Math.round((Date.parse(sub.expires_at) - Date.parse(today())) / 86400000)
        : null;
    if (sub.suspended) return { status: "suspended", daysLeft };
    if (daysLeft === null) return { status: "active", daysLeft };
    if (daysLeft > 7) return { status: "active", daysLeft };
    if (daysLeft >= 0) return { status: "expiring", daysLeft };
    if (daysLeft >= -3) return { status: "grace", daysLeft };
    return { status: "expired", daysLeft };
}

function addMonths(dateStr: string, months: number) {
    const d = new Date(dateStr + "T00:00:00Z");
    const day = d.getUTCDate();
    d.setUTCMonth(d.getUTCMonth() + months);
    // 31 كانون الثاني + شهر = آخر شباط، لا 3 آذار
    if (d.getUTCDate() < day) d.setUTCDate(0);
    return d.toISOString().slice(0, 10);
}

function str(v: unknown) {
    return String(v ?? "").trim();
}

function validDate(v: string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));
}

async function listAllUsers(admin) {
    const users = [];
    for (let page = 1; page < 100; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        users.push(...data.users);
        if (data.users.length < 1000) break;
    }
    return users;
}

function checkNewAccount(username: string, password: string, name: string) {
    if (!USERNAME_RE.test(username)) {
        throw new UserError("اسم المستخدم: أحرف إنجليزية وأرقام و . _ - فقط (3 إلى 30 حرفًا)");
    }
    if (password.length < 8) throw new UserError("كلمة المرور 8 أحرف على الأقل");
    if (!name) throw new UserError("أدخل الاسم الظاهر");
}

async function ensureUsernameFree(admin, username: string) {
    const { data } = await admin.from("clinic_members").select("user_id").eq("username", username).maybeSingle();
    if (data) throw new UserError("اسم المستخدم مستخدم بالفعل", 409);
}

// ينشئ حساب دخول ويربطه بالعيادة؛ يتراجع عن الحساب إذا فشل الربط
async function createMember(admin, clinicId: string, username: string, password: string, name: string, role: string) {
    const { data: created, error } = await admin.auth.admin.createUser({
        email: `${username}@${INTERNAL_EMAIL_DOMAIN}`,
        password,
        email_confirm: true,
        user_metadata: { username, name, app: "clinic" },
    });
    if (error || !created.user) {
        if (/already|registered|exists/i.test(error?.message ?? "")) throw new UserError("اسم المستخدم مستخدم بالفعل", 409);
        throw new UserError(error?.message ?? "تعذر إنشاء الحساب");
    }

    const { error: memberErr } = await admin.from("clinic_members").insert({
        clinic_id: clinicId,
        user_id: created.user.id,
        role,
        display_name: name,
        username,
    });
    if (memberErr) {
        await admin.auth.admin.deleteUser(created.user.id);
        throw new UserError("تعذر ربط الحساب بالعيادة: " + (memberErr.message || memberErr.code || "خطأ غير معروف"), 500);
    }
    return created.user.id;
}

async function memberOf(admin, userId: string) {
    const { data } = await admin.from("clinic_members").select("clinic_id, role, username").eq("user_id", userId).maybeSingle();
    if (!data) throw new UserError("الحساب غير موجود", 404);
    return data;
}

// يغيّر اسم العيادة في إعداداتها فيظهر في البرنامج على كل الأجهزة
async function renameClinic(admin, clinicId: string, name: string) {
    const { data: row, error } = await admin.from("clinic_docs").select("data")
        .eq("clinic_id", clinicId).eq("col", "settings").eq("id", "clinic").maybeSingle();
    if (error) throw error;
    const settings = row?.data && typeof row.data === "object" ? row.data : {};
    if (settings.clinicName !== name) {
        const { error: writeErr } = await admin.from("clinic_docs").upsert({
            clinic_id: clinicId, col: "settings", id: "clinic", data: { ...settings, clinicName: name }, deleted: false,
        });
        if (writeErr) throw writeErr;
    }
    await admin.from("clinics").update({ name }).eq("id", clinicId);
}

// يحذف ربط الحساب بالعيادة ثم حساب الدخول. إذا فشل حذف حساب الدخول يُعاد الربط
async function removeUser(admin, userId: string) {
    const { data: row } = await admin.from("clinic_members").select("*").eq("user_id", userId).maybeSingle();
    if (row) {
        const { error } = await admin.from("clinic_members").delete().eq("user_id", userId);
        if (error) throw new UserError("تعذر حذف الحساب من العيادة: " + error.message, 500);
    }
    const { error: authErr } = await admin.auth.admin.deleteUser(userId);
    if (authErr && authErr.status !== 404 && !/not.?found/i.test(authErr.message)) {
        if (row) await admin.from("clinic_members").insert(row);
        throw new UserError("تعذر حذف حساب الدخول: " + authErr.message, 500);
    }
}

// لا يُحذف أو يُخفَّض آخر طبيب (مدير) في العيادة
async function ensureAnotherAdmin(admin, clinicId: string, userId: string) {
    const { data } = await admin.from("clinic_members").select("user_id").eq("clinic_id", clinicId).eq("role", "admin");
    if (!(data ?? []).some(m => m.user_id !== userId)) {
        throw new UserError("هذا آخر حساب طبيب (مدير) في العيادة. أضف حساب مدير آخر أولًا، أو احذف العيادة كلها");
    }
}

// ===== العمليات =====
const actions = {
    // كل العيادات مع اشتراكاتها وحساباتها وآخر نشاط
    async overview(admin) {
        const [clinics, members, subs, stats, users, plans, devices] = await Promise.all([
            admin.from("clinics").select("id, name, created_at"),
            admin.from("clinic_members").select("clinic_id, user_id, role, display_name, username"),
            admin.from("clinic_subscriptions").select("*"),
            admin.rpc("clinic_provider_stats"),
            listAllUsers(admin),
            admin.from("clinic_device_plans").select("clinic_id, device_limit"),
            admin.from("clinic_devices").select("clinic_id, revoked, last_seen"),
        ]);
        for (const r of [clinics, members, subs, stats]) if (r.error) throw r.error;

        const userById = new Map(users.map(u => [u.id, u]));
        const map = new Map();
        const clinic = (id: string) => {
            if (!map.has(id)) map.set(id, { clinic_id: id, name: "", created_at: null, members: [], subscription: null, last_activity: null, rows_count: 0, patients: 0, device_limit: 0, devices_active: 0 });
            return map.get(id);
        };
        clinics.data.forEach(c => { const x = clinic(c.id); x.name = c.name; x.created_at = c.created_at; });
        subs.data.forEach(s => { const x = clinic(s.clinic_id); x.subscription = s; if (!x.name) x.name = s.clinic_name; });
        stats.data.forEach(s => {
            const x = clinic(s.clinic_id);
            x.last_activity = s.last_activity;
            x.rows_count = s.rows_count;
            x.patients = s.patients;
        });
        // جداول الأجهزة اختيارية: إن لم تُنشأ بعد تبقى القيم صفرًا
        (plans.data ?? []).forEach(p => { clinic(p.clinic_id).device_limit = p.device_limit; });
        const month = Date.now() - 30 * 86400000;
        (devices.data ?? []).forEach(d => {
            if (!d.revoked && Date.parse(d.last_seen) > month) clinic(d.clinic_id).devices_active++;
        });
        members.data.forEach(m => {
            const u = userById.get(m.user_id);
            const bannedUntil = u?.banned_until ? Date.parse(u.banned_until) : 0;
            clinic(m.clinic_id).members.push({
                user_id: m.user_id,
                username: m.username,
                display_name: m.display_name,
                role: m.role,
                last_sign_in_at: u?.last_sign_in_at ?? null,
                disabled: bannedUntil > Date.now(),
            });
        });

        const list = [...map.values()].map(c => ({ ...c, ...statusOf(c.subscription) }));
        list.sort((a, b) => String(a.name).localeCompare(String(b.name), "ar"));
        return { clinics: list, today: today() };
    },

    // عيادة جديدة مع حساب الطبيب واشتراكها
    async create_clinic(admin, b) {
        const clinicName = str(b.clinicName);
        const doctorName = str(b.doctorName);
        const username = str(b.adminUsername).toLowerCase();
        const password = String(b.adminPassword ?? "");
        const adminName = str(b.adminName) || doctorName;
        const plan = str(b.plan) || "شهري";
        const expiresAt = str(b.expiresAt);
        if (!clinicName) throw new UserError("أدخل اسم العيادة");
        checkNewAccount(username, password, adminName);
        if (plan !== LIFETIME_PLAN && !expiresAt) throw new UserError("حدد تاريخ انتهاء الاشتراك");
        if (expiresAt && !validDate(expiresAt)) throw new UserError("تاريخ الانتهاء غير صالح");
        await ensureUsernameFree(admin, username);

        const { data: row, error: cErr } = await admin.from("clinics").insert({ name: clinicName }).select("id").single();
        if (cErr) throw new UserError("تعذر تسجيل العيادة: " + cErr.message, 500);
        const clinicId = row.id;
        const undo = async () => { await admin.from("clinics").delete().eq("id", clinicId); };

        let userId;
        try {
            userId = await createMember(admin, clinicId, username, password, adminName, "admin");
        } catch (err) {
            await undo();
            throw err;
        }

        const { error: subErr } = await admin.from("clinic_subscriptions").insert({
            clinic_id: clinicId,
            clinic_name: clinicName,
            owner_phone: str(b.ownerPhone),
            plan,
            price: Number(b.price) || 0,
            starts_at: today(),
            expires_at: plan === LIFETIME_PLAN ? null : expiresAt,
            notes: str(b.notes),
        });
        const { error: setErr } = await admin.from("clinic_docs").insert({
            clinic_id: clinicId,
            col: "settings",
            id: "clinic",
            data: { clinicName, doctorName, specialty: str(b.specialty), phone: str(b.ownerPhone), province: str(b.province) || "بغداد" },
        });
        if (subErr || setErr) {
            await admin.auth.admin.deleteUser(userId);
            await undo();
            const e = subErr || setErr;
            throw new UserError("تعذر إنشاء العيادة: " + (e.message || e.code || "خطأ غير معروف"), 500);
        }
        return { ok: true, clinic_id: clinicId };
    },

    // تعديل بيانات الاشتراك
    async update_subscription(admin, b) {
        const clinicId = str(b.clinicId);
        const expiresAt = str(b.expiresAt);
        const plan = str(b.plan) || "شهري";
        if (!clinicId) throw new UserError("العيادة غير محددة");
        if (expiresAt && !validDate(expiresAt)) throw new UserError("تاريخ الانتهاء غير صالح");
        if (plan !== LIFETIME_PLAN && !expiresAt) throw new UserError("حدد تاريخ انتهاء الاشتراك");

        const clinicName = str(b.clinicName);
        const { data: sub } = await admin.from("clinic_subscriptions").select("starts_at").eq("clinic_id", clinicId).maybeSingle();
        const { error } = await admin.from("clinic_subscriptions").upsert({
            clinic_id: clinicId,
            clinic_name: clinicName,
            owner_phone: str(b.ownerPhone),
            plan,
            price: Number(b.price) || 0,
            starts_at: sub?.starts_at ?? today(),
            expires_at: plan === LIFETIME_PLAN ? null : expiresAt,
            suspended: !!b.suspended,
            notes: str(b.notes),
            updated_at: new Date().toISOString(),
        });
        if (error) throw error;
        if (clinicName) await renameClinic(admin, clinicId, clinicName);
        return { ok: true };
    },

    // تمديد الاشتراك عددًا من الأشهر من تاريخ انتهائه، أو من اليوم إن كان منتهيًا
    async extend(admin, b) {
        const clinicId = str(b.clinicId);
        const months = Math.floor(Number(b.months));
        if (!clinicId) throw new UserError("العيادة غير محددة");
        if (!(months >= 1 && months <= 36)) throw new UserError("عدد الأشهر من 1 إلى 36");

        const { data: sub } = await admin.from("clinic_subscriptions").select("*").eq("clinic_id", clinicId).maybeSingle();
        if (sub && sub.plan === LIFETIME_PLAN) throw new UserError("هذه العيادة نسخة دائمية ولا تحتاج تمديدًا");
        const base = sub?.expires_at && sub.expires_at > today() ? sub.expires_at : today();
        const expiresAt = addMonths(base, months);
        const { error } = await admin.from("clinic_subscriptions").upsert({
            ...(sub ?? { clinic_id: clinicId }),
            expires_at: expiresAt,
            suspended: false,
            updated_at: new Date().toISOString(),
        });
        if (error) throw error;
        return { ok: true, expires_at: expiresAt };
    },

    // أجهزة عيادة واحدة (لنافذة العيادة في اللوحة)
    async devices(admin, b) {
        const clinicId = str(b.clinicId);
        if (!clinicId) throw new UserError("العيادة غير محددة");
        const { data, error } = await admin.from("clinic_devices")
            .select("id, display_name, username, label, platform, browser, model, installed, first_seen, last_seen, revoked")
            .eq("clinic_id", clinicId).order("last_seen", { ascending: false });
        if (error) throw new UserError("جدول الأجهزة غير موجود. شغّل clinic.sql كاملًا", 500);
        return { devices: data };
    },

    async set_device_limit(admin, b) {
        const clinicId = str(b.clinicId);
        const limit = Math.floor(Number(b.limit));
        if (!clinicId) throw new UserError("العيادة غير محددة");
        if (!(limit >= 0 && limit <= 1000)) throw new UserError("الحد من 0 إلى 1000 (0 = بلا حد)");
        const { error } = await admin.from("clinic_device_plans").upsert({ clinic_id: clinicId, device_limit: limit, updated_at: new Date().toISOString() });
        if (error) throw new UserError("تعذر حفظ حد الأجهزة: " + error.message, 500);
        return { ok: true };
    },

    async add_member(admin, b) {
        const clinicId = str(b.clinicId);
        const username = str(b.username).toLowerCase();
        const password = String(b.password ?? "");
        const name = str(b.name);
        const role = b.role === "admin" ? "admin" : "staff";
        if (!clinicId) throw new UserError("العيادة غير محددة");
        checkNewAccount(username, password, name);
        await ensureUsernameFree(admin, username);
        await createMember(admin, clinicId, username, password, name, role);
        return { ok: true };
    },

    async reset_password(admin, b) {
        const userId = str(b.userId);
        const password = String(b.password ?? "");
        if (password.length < 8) throw new UserError("كلمة المرور 8 أحرف على الأقل");
        await memberOf(admin, userId);
        const { error } = await admin.auth.admin.updateUserById(userId, { password });
        if (error) throw new UserError("تعذر تغيير كلمة المرور");
        return { ok: true };
    },

    // تعطيل حساب يمنع دخوله وتجديد جلسته؛ التفعيل يعيده كما كان
    async set_disabled(admin, b) {
        const userId = str(b.userId);
        await memberOf(admin, userId);
        const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: b.disabled ? BAN_FOREVER : "none" });
        if (error) throw new UserError("تعذر تغيير حالة الحساب");
        return { ok: true };
    },

    async set_role(admin, b) {
        const userId = str(b.userId);
        const role = b.role === "admin" ? "admin" : "staff";
        const m = await memberOf(admin, userId);
        if (m.role === "admin" && role !== "admin") await ensureAnotherAdmin(admin, m.clinic_id, userId);
        const { error } = await admin.from("clinic_members").update({ role }).eq("user_id", userId);
        if (error) throw error;
        return { ok: true };
    },

    async delete_member(admin, b) {
        const userId = str(b.userId);
        const m = await memberOf(admin, userId);
        if (m.role === "admin") await ensureAnotherAdmin(admin, m.clinic_id, userId);
        await removeUser(admin, userId);
        return { ok: true };
    },

    // حذف العيادة نهائيًا مع كل حساباتها وبياناتها ومرفقاتها. يجب كتابة «حذف» للتأكيد
    async delete_clinic(admin, b) {
        const clinicId = str(b.clinicId);
        if (!clinicId) throw new UserError("العيادة غير محددة");
        if (str(b.confirm) !== "حذف") throw new UserError("اكتب كلمة «حذف» للتأكيد، لم يُحذف شيء");
        const { data: row } = await admin.from("clinics").select("id").eq("id", clinicId).maybeSingle();
        if (!row) throw new UserError("العيادة غير موجودة", 404);

        const { data: members, error: mErr } = await admin.from("clinic_members").select("user_id").eq("clinic_id", clinicId);
        if (mErr) throw new UserError("تعذر قراءة حسابات العيادة: " + mErr.message, 500);
        for (const m of members ?? []) await removeUser(admin, m.user_id);

        // المرفقات: نحذفها على دفعات
        for (let i = 0; i < 1000; i++) {
            const { data: files, error } = await admin.storage.from(BUCKET).list(clinicId, { limit: 1000 });
            if (error || !files?.length) break;
            const { error: delErr } = await admin.storage.from(BUCKET).remove(files.map(f => `${clinicId}/${f.name}`));
            if (delErr) throw new UserError("تعذر حذف مرفقات العيادة: " + delErr.message, 500);
        }
        // حذف العيادة يحذف سجلاتها واشتراكها تلقائيًا (on delete cascade)
        const { error } = await admin.from("clinics").delete().eq("id", clinicId);
        if (error) throw new UserError("تعذر حذف العيادة: " + error.message, 500);
        return { ok: true };
    },

    // نسخة احتياطية بنفس صيغة «تنزيل نسخة احتياطية» في البرنامج، تُستعاد من الإعدادات ← البيانات
    async export_clinic(admin, b) {
        const clinicId = str(b.clinicId);
        if (!clinicId) throw new UserError("العيادة غير محددة");
        const out = { app: "clinic", version: 1, exportedAt: new Date().toISOString(), settings: {} };
        for (let from = 0; ; from += 1000) {
            const { data, error } = await admin.from("clinic_docs").select("col, id, data")
                .eq("clinic_id", clinicId).eq("deleted", false).order("col").order("id").range(from, from + 999);
            if (error) throw error;
            data.forEach(r => {
                if (r.col === "settings") { if (r.id === "clinic") out.settings = r.data; return; }
                (out[r.col] = out[r.col] || []).push({ ...r.data, id: r.id });
            });
            if (data.length < 1000) break;
        }
        return out;
    },
};

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "الطريقة غير مسموحة" }, 405);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
        auth: { persistSession: false },
    });

    // من المتصل؟ وهل هو مزود؟
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "يجب تسجيل الدخول" }, 401);
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) return json({ error: "يجب تسجيل الدخول" }, 401);

    const { data: provider } = await admin.from("providers").select("user_id").eq("user_id", userData.user.id).maybeSingle();
    if (!provider) return json({ error: "غير مصرح" }, 403);

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return json({ error: "بيانات غير صالحة" }, 400);
    }

    const name = String(body.action ?? "");
    const action = Object.hasOwn(actions, name) ? actions[name] : null;
    if (!action) return json({ error: "عملية غير معروفة" }, 400);

    try {
        return json(await action(admin, body));
    } catch (err) {
        if (err instanceof UserError) return json({ error: err.message }, err.status);
        console.error(err);
        return json({ error: "حدث خطأ في الخادم" }, 500);
    }
});
