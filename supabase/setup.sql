-- 하진 비서 동기화 설정
-- Supabase 대시보드 → SQL Editor → New query → 이 파일 전체를 붙여넣고 Run.
-- 여러 번 실행해도 안전해요.

-- 1) 내 기록 (나만 보임)
create table if not exists public.items (
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  col text not null,
  data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null,
  server_at timestamptz not null default now(),
  primary key (owner, id)
);
create index if not exists items_owner_server on public.items (owner, server_at);

-- 2) 팀 공간 (참여 코드로 들어온 사람끼리 공유)
create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6)),
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.space_members (
  space uuid not null references public.spaces on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null default '',
  joined_at timestamptz not null default now(),
  primary key (space, user_id)
);
create table if not exists public.space_items (
  space uuid not null references public.spaces on delete cascade,
  id text not null,
  col text not null,
  data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null,
  server_at timestamptz not null default now(),
  by uuid default auth.uid(),
  primary key (space, id)
);
create index if not exists space_items_server on public.space_items (space, server_at);

-- 서버 시각은 항상 서버가 찍음 (동기화 기준점)
create or replace function public.touch_server_at() returns trigger language plpgsql as $$
begin new.server_at := clock_timestamp(); return new; end $$;
drop trigger if exists items_touch on public.items;
create trigger items_touch before insert or update on public.items for each row execute function public.touch_server_at();
drop trigger if exists space_items_touch on public.space_items;
create trigger space_items_touch before insert or update on public.space_items for each row execute function public.touch_server_at();

create or replace function public.is_member(s uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.space_members where space = s and user_id = auth.uid())
$$;

-- 3) 접근 규칙
alter table public.items enable row level security;
alter table public.spaces enable row level security;
alter table public.space_members enable row level security;
alter table public.space_items enable row level security;

drop policy if exists items_own on public.items;
create policy items_own on public.items for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists spaces_read on public.spaces;
create policy spaces_read on public.spaces for select to authenticated using (public.is_member(id));

drop policy if exists members_read on public.space_members;
create policy members_read on public.space_members for select to authenticated using (public.is_member(space));
drop policy if exists members_self_update on public.space_members;
create policy members_self_update on public.space_members for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists members_leave on public.space_members;
create policy members_leave on public.space_members for delete to authenticated using (user_id = auth.uid());

drop policy if exists sitems_rw on public.space_items;
create policy sitems_rw on public.space_items for all to authenticated
  using (public.is_member(space)) with check (public.is_member(space));

-- 4) 팀 공간 만들기 / 코드로 참여
create or replace function public.create_space(p_name text, p_my_name text)
returns public.spaces language plpgsql security definer set search_path = public as $$
declare s public.spaces;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  insert into public.spaces (name) values (p_name) returning * into s;
  insert into public.space_members (space, user_id, name) values (s.id, auth.uid(), coalesce(p_my_name, ''));
  return s;
end $$;

create or replace function public.join_space(p_code text, p_my_name text)
returns public.spaces language plpgsql security definer set search_path = public as $$
declare s public.spaces;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  select * into s from public.spaces where code = upper(trim(p_code)) and not coalesce(is_main, false);
  if s.id is null then raise exception '참여 코드가 맞지 않아요'; end if;
  insert into public.space_members (space, user_id, name) values (s.id, auth.uid(), coalesce(p_my_name, ''))
    on conflict (space, user_id) do update set name = excluded.name;
  return s;
end $$;

grant execute on function public.create_space(text, text) to authenticated;
grant execute on function public.join_space(text, text) to authenticated;
grant execute on function public.is_member(uuid) to authenticated;

-- 5) 실시간 알림 (다른 기기·팀원이 바꾸면 바로 반영)
do $$ begin
  begin alter publication supabase_realtime add table public.items; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.space_items; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.space_members; exception when duplicate_object then null; end;
end $$;

