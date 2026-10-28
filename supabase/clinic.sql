-- clinic.sql — قاعدة بيانات نسخ العيادة: العيادات، حسابات الدخول، الاشتراكات، السجلات، والمرفقات
--
-- شغّله مرة واحدة من Supabase ← SQL Editor ← الصق الملف ← Run. يمكن إعادة تشغيله دون ضرر.
-- يُشغَّل على مشروع Supabase الخاص بالعيادات (yukyibwkxwkssirhdhfg)، وهو منفصل تمامًا عن مشروع المتجر.
-- بعد تشغيله: انشر الدالة clinic-admin (راجع README.md).

-- ===== المزودون: من يستطيع فتح لوحة المزود =====
-- لا قواعد قراءة: لا يصل إليه إلا مفتاح الخدمة
create table if not exists public.providers (
    user_id uuid primary key references auth.users (id) on delete cascade,
    created_at timestamptz not null default now()
);
alter table public.providers enable row level security;

-- ===== العيادات (كل نسخة مبيعة = عيادة) =====
create table if not exists public.clinics (
    id uuid primary key default gen_random_uuid(),
    name text not null default '',
    created_at timestamptz not null default now()
);
alter table public.clinics enable row level security;

-- ===== حسابات الدخول =====
-- admin = الطبيب/مدير العيادة، staff = السكرتير أو الموظف
-- كل حساب لعيادة واحدة فقط، واسم المستخدم فريد لأن البريد الداخلي يُشتق منه (username@users.clinicapp.io)
create table if not exists public.clinic_members (
    user_id uuid primary key references auth.users (id) on delete cascade,
    clinic_id uuid not null references public.clinics (id) on delete cascade,
    role text not null default 'staff',
    username text not null,
    display_name text not null default '',
    created_at timestamptz not null default now(),
    constraint clinic_members_role check (role in ('admin', 'staff')),
    constraint clinic_members_username_key unique (username)
);
create index if not exists clinic_members_clinic_idx on public.clinic_members (clinic_id);
alter table public.clinic_members enable row level security;

-- ===== اشتراك كل عيادة =====
-- العيادة التي ليس لها صف هنا تُعتبر فعّالة
create table if not exists public.clinic_subscriptions (
    clinic_id uuid primary key references public.clinics (id) on delete cascade,
    clinic_name text not null default '',
    owner_phone text not null default '',
    plan text not null default 'شهري',
    price numeric not null default 0,
    starts_at date not null default current_date,
    expires_at date,                       -- فارغ = دائمي
    suspended boolean not null default false,
    notes text not null default '',
    updated_at timestamptz not null default now()
);
alter table public.clinic_subscriptions enable row level security;

-- ===== سجلات العيادة =====
-- كل سجل (مريض، موعد، كشف، فاتورة...) صف واحد: col = نوعه، id = معرّفه، data = محتواه.
-- إعدادات العيادة: col = 'settings' و id = 'clinic'.
-- الحذف لا يمسح الصف بل يضع deleted = true حتى تعرف الأجهزة الأخرى به عند المزامنة.
create table if not exists public.clinic_docs (
    clinic_id uuid not null references public.clinics (id) on delete cascade,
    col text not null,
    id text not null,
    data jsonb not null default '{}'::jsonb,
    deleted boolean not null default false,
    updated_at timestamptz not null default now(),
    updated_by uuid,
    primary key (clinic_id, col, id),
    constraint clinic_docs_size check (pg_column_size(data) < 2000000)
);
create index if not exists clinic_docs_sync_idx on public.clinic_docs (clinic_id, updated_at);
alter table public.clinic_docs enable row level security;

-- وقت التعديل ومن عدّله يضعهما الخادم (لا يُوثق بساعة الجهاز)
create or replace function public.clinic_docs_stamp()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := clock_timestamp();
    new.updated_by := auth.uid();
    return new;
