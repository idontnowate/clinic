// @ts-nocheck
// clinic-team — الطبيب (مدير العيادة) يدير حسابات عيادته: إضافة سكرتير، كلمة المرور، التعطيل، الحذف.
// العيادة تُؤخذ من حساب المتصل نفسه، فلا يستطيع أحد إدارة عيادة غير عيادته.
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

const INTERNAL_EMAIL_DOMAIN = "users.clinicapp.io";
const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;
const BAN_FOREVER = "876000h";

class UserError extends Error {
    status: number;
    constructor(message: string, status = 400) {
        super(message);
        this.status = status;
    }
}

const str = (v: unknown) => String(v ?? "").trim();

// العيادة فعّالة؟ (نفس قاعدة clinic_is_active)
async function ensureActive(admin, clinicId: string) {
    const { data } = await admin.rpc("clinic_is_active", { cid: clinicId });
    if (data === false) throw new UserError("اشتراك العيادة منتهٍ أو موقوف. جدّد الاشتراك أولًا", 403);
}

// الحساب المستهدف من نفس عيادة المتصل
async function target(admin, clinicId: string, userId: string) {
    const { data } = await admin.from("clinic_members").select("user_id, role, username")
        .eq("user_id", userId).eq("clinic_id", clinicId).maybeSingle();
    if (!data) throw new UserError("الحساب غير موجود", 404);
    return data;
}

async function ensureAnotherAdmin(admin, clinicId: string, userId: string) {
    const { data } = await admin.from("clinic_members").select("user_id").eq("clinic_id", clinicId).eq("role", "admin");
    if (!(data ?? []).some(m => m.user_id !== userId)) {
        throw new UserError("هذا آخر حساب طبيب (مدير) في العيادة، لا يمكن حذفه أو تخفيضه");
    }
}

const actions = {
    async list(admin, clinicId) {
        const { data: members, error } = await admin.from("clinic_members")
            .select("user_id, role, username, display_name, created_at").eq("clinic_id", clinicId);
        if (error) throw error;
        const out = [];
        for (const m of members) {
            const { data: u } = await admin.auth.admin.getUserById(m.user_id);
            const bannedUntil = u?.user?.banned_until ? Date.parse(u.user.banned_until) : 0;
            out.push({ ...m, last_sign_in_at: u?.user?.last_sign_in_at ?? null, disabled: bannedUntil > Date.now() });
        }
        out.sort((a, b) => (a.role === b.role ? String(a.display_name).localeCompare(String(b.display_name), "ar") : a.role === "admin" ? -1 : 1));
        return { members: out };
    },

    async add_member(admin, clinicId, b) {
        await ensureActive(admin, clinicId);
        const username = str(b.username).toLowerCase();
        const password = String(b.password ?? "");
        const name = str(b.name);
        const role = b.role === "admin" ? "admin" : "staff";
        if (!USERNAME_RE.test(username)) throw new UserError("اسم المستخدم: أحرف إنجليزية وأرقام و . _ - فقط (3 إلى 30 حرفًا)");
        if (password.length < 8) throw new UserError("كلمة المرور 8 أحرف على الأقل");
        if (!name) throw new UserError("أدخل الاسم الظاهر");
        const { data: taken } = await admin.from("clinic_members").select("user_id").eq("username", username).maybeSingle();
        if (taken) throw new UserError("اسم المستخدم مستخدم بالفعل", 409);

        const { data: created, error } = await admin.auth.admin.createUser({
            email: `${username}@${INTERNAL_EMAIL_DOMAIN}`, password, email_confirm: true,
            user_metadata: { username, name, app: "clinic" },
        });
        if (error || !created.user) {
            if (/already|registered|exists/i.test(error?.message ?? "")) throw new UserError("اسم المستخدم مستخدم بالفعل", 409);
            throw new UserError("تعذر إنشاء الحساب");
        }
        const { error: mErr } = await admin.from("clinic_members").insert({
            clinic_id: clinicId, user_id: created.user.id, role, display_name: name, username,
        });
        if (mErr) {
            await admin.auth.admin.deleteUser(created.user.id);
            throw new UserError("تعذر ربط الحساب بالعيادة", 500);
        }
        return { ok: true };
    },

    async reset_password(admin, clinicId, b) {
        const t = await target(admin, clinicId, str(b.userId));
        const password = String(b.password ?? "");
        if (password.length < 8) throw new UserError("كلمة المرور 8 أحرف على الأقل");
        const { error } = await admin.auth.admin.updateUserById(t.user_id, { password });
        if (error) throw new UserError("تعذر تغيير كلمة المرور");
        return { ok: true };
    },

    async set_disabled(admin, clinicId, b, caller) {
        const t = await target(admin, clinicId, str(b.userId));
        if (t.user_id === caller) throw new UserError("لا يمكنك تعطيل حسابك");
        if (b.disabled && t.role === "admin") await ensureAnotherAdmin(admin, clinicId, t.user_id);
        const { error } = await admin.auth.admin.updateUserById(t.user_id, { ban_duration: b.disabled ? BAN_FOREVER : "none" });
        if (error) throw new UserError("تعذر تغيير حالة الحساب");
        return { ok: true };
    },

    async set_role(admin, clinicId, b, caller) {
        const t = await target(admin, clinicId, str(b.userId));
        const role = b.role === "admin" ? "admin" : "staff";
        if (t.user_id === caller && role !== "admin") throw new UserError("لا يمكنك تخفيض صلاحية حسابك");
        if (t.role === "admin" && role !== "admin") await ensureAnotherAdmin(admin, clinicId, t.user_id);
        const { error } = await admin.from("clinic_members").update({ role }).eq("user_id", t.user_id);
        if (error) throw error;
        return { ok: true };
    },

    async delete_member(admin, clinicId, b, caller) {
        const t = await target(admin, clinicId, str(b.userId));
        if (t.user_id === caller) throw new UserError("لا يمكنك حذف حسابك");
        if (t.role === "admin") await ensureAnotherAdmin(admin, clinicId, t.user_id);
        const { data: row } = await admin.from("clinic_members").select("*").eq("user_id", t.user_id).maybeSingle();
        await admin.from("clinic_members").delete().eq("user_id", t.user_id);
        const { error } = await admin.auth.admin.deleteUser(t.user_id);
        if (error && error.status !== 404) {
            if (row) await admin.from("clinic_members").insert(row);
            throw new UserError("تعذر حذف الحساب", 500);
        }
        return { ok: true };
    },
};

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "الطريقة غير مسموحة" }, 405);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
        auth: { persistSession: false },
    });

    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "يجب تسجيل الدخول" }, 401);
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) return json({ error: "يجب تسجيل الدخول" }, 401);

    const { data: me } = await admin.from("clinic_members").select("clinic_id, role").eq("user_id", userData.user.id).maybeSingle();
    if (!me || me.role !== "admin") return json({ error: "هذه العملية للطبيب (مدير العيادة) فقط" }, 403);

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
        return json(await action(admin, me.clinic_id, body, userData.user.id));
    } catch (err) {
        if (err instanceof UserError) return json({ error: err.message }, err.status);
        console.error(err);
        return json({ error: "حدث خطأ في الخادم" }, 500);
    }
});