-- ─────────────────────────────────────────────
-- 6) 멤버 코드 로그인 (관리자가 멤버를 등록하고 5자리 코드를 발급)
--    로그인 계정은 코드에서 자동으로 만들어짐 (이메일 확인 끄기 필요)
create extension if not exists pgcrypto with schema extensions;
alter table public.spaces add column if not exists is_main boolean not null default false;
alter table public.spaces alter column created_by drop not null;

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{3,5}$'),
  name text not null,
  role text not null default '',
  gmail text not null default '',
  is_admin boolean not null default false,
  active boolean not null default true,
  user_id uuid unique references auth.users on delete set null,
  created_at timestamptz not null default now()
);
alter table public.members enable row level security; -- 직접 읽기 금지, 아래 함수로만

create or replace function public.is_admin() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.members where user_id = auth.uid() and is_admin and active)
$$;

-- 로그인 전: 코드가 맞는지 (이름과 로그인 id만 돌려줌)
create or replace function public.check_code(p_code text) returns json
language sql security definer set search_path = public stable as $$
  select json_build_object('id', id, 'name', name) from public.members where code = upper(trim(p_code)) and active
$$;

-- 로그인 직후: 이 계정을 멤버에 연결하고 기본 팀 공간에 넣음
create or replace function public.claim_member(p_code text) returns json
language plpgsql security definer set search_path = public as $$
declare m public.members; s record;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  select * into m from public.members where code = upper(trim(p_code)) and active;
  if m.id is null then raise exception '멤버 코드가 맞지 않아요'; end if;
  if m.user_id is not null and m.user_id <> auth.uid() then raise exception '이미 다른 계정에 연결된 코드예요'; end if;
  update public.members set user_id = auth.uid() where id = m.id;
  for s in select id from public.spaces where is_main loop
    insert into public.space_members (space, user_id, name) values (s.id, auth.uid(), m.name)
      on conflict (space, user_id) do update set name = excluded.name;
  end loop;
  return json_build_object('id', m.id, 'name', m.name, 'role', m.role, 'is_admin', m.is_admin, 'gmail', m.gmail);
end $$;

-- 멤버 목록: 관리자에게만 코드가 보임
create or replace function public.list_members() returns setof json
language sql security definer set search_path = public stable as $$
  select json_build_object('id', id, 'name', name, 'role', role, 'gmail', gmail, 'is_admin', is_admin, 'active', active,
    'joined', user_id is not null, 'user_id', user_id, 'code', case when public.is_admin() then code else null end)
  from public.members
  where exists (select 1 from public.members me where me.user_id = auth.uid() and me.active)
  order by is_admin desc, created_at
$$;

-- 관리자: 멤버 추가·수정·코드 바꾸기·비활성
create or replace function public.admin_save_member(p_id uuid, p_code text, p_name text, p_role text, p_gmail text, p_is_admin boolean, p_active boolean)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare m public.members; c text := upper(trim(p_code));
begin
  if not public.is_admin() then raise exception '관리자만 할 수 있어요'; end if;
  if p_id is null then
    insert into public.members (code, name, role, gmail, is_admin, active) values (c, p_name, coalesce(p_role,''), coalesce(p_gmail,''), coalesce(p_is_admin,false), coalesce(p_active,true)) returning * into m;
  else
    update public.members set code = c, name = p_name, role = coalesce(p_role,''), gmail = coalesce(p_gmail,''), is_admin = coalesce(p_is_admin,false), active = coalesce(p_active,true)
      where id = p_id returning * into m;
    -- 코드가 바뀌면 로그인 비밀번호도 같이 바꿈
    if m.user_id is not null then
      update auth.users set encrypted_password = extensions.crypt('hj-' || m.code || '-' || substr(m.id::text, 1, 8), extensions.gen_salt('bf')) where id = m.user_id;
      update public.space_members set name = m.name where user_id = m.user_id;
    end if;
    if not m.active and m.user_id is not null then delete from public.space_members where user_id = m.user_id; end if;
  end if;
  return json_build_object('id', m.id, 'code', m.code, 'name', m.name);
end $$;