end;
$$;
drop trigger if exists clinic_docs_stamp on public.clinic_docs;
create trigger clinic_docs_stamp before insert or update on public.clinic_docs
    for each row execute function public.clinic_docs_stamp();

-- ===== دوال مساعدة =====
create or replace function public.is_clinic_member(cid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
    select exists (select 1 from clinic_members where clinic_id = cid and user_id = auth.uid());
$$;

create or replace function public.is_clinic_admin(cid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
    select exists (select 1 from clinic_members where clinic_id = cid and user_id = auth.uid() and role = 'admin');
$$;

-- العيادة فعّالة إذا لم تُوقف يدويًا ولم يمضِ على انتهاء اشتراكها أكثر من 3 أيام (المهلة)
create or replace function public.clinic_is_active(cid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
    select coalesce(
        (select not s.suspended and (s.expires_at is null or current_date <= s.expires_at + 3)
         from clinic_subscriptions s where s.clinic_id = cid),
        true
    );
$$;

-- مسار الملف في التخزين يبدأ بمعرف العيادة: <clinic_id>/<اسم الملف>
create or replace function public.clinic_of_path(path text)
returns uuid
language plpgsql immutable
as $$
begin
    return split_part(path, '/', 1)::uuid;
exception when others then
    return null;
end;
$$;

-- ===== قواعد الحماية =====
drop policy if exists clinics_select on public.clinics;
create policy clinics_select on public.clinics
    for select to authenticated
    using (public.is_clinic_member(id));

drop policy if exists clinic_members_select on public.clinic_members;
create policy clinic_members_select on public.clinic_members
    for select to authenticated
    using (user_id = auth.uid() or public.is_clinic_member(clinic_id));

-- أعضاء العيادة يقرؤون اشتراكها (ليظهر التنبيه والإيقاف)؛ التعديل للمزود فقط عبر الدالة
drop policy if exists clinic_subs_select on public.clinic_subscriptions;
create policy clinic_subs_select on public.clinic_subscriptions
    for select to authenticated
    using (public.is_clinic_member(clinic_id));

-- القراءة تبقى متاحة بعد انتهاء الاشتراك (البيانات ملك العيادة)، والإضافة والتعديل تتوقف.
-- إعدادات العيادة يعدّلها الطبيب (admin) فقط.
drop policy if exists clinic_docs_select on public.clinic_docs;
drop policy if exists clinic_docs_insert on public.clinic_docs;
drop policy if exists clinic_docs_update on public.clinic_docs;

create policy clinic_docs_select on public.clinic_docs
    for select to authenticated
    using (public.is_clinic_member(clinic_id));

create policy clinic_docs_insert on public.clinic_docs
    for insert to authenticated
    with check (
        public.is_clinic_member(clinic_id)
        and public.clinic_is_active(clinic_id)
        and (col <> 'settings' or public.is_clinic_admin(clinic_id))
    );

create policy clinic_docs_update on public.clinic_docs
    for update to authenticated
    using (
        public.is_clinic_member(clinic_id)
        and public.clinic_is_active(clinic_id)
        and (col <> 'settings' or public.is_clinic_admin(clinic_id))
    )
    with check (
        public.is_clinic_member(clinic_id)
        and public.clinic_is_active(clinic_id)
        and (col <> 'settings' or public.is_clinic_admin(clinic_id))
    );
-- لا قاعدة حذف: البرنامج يحذف بعلامة deleted، والحذف الفعلي للمزود فقط

grant select, insert, update on public.clinic_docs to authenticated;

-- ===== المزامنة الفورية بين أجهزة العيادة =====
do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables
                       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'clinic_docs') then
        alter publication supabase_realtime add table public.clinic_docs;
    end if;
end;
$$;

-- ===== المرفقات (صور التحاليل والأشعة وملفات PDF) =====
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clinic-files', 'clinic-files', false, 20971520, array['image/*', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists clinic_files_select on storage.objects;
drop policy if exists clinic_files_insert on storage.objects;
drop policy if exists clinic_files_delete on storage.objects;

create policy clinic_files_select on storage.objects
    for select to authenticated
    using (bucket_id = 'clinic-files' and public.is_clinic_member(public.clinic_of_path(name)));

create policy clinic_files_insert on storage.objects
    for insert to authenticated
    with check (
        bucket_id = 'clinic-files'
        and public.is_clinic_member(public.clinic_of_path(name))
        and public.clinic_is_active(public.clinic_of_path(name))
    );

create policy clinic_files_delete on storage.objects
    for delete to authenticated
    using (
        bucket_id = 'clinic-files'
        and public.is_clinic_member(public.clinic_of_path(name))
        and public.clinic_is_active(public.clinic_of_path(name))
    );

-- ===== إحصائيات العيادات للوحة المزود =====
-- آخر نشاط وعدد السجلات والمرضى لكل عيادة. لا يستدعيها إلا مفتاح الخدمة
create or replace function public.clinic_provider_stats()
returns table (clinic_id uuid, last_activity timestamptz, rows_count bigint, patients bigint)
language sql stable security definer set search_path = public
as $$
    select d.clinic_id, max(d.updated_at),
           count(*) filter (where not d.deleted),
           count(*) filter (where not d.deleted and d.col = 'patients')
    from clinic_docs d
    group by d.clinic_id;
$$;
revoke all on function public.clinic_provider_stats() from public, anon, authenticated;

-- ===== اجعل حسابك مزودًا =====
-- 1) أنشئ حسابك من Authentication ← Users ← Add user (بريدك الحقيقي وكلمة مرور قوية)
-- 2) غيّر البريد في السطر التالي ثم شغّله:
-- insert into public.providers (user_id) select id from auth.users where email = 'you@example.com' on conflict do nothing;

-- ============================================================
-- الأجهزة: كل جهاز (متصفح) يدخل للعيادة يُسجَّل، والطبيب يسمّيه أو يوقفه،
-- والمزود يحدد الحد الأعلى لعدد أجهزة العيادة. العيادة التي ليس لها حد = بلا حد.
-- الجهاز الذي لم يُستخدم 30 يومًا والجهاز الموقوف لا يُحسبان من الحد.
-- الطبيب (admin) لا يُمنع بسبب الحد حتى يستطيع إيقاف جهاز قديم، لكن جهازه يُحسب.
-- ============================================================
create table if not exists public.clinic_device_plans (
    clinic_id uuid primary key references public.clinics (id) on delete cascade,
    device_limit int not null default 0, -- 0 = بلا حد
    updated_at timestamptz not null default now(),
    constraint clinic_device_plans_limit check (device_limit >= 0 and device_limit <= 1000)
);
alter table public.clinic_device_plans enable row level security;

drop policy if exists clinic_device_plans_select on public.clinic_device_plans;
create policy clinic_device_plans_select on public.clinic_device_plans
    for select to authenticated
    using (public.is_clinic_member(clinic_id));

create table if not exists public.clinic_devices (
    id uuid primary key default gen_random_uuid(),
    clinic_id uuid not null references public.clinics (id) on delete cascade,
    device_id text not null,
    user_id uuid,
    username text not null default '',
    display_name text not null default '',
    label text not null default '',      -- اسم يضعه الطبيب: «حاسبة الاستقبال»
    platform text not null default '',
    browser text not null default '',
    model text not null default '',
    installed boolean not null default false,
    first_seen timestamptz not null default now(),
    last_seen timestamptz not null default now(),
    revoked boolean not null default false,
    revoked_at timestamptz,
    unique (clinic_id, device_id)
);
create index if not exists clinic_devices_clinic_idx on public.clinic_devices (clinic_id, last_seen desc);
alter table public.clinic_devices enable row level security;

drop policy if exists clinic_devices_select on public.clinic_devices;
drop policy if exists clinic_devices_update on public.clinic_devices;
drop policy if exists clinic_devices_delete on public.clinic_devices;

-- الطبيب يرى أجهزة عيادته، والسكرتير يرى أجهزته فقط
create policy clinic_devices_select on public.clinic_devices
    for select to authenticated
    using (public.is_clinic_admin(clinic_id) or user_id = auth.uid());

create policy clinic_devices_update on public.clinic_devices
    for update to authenticated
    using (public.is_clinic_admin(clinic_id))
    with check (public.is_clinic_admin(clinic_id));

create policy clinic_devices_delete on public.clinic_devices
    for delete to authenticated
    using (public.is_clinic_admin(clinic_id));

-- الطبيب لا يغيّر إلا الاسم والإيقاف
revoke update on public.clinic_devices from authenticated;
grant update (label, revoked, revoked_at) on public.clinic_devices to authenticated;
grant select, delete on public.clinic_devices to authenticated;
grant select on public.clinic_device_plans to authenticated;

-- تسجيل الجهاز وتحديث آخر نشاط
-- يعيد: ok | revoked (أوقفه الطبيب) | limit (وصلت العيادة للحد) | not_member | bad
create or replace function public.clinic_device_checkin(
    p_clinic uuid,
    p_device text,
    p_platform text default '',
    p_browser text default '',
    p_model text default '',
    p_installed boolean default false
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
    m record;
    d_found boolean;
    d_revoked boolean;
    d_last timestamptz;
    lim int := 0;
    used int := 0;
    stale boolean;
begin
    select role, username, display_name into m
      from clinic_members where clinic_id = p_clinic and user_id = auth.uid();
    if not found then
        return jsonb_build_object('status', 'not_member');
    end if;
    if p_device is null or length(p_device) < 8 or length(p_device) > 64 then
        return jsonb_build_object('status', 'bad');
    end if;

    -- حتى لا يتجاوز جهازان الحد معًا في نفس اللحظة
    perform pg_advisory_xact_lock(hashtext('clinic_devices:' || p_clinic::text));

    select coalesce(device_limit, 0) into lim from clinic_device_plans where clinic_id = p_clinic;
    lim := coalesce(lim, 0);
    select count(*) into used from clinic_devices
     where clinic_id = p_clinic and not revoked and last_seen > now() - interval '30 days';

    select revoked, last_seen into d_revoked, d_last
      from clinic_devices where clinic_id = p_clinic and device_id = p_device;
    d_found := found;
    if d_found and d_revoked then
        return jsonb_build_object('status', 'revoked', 'limit', lim, 'used', used);
    end if;

    stale := not d_found or d_last <= now() - interval '30 days';
    if stale and lim > 0 and used >= lim and m.role <> 'admin' then
        return jsonb_build_object('status', 'limit', 'limit', lim, 'used', used);
    end if;

    insert into clinic_devices (clinic_id, device_id, user_id, username, display_name, platform, browser, model, installed)
    values (p_clinic, p_device, auth.uid(), m.username, m.display_name,
            left(coalesce(p_platform, ''), 40), left(coalesce(p_browser, ''), 40), left(coalesce(p_model, ''), 60), coalesce(p_installed, false))
    on conflict (clinic_id, device_id) do update set
        user_id = excluded.user_id,
        username = excluded.username,
        display_name = excluded.display_name,
        platform = excluded.platform,
        browser = excluded.browser,
        model = case when excluded.model <> '' then excluded.model else clinic_devices.model end,
        installed = excluded.installed,
        last_seen = now();

    return jsonb_build_object('status', 'ok', 'limit', lim, 'used', used + case when stale then 1 else 0 end, 'new', stale);
end;
$$;
revoke all on function public.clinic_device_checkin(uuid, text, text, text, text, boolean) from public, anon;
grant execute on function public.clinic_device_checkin(uuid, text, text, text, text, boolean) to authenticated;