create or replace function public.is_active() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.members where user_id = auth.uid() and active)
$$;
grant execute on function public.is_active() to authenticated;
-- 등록된 멤버만 저장소를 씀
drop policy if exists items_own on public.items;
create policy items_own on public.items for all to authenticated
  using (owner = auth.uid() and public.is_active()) with check (owner = auth.uid() and public.is_active());

grant execute on function public.check_code(text) to anon, authenticated;
grant execute on function public.claim_member(text) to authenticated;
grant execute on function public.list_members() to authenticated;
grant execute on function public.admin_save_member(uuid, text, text, text, text, boolean, boolean) to authenticated;
grant execute on function public.is_admin() to authenticated;

-- 기본 팀 공간 하나 (멤버는 로그인하면 자동 참여)
insert into public.spaces (name, is_main)
  select '우리 팀', true where not exists (select 1 from public.spaces where is_main);
insert into public.space_items (space, id, col, data, updated_at)
  select s.id, 'team-main', 'teams', json_build_object('id', 'team-main', 'col', 'teams', 'name', s.name, 'color', '#4b5bff', 'members', json_build_array(), 'main', true, 'createdAt', now(), 'updatedAt', now())::jsonb, now()
  from public.spaces s where s.is_main and not exists (select 1 from public.space_items where id = 'team-main');

-- ─────────────────────────────────────────────
-- 7) 레퍼런스 이미지 저장 (무료 1GB, 이미지는 앱이 webp로 줄여서 올림 → 수천 장)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('refs', 'refs', true, 3145728, array['image/webp', 'image/jpeg', 'image/png', 'image/gif'])
  on conflict (id) do nothing;
drop policy if exists refs_upload on storage.objects;
create policy refs_upload on storage.objects for insert to authenticated with check (bucket_id = 'refs' and public.is_active());
drop policy if exists refs_delete on storage.objects;
create policy refs_delete on storage.objects for delete to authenticated using (bucket_id = 'refs' and owner = auth.uid());


-- ─────────────────────────────────────────────
-- 8) 개인 메신저 (두 사람만 보는 메시지. 비서를 통해 주고받음)
create table if not exists public.dms (
  id uuid primary key default gen_random_uuid(),
  from_member uuid not null references public.members(id) on delete cascade,
  to_member uuid not null references public.members(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  meta jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists dms_to_idx on public.dms (to_member, created_at);
create index if not exists dms_from_idx on public.dms (from_member, created_at);
alter table public.dms enable row level security;

create or replace function public.my_member() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.members where user_id = auth.uid() and active limit 1
$$;
grant execute on function public.my_member() to authenticated;

drop policy if exists dms_read on public.dms;
create policy dms_read on public.dms for select to authenticated
  using (from_member = public.my_member() or to_member = public.my_member());
drop policy if exists dms_send on public.dms;
create policy dms_send on public.dms for insert to authenticated
  with check (from_member = public.my_member());
drop policy if exists dms_mark on public.dms;
create policy dms_mark on public.dms for update to authenticated
  using (to_member = public.my_member()) with check (to_member = public.my_member());

do $$ begin
  begin alter publication supabase_realtime add table public.dms; exception when duplicate_object then null; end;
end $$;

-- ─────────────────────────────────────────────
-- 9) 구글 캘린더 구독용 일정 파일 (.ics). 본인 폴더에만 올리고 고칠 수 있음
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('cal', 'cal', true, 1048576, array['text/calendar'])
  on conflict (id) do nothing;
drop policy if exists cal_insert on storage.objects;
create policy cal_insert on storage.objects for insert to authenticated with check (bucket_id = 'cal' and public.is_active() and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists cal_update on storage.objects;
create policy cal_update on storage.objects for update to authenticated using (bucket_id = 'cal' and owner = auth.uid()) with check (bucket_id = 'cal' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists cal_select on storage.objects;
create policy cal_select on storage.objects for select to authenticated using (bucket_id = 'cal' and owner = auth.uid());
drop policy if exists cal_delete on storage.objects;
create policy cal_delete on storage.objects for delete to authenticated using (bucket_id = 'cal' and owner = auth.uid());
