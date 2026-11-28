-- 소머스튜디오 동기화 설정
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
drop policy if exists members_self_update on public.space_members;   -- (v1.36.0) 이름을 스스로 고치는 길을 없앰
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
  insert into public.space_members (space, user_id, name) values (s.id, auth.uid(), coalesce((select name from public.members where user_id = auth.uid()), p_my_name, ''));
  return s;
end $$;

create or replace function public.join_space(p_code text, p_my_name text)
returns public.spaces language plpgsql security definer set search_path = public as $$
declare s public.spaces;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  select * into s from public.spaces where code = upper(trim(p_code)) and not coalesce(is_main, false);
  if s.id is null then raise exception '참여 코드가 맞지 않아요'; end if;
  insert into public.space_members (space, user_id, name) values (s.id, auth.uid(), coalesce((select name from public.members where user_id = auth.uid()), p_my_name, ''))
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
-- 멤버가 직접 정하는 색·사진 (15번 참고). list_members가 읽으므로 칸은 여기서 먼저 만듦
alter table public.members add column if not exists color text not null default '';
alter table public.members add column if not exists avatar text not null default '';
create or replace function public.list_members() returns setof json
language sql security definer set search_path = public stable as $$
  select json_build_object('id', id, 'name', name, 'role', role, 'gmail', gmail, 'is_admin', is_admin, 'active', active,
    'joined', user_id is not null, 'user_id', user_id, 'code', case when public.is_admin() then code else null end,
    'color', color, 'avatar', avatar)
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


-- ─────────────────────────────────────────────
-- 10) 보안 보강 (2026-11 점검에서 나온 것. 다시 실행해도 안전)
-- 팀 공간은 활동 중인 멤버만 읽고 씀. 팀·프로젝트·폴더·중요도 색은 관리자만 고침. 완전 삭제는 관리자만(앱은 지움 표시만 함)
drop policy if exists sitems_rw on public.space_items;
drop policy if exists sitems_read on public.space_items;
create policy sitems_read on public.space_items for select to authenticated
  using (public.is_member(space) and public.is_active());
drop policy if exists sitems_ins on public.space_items;
create policy sitems_ins on public.space_items for insert to authenticated
  with check (public.is_member(space) and public.is_active() and col <> '_kv'
    and (col not in ('teams', 'projects', 'reffolders', 'labelsets') or public.is_admin()));
drop policy if exists sitems_upd on public.space_items;
create policy sitems_upd on public.space_items for update to authenticated
  using (public.is_member(space) and public.is_active()
    and (col not in ('teams', 'projects', 'reffolders', 'labelsets') or public.is_admin()))
  with check (public.is_member(space) and public.is_active() and col <> '_kv'
    and (col not in ('teams', 'projects', 'reffolders', 'labelsets') or public.is_admin()));
drop policy if exists sitems_del on public.space_items;
create policy sitems_del on public.space_items for delete to authenticated
  using (public.is_member(space) and public.is_admin());

-- 올린 사람은 서버가 찍고, 수정 기록(audit)은 한 번 올라가면 바뀌지 않음
create or replace function public.space_items_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then new."by" := auth.uid(); return new; end if;
  if old.col = 'audit' then return old; end if;
  new."by" := old."by"; new.col := old.col;   -- by는 이 언어의 예약어라 꼭 따옴표로. 안 그러면 고칠 때마다 'record "old" has no field "by"' 오류가 남 (16번 참고)
  return new;
end $$;
drop trigger if exists space_items_guard on public.space_items;
create trigger space_items_guard before insert or update on public.space_items for each row execute function public.space_items_guard();

-- 팀 공간 만들기·참여도 활동 중인 멤버만
create or replace function public.create_space(p_name text, p_my_name text)
returns public.spaces language plpgsql security definer set search_path = public as $$
declare s public.spaces;
begin
  if auth.uid() is null or not public.is_active() then raise exception '로그인이 필요해요'; end if;
  insert into public.spaces (name) values (p_name) returning * into s;
  insert into public.space_members (space, user_id, name) values (s.id, auth.uid(), coalesce((select name from public.members where user_id = auth.uid()), p_my_name, ''));
  return s;
end $$;
create or replace function public.join_space(p_code text, p_my_name text)
returns public.spaces language plpgsql security definer set search_path = public as $$
declare s public.spaces;
begin
  if auth.uid() is null or not public.is_active() then raise exception '로그인이 필요해요'; end if;
  select * into s from public.spaces where code = upper(trim(p_code)) and not coalesce(is_main, false);
  if s.id is null then raise exception '참여 코드가 맞지 않아요'; end if;
  insert into public.space_members (space, user_id, name) values (s.id, auth.uid(), coalesce((select name from public.members where user_id = auth.uid()), p_my_name, ''))
    on conflict (space, user_id) do update set name = excluded.name;
  return s;
end $$;
-- 내 참여 정보는 직접 고칠 수 없음 (이름은 관리자가 정한 것만)
revoke update on public.space_members from authenticated;
-- (v1.36.0) 이름은 관리자만 정하므로 멤버에게는 고칠 권한을 주지 않음
-- 받은 메시지는 '읽음'만 바꿀 수 있음 (내용은 못 고침)
revoke update on public.dms from authenticated;
grant update (read_at) on public.dms to authenticated;

-- 멤버 코드 맞히기 막기: 같은 곳에서 10분에 10번, 전체로 10분에 80번 넘게 틀리면 잠시 막음
create table if not exists public.code_tries (
  at timestamptz not null default now(),
  ip text not null default '',
  ok boolean not null default false
);
create index if not exists code_tries_at on public.code_tries (at);
alter table public.code_tries enable row level security; -- 직접 읽기·쓰기 금지, 아래 함수로만
create or replace function public.check_code(p_code text) returns json
language plpgsql security definer set search_path = public as $$
declare v_ip text := coalesce(split_part(coalesce(current_setting('request.headers', true), '{}')::json ->> 'x-forwarded-for', ',', 1), '');
  r json; n_ip int; n_all int;
begin
  delete from public.code_tries where at < now() - interval '1 day';
  select count(*) filter (where ip = v_ip), count(*) into n_ip, n_all from public.code_tries where at > now() - interval '10 minutes' and not ok;
  if n_ip >= 10 or n_all >= 80 then raise exception '코드를 여러 번 틀렸어요. 10분 뒤에 다시 해 주세요'; end if;
  select json_build_object('id', id, 'name', name) into r from public.members where code = upper(trim(p_code)) and active;
  insert into public.code_tries (ip, ok) values (v_ip, r is not null);
  if r is null then perform pg_sleep(0.4); end if;
  return r;
end $$;
grant execute on function public.check_code(text) to anon, authenticated;

-- ─────────────────────────────────────────────
-- 11) 팀 공용 AI 키 (관리자 기기의 키를 여기 두면, 로그인한 멤버 기기가 받아 씀. 기기마다 넣을 필요 없음)
--     표는 직접 읽기·쓰기 금지. 활성 멤버만 함수로 읽고, 관리자만 바꿈. 다시 실행해도 안전
create table if not exists public.team_secrets (
  k text primary key,
  v text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.team_secrets enable row level security;

create or replace function public.team_secret(p_k text) returns text
language sql security definer set search_path = public stable as $$
  select v from public.team_secrets where k = p_k and public.is_active()
$$;

create or replace function public.admin_set_team_secret(p_k text, p_v text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception '관리자만 할 수 있어요'; end if;
  if p_k is null or p_k !~ '^[a-z0-9_]{2,30}$' then raise exception '이름을 확인해 주세요'; end if;
  if coalesce(p_v, '') = '' then delete from public.team_secrets where k = p_k;
  else
    if length(p_v) > 300 then raise exception '값이 너무 길어요'; end if;
    insert into public.team_secrets (k, v, updated_by) values (p_k, p_v, auth.uid())
      on conflict (k) do update set v = excluded.v, updated_at = now(), updated_by = auth.uid();
  end if;
  return true;
end $$;

revoke all on function public.team_secret(text) from public, anon;
revoke all on function public.admin_set_team_secret(text, text) from public, anon;
grant execute on function public.team_secret(text) to authenticated;
grant execute on function public.admin_set_team_secret(text, text) to authenticated;

-- ── 12) 표 권한 ──
-- 새 Supabase 프로젝트는 SQL로 만든 표를 로그인한 사용자에게 자동으로 열어 주지 않음.
-- 이게 없으면 로그인은 되는데 동기화에서 "permission denied for table items"가 남.
-- 누가 어떤 줄을 볼 수 있는지는 위의 RLS 정책이 그대로 지킴. 여기서는 표에 닿을 수 있게만 함.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.items to authenticated;
grant select, insert, update, delete on public.space_items to authenticated;
grant select on public.spaces to authenticated;
grant select, delete on public.space_members to authenticated;
-- (v1.36.0) 이름은 관리자만 정하므로 멤버에게는 고칠 권한을 주지 않음
grant select, insert on public.dms to authenticated;
grant update (read_at) on public.dms to authenticated;
-- 함수로만 다루는 표(members, code_tries, team_secrets)는 열지 않음. 쓸 일 없는 권한은 거둠
revoke truncate, references, trigger on public.items, public.space_items, public.spaces, public.space_members, public.dms, public.members, public.code_tries, public.team_secrets from anon, authenticated;


-- ─────────────────────────────────────────────
-- 13) 앱을 닫아도 울리는 알림 (웹 푸시). 따로 돌리는 서버 없이 이 DB가 1분마다 보냄. 다시 실행해도 안전
--     · 기기가 자기 서명 키를 만들어 기기 안에만 둠. 여기에는 공개 키와, 미리 만들어 둔 "보내도 됨" 서명(8일 치)만 올라옴
--     · 앱이 앞으로 울릴 알림 목록을 alarms에 올려 둠
--     · push_tick()이 때가 된 알림이 있는 사람의 기기로 내용 없는 신호를 보냄. 알림 글은 기기가 push_due()로 가져감
create extension if not exists http with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create table if not exists public.push_subs (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pub text not null,
  tokens jsonb not null default '[]'::jsonb,
  ua text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_status integer,
  last_at timestamptz,
  -- 애플·구글·모질라·윈도우의 푸시 주소만 받음 (DB가 아무 주소로나 요청을 보내지 않게)
  constraint push_subs_host check (endpoint ~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|([a-z0-9-]+\.)*push\.apple\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*notify\.windows\.com)/' and length(endpoint) < 1200),
  constraint push_subs_size check (length(pub) between 80 and 100 and pg_column_size(tokens) < 20000)
);
create index if not exists push_subs_user on public.push_subs (user_id);

create table if not exists public.alarms (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  at timestamptz not null,
  until timestamptz not null,
  title text not null default '',
  body text not null default '',
  url text not null default '',
  sent_at timestamptz,
  primary key (user_id, id)
);
create index if not exists alarms_due on public.alarms (at) where sent_at is null;

alter table public.push_subs enable row level security;
alter table public.alarms enable row level security;
drop policy if exists push_subs_own on public.push_subs;
create policy push_subs_own on public.push_subs for select to authenticated using (user_id = auth.uid());
drop policy if exists alarms_own on public.alarms;
create policy alarms_own on public.alarms for select to authenticated using (user_id = auth.uid());
grant select on public.push_subs to authenticated;   -- 쓰기는 아래 함수로만
grant select on public.alarms to authenticated;
revoke truncate, references, trigger on public.push_subs, public.alarms from anon, authenticated;

drop trigger if exists push_subs_touch on public.push_subs;
drop function if exists public.push_subs_touch();

-- 이 기기를 등록(또는 서명을 새로 채움). 같은 기기에서 다른 멤버가 로그인하면 그 멤버 것으로 넘어감
create or replace function public.push_register(p_endpoint text, p_pub text, p_tokens jsonb, p_ua text default '') returns boolean
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not public.is_active() then raise exception 'not allowed'; end if;
  if jsonb_typeof(p_tokens) <> 'array' or jsonb_array_length(p_tokens) > 40 then raise exception 'bad tokens'; end if;
  if (select count(*) from public.push_subs where user_id = uid and endpoint <> p_endpoint) >= 12 then   -- 한 사람 기기는 12대까지: 가장 오래된 것부터 지움
    delete from public.push_subs where endpoint in (select endpoint from public.push_subs where user_id = uid and endpoint <> p_endpoint order by updated_at limit 1);
  end if;
  insert into public.push_subs (endpoint, user_id, pub, tokens, ua) values (p_endpoint, uid, p_pub, p_tokens, left(coalesce(p_ua, ''), 180))
  on conflict (endpoint) do update set user_id = uid, pub = excluded.pub, tokens = excluded.tokens, ua = excluded.ua, updated_at = now();
  return true;
end $$;
revoke all on function public.push_register(text, text, jsonb, text) from public, anon;
grant execute on function public.push_register(text, text, jsonb, text) to authenticated;

create or replace function public.push_unregister(p_endpoint text) returns boolean
language sql security definer set search_path = public as $$
  with d as (delete from public.push_subs where endpoint = p_endpoint and user_id = auth.uid() returning 1) select exists (select 1 from d)
$$;
revoke all on function public.push_unregister(text) from public, anon;
grant execute on function public.push_unregister(text) to authenticated;

-- 앱이 올리는 알림 목록: 아직 안 보낸 것은 통째로 바꿔 끼움. 이미 보낸 것은 시간이 뒤로 옮겨졌을 때만 다시 울림
create or replace function public.set_alarms(p jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n integer;
begin
  if uid is null or not public.is_active() then raise exception 'not allowed'; end if;
  if jsonb_typeof(p) <> 'array' then raise exception 'bad list'; end if;
  delete from public.alarms where user_id = uid and id not like 'dm|%' and (sent_at is null or until < now() - interval '1 day');   -- 메시지 알림(dm|…)은 14번이 넣은 것이라 지우지 않음
  insert into public.alarms (user_id, id, at, until, title, body, url)
  select uid, left(x->>'id', 200), (x->>'at')::timestamptz, (x->>'until')::timestamptz,
         left(coalesce(x->>'title', ''), 120), left(coalesce(x->>'body', ''), 300), left(coalesce(x->>'url', ''), 200)
  from (select x from jsonb_array_elements(p) x limit 300) q
  where coalesce(x->>'id', '') <> '' and (x->>'until')::timestamptz > now() and (x->>'at')::timestamptz < now() + interval '9 days'
  on conflict (user_id, id) do update
    set title = excluded.title, body = excluded.body, url = excluded.url, until = excluded.until,
        sent_at = case when excluded.at > alarms.at + interval '1 minute' and excluded.at > now() then null else alarms.sent_at end,
        at = case when excluded.at > alarms.at + interval '1 minute' and excluded.at > now() then excluded.at else alarms.at end;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.set_alarms(jsonb) from public, anon;
grant execute on function public.set_alarms(jsonb) to authenticated;

-- 닫힌 앱 알림 시험: p_delay초 뒤에 울릴 알림 하나를 넣음 (다음 1분 주기에 나감)
create or replace function public.push_test(p_delay integer default 15) returns boolean
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not public.is_active() then raise exception 'not allowed'; end if;
  delete from public.alarms where user_id = uid and id like 'test|%' and at < now() - interval '2 minutes';
  if (select count(*) from public.alarms where user_id = uid and id like 'test|%') >= 5 then return false; end if;
  insert into public.alarms (user_id, id, at, until, title, body, url)
  values (uid, 'test|' || floor(extract(epoch from clock_timestamp()))::text, now() + make_interval(secs => least(greatest(coalesce(p_delay, 15), 0), 300)),
          now() + interval '15 minutes', '시험 알림', '앱을 닫아도 이렇게 와요.', '#/settings')
  on conflict do nothing;
  return true;
end $$;
revoke all on function public.push_test(integer) from public, anon;
grant execute on function public.push_test(integer) to authenticated;

-- 기기의 서비스 워커가 신호를 받고 알림 글을 가져감. 로그인 없이 부르므로, 그 기기만 아는 푸시 주소가 열쇠
create or replace function public.push_due(p_endpoint text) returns json
language sql security definer set search_path = public stable as $$
  select coalesce(json_agg(json_build_object('id', a.id, 'title', a.title, 'body', a.body, 'url', a.url) order by a.at), '[]'::json)
  from public.alarms a join public.push_subs s on s.user_id = a.user_id
  where s.endpoint = p_endpoint and length(p_endpoint) > 60
    and a.sent_at > now() - interval '10 minutes' and a.until > now() - interval '10 minutes'
$$;
revoke all on function public.push_due(text) from public;
grant execute on function public.push_due(text) to anon, authenticated;

-- 1분마다: 때가 된 알림을 보낸 것으로 찍고, 그 사람의 기기마다 신호 하나씩
create or replace function public.push_tick() returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare users uuid[]; s record; tok text; res extensions.http_response; n integer := 0; ep bigint := extract(epoch from now())::bigint;
begin
  with due as (update public.alarms set sent_at = now() where sent_at is null and at <= now() returning user_id, until)
  select array_agg(distinct user_id) into users from due where until >= now();
  delete from public.alarms where until < now() - interval '2 days';
  if users is null then return 0; end if;
  for s in select * from public.push_subs where user_id = any(users) loop
    -- 만료가 5분 넘게 남았고 24시간 안쪽인 서명 가운데 가장 이른 것
    select t->>'t' into tok from jsonb_array_elements(s.tokens) t
      where (t->>'exp')::bigint > ep + 300 and (t->>'exp')::bigint < ep + 86000 order by (t->>'exp')::bigint limit 1;
    if tok is null then update public.push_subs set last_status = 0, last_at = now() where endpoint = s.endpoint; continue; end if;   -- 서명이 떨어짐: 앱을 열면 다시 채워짐
    begin
      res := extensions.http(('POST', s.endpoint, array[
        extensions.http_header('Authorization', 'vapid t=' || tok || ', k=' || s.pub),
        extensions.http_header('TTL', '1800'), extensions.http_header('Urgency', 'high')],
        'application/octet-stream', '')::extensions.http_request);
      if res.status in (404, 410) then delete from public.push_subs where endpoint = s.endpoint;   -- 폰이 없앤 주소
      else update public.push_subs set last_status = res.status, last_at = now() where endpoint = s.endpoint; if res.status between 200 and 299 then n := n + 1; end if;
      end if;
    exception when others then
      update public.push_subs set last_status = -1, last_at = now() where endpoint = s.endpoint;
    end;
  end loop;
  return n;
end $$;
revoke all on function public.push_tick() from public, anon, authenticated;

select cron.schedule('hajin-push-tick', '* * * * *', $$select public.push_tick()$$);

-- ───────────────────────────────────────────────────────────────
-- 14. 메신저 알림: 메시지가 오면 받는 사람에게 닫힌 앱 알림 (v1.36.0)
--     · dms에 한 줄이 들어가면 받는 사람의 alarms에 "○○ 님의 메시지"를 넣음. 다음 1분 주기(push_tick)에 폰으로 나감
--     · 받는 사람이 아직 로그인한 적이 없으면(user_id 없음) 아무것도 안 함
create or replace function public.dm_alarm() returns trigger
language plpgsql security definer set search_path = public as $$
declare u uuid; nm text;
begin
  select user_id into u from public.members where id = new.to_member and active;
  if u is null then return new; end if;
  select name into nm from public.members where id = new.from_member;
  delete from public.alarms where user_id = u and id like 'dm|%' and until < now() - interval '1 day';
  insert into public.alarms (user_id, id, at, until, title, body, url)
  values (u, 'dm|' || new.id::text, now(), now() + interval '12 hours',
          coalesce(nm, '팀원') || ' 님의 메시지', left(new.body, 120), '#/talk/' || new.from_member::text)
  on conflict do nothing;
  return new;
exception when others then return new;   -- 알림을 못 넣어도 메시지는 보내짐
end $$;
revoke all on function public.dm_alarm() from public, anon, authenticated;
drop trigger if exists dms_alarm on public.dms;
create trigger dms_alarm after insert on public.dms for each row execute function public.dm_alarm();

-- ============================================================
-- 15. 내 프로필 (v1.36.0): 색과 사진은 멤버가 직접, 이름은 관리자만
-- ============================================================
-- 사진은 앱이 128px로 줄인 작은 그림을 글자로 넣음(저장 공간 요금 없음). 색은 #rrggbb.
do $$ begin
  alter table public.members add constraint members_color_ok check (color ~ '^(#[0-9a-fA-F]{6})?$');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.members add constraint members_avatar_ok check (avatar = '' or (char_length(avatar) <= 40000 and avatar ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$'));
exception when duplicate_object then null; end $$;

-- 내 줄의 색·사진만 바꿈. null은 그대로, ''는 지움. 이름·역할은 여기서 못 바꿈
create or replace function public.set_my_profile(p_color text, p_avatar text) returns json
language plpgsql security definer set search_path = public as $$
declare m public.members;
begin
  update public.members set color = coalesce(p_color, color), avatar = coalesce(p_avatar, avatar)
    where user_id = auth.uid() and active returning * into m;
  if m.id is null then raise exception '로그인한 멤버만 바꿀 수 있어요'; end if;
  update public.space_members set name = m.name where user_id = auth.uid();   -- 같은 팀 기기들이 바로 다시 받아 가게 건드림
  return json_build_object('id', m.id, 'color', m.color, 'avatar', m.avatar);
end $$;
revoke all on function public.set_my_profile(text, text) from public, anon;
grant execute on function public.set_my_profile(text, text) to authenticated;

-- 이름을 스스로 고치는 길을 막음 (관리자의 멤버 수정만 이름을 바꿈)
drop policy if exists members_self_update on public.space_members;
revoke update on public.space_members from authenticated;

-- ============================================================
-- 16. 단기 작업자와 기간 (v1.39.0). 다시 실행해도 안전
-- ============================================================
-- 멤버 종류: member(정식) / guest(단기 작업자). until = 이 날까지만 쓸 수 있음(비우면 끝 없음, 한국 날짜 기준).
-- projects = 단기 작업자가 볼 프로젝트 이름들. 단기 작업자는 그 프로젝트의 할 일·일정·회의록·메모·문서·레퍼런스만 보고 씀.
-- 돈(비용·받을 돈), 업체, 연락처, 지원사업, 구매 목록, 수정 기록, 팀 공용 AI 키는 단기 작업자에게 내려가지 않음.
alter table public.members add column if not exists kind text not null default 'member';
alter table public.members add column if not exists until date;
alter table public.members add column if not exists projects text[] not null default '{}';
do $$ begin
  alter table public.members add constraint members_kind_ok check (kind in ('member', 'guest'));
exception when duplicate_object then null; end $$;

-- 지금 쓸 수 있는 멤버인지: 사용 중이고 기간이 안 지났는지
create or replace function public.member_live(p_active boolean, p_until date) returns boolean
language sql stable as $$
  select coalesce(p_active, false) and (p_until is null or p_until >= (now() at time zone 'Asia/Seoul')::date)
$$;

create or replace function public.is_active() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.members where user_id = auth.uid() and public.member_live(active, until))
$$;
create or replace function public.is_admin() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.members where user_id = auth.uid() and is_admin and kind = 'member' and public.member_live(active, until))
$$;
create or replace function public.my_member() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.members where user_id = auth.uid() and public.member_live(active, until) limit 1
$$;
create or replace function public.is_guest() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.members where user_id = auth.uid() and kind = 'guest')
$$;
-- 단기 작업자가 이 줄을 볼 수 있는지 (맡은 프로젝트의 것만)
create or replace function public.guest_sees(p_col text, p_data jsonb) returns boolean
language sql security definer set search_path = public stable as $$
  select case
    when p_col in ('teams', 'labelsets') then true
    when p_col = 'projects' then coalesce(p_data->>'name', '') = any (coalesce((select projects from public.members where user_id = auth.uid()), '{}'))
    when p_col in ('tasks', 'events', 'meetings', 'notes', 'docs', 'refs', 'reffolders', 'figmafiles')
      then coalesce(p_data->>'project', '') <> '' and (p_data->>'project') = any (coalesce((select projects from public.members where user_id = auth.uid()), '{}'))
    else false end
$$;
revoke all on function public.is_guest() from public, anon;
revoke all on function public.guest_sees(text, jsonb) from public, anon;
grant execute on function public.is_guest() to authenticated;
grant execute on function public.guest_sees(text, jsonb) to authenticated;
grant execute on function public.member_live(boolean, date) to anon, authenticated;

-- 팀 기록: 정식 멤버는 그대로, 단기 작업자는 맡은 프로젝트 것만
drop policy if exists sitems_read on public.space_items;
create policy sitems_read on public.space_items for select to authenticated
  using (public.is_member(space) and public.is_active() and (not public.is_guest() or public.guest_sees(col, data)));
drop policy if exists sitems_ins on public.space_items;
create policy sitems_ins on public.space_items for insert to authenticated
  with check (public.is_member(space) and public.is_active() and col <> '_kv'
    and (col not in ('teams', 'projects', 'reffolders', 'labelsets') or public.is_admin())
    and (not public.is_guest() or public.guest_sees(col, data)));
drop policy if exists sitems_upd on public.space_items;
create policy sitems_upd on public.space_items for update to authenticated
  using (public.is_member(space) and public.is_active()
    and (col not in ('teams', 'projects', 'reffolders', 'labelsets') or public.is_admin())
    and (not public.is_guest() or public.guest_sees(col, data)))
  with check (public.is_member(space) and public.is_active() and col <> '_kv'
    and (col not in ('teams', 'projects', 'reffolders', 'labelsets') or public.is_admin())
    and (not public.is_guest() or public.guest_sees(col, data)));

-- 팀 공용 AI 키는 정식 멤버에게만
create or replace function public.team_secret(p_k text) returns text
language sql security definer set search_path = public stable as $$
  select v from public.team_secrets where k = p_k and public.is_active() and not public.is_guest()
$$;

-- 로그인 전 코드 확인: 기간이 지난 코드는 안 됨
create or replace function public.check_code(p_code text) returns json
language plpgsql security definer set search_path = public as $$
declare v_ip text := coalesce(split_part(coalesce(current_setting('request.headers', true), '{}')::json ->> 'x-forwarded-for', ',', 1), '');
  r json; n_ip int; n_all int; ended boolean;
begin
  delete from public.code_tries where at < now() - interval '1 day';
  select count(*) filter (where ip = v_ip), count(*) into n_ip, n_all from public.code_tries where at > now() - interval '10 minutes' and not ok;
  if n_ip >= 10 or n_all >= 80 then raise exception '코드를 여러 번 틀렸어요. 10분 뒤에 다시 해 주세요'; end if;
  select json_build_object('id', id, 'name', name) into r from public.members where code = upper(trim(p_code)) and public.member_live(active, until);
  if r is null then select true into ended from public.members where code = upper(trim(p_code)) and active and until is not null; end if;
  insert into public.code_tries (ip, ok) values (v_ip, r is not null or coalesce(ended, false));
  if coalesce(ended, false) then raise exception '이 코드는 쓸 수 있는 기간이 끝났어요. 관리자에게 물어봐 주세요'; end if;
  if r is null then perform pg_sleep(0.4); end if;
  return r;
end $$;
grant execute on function public.check_code(text) to anon, authenticated;

create or replace function public.claim_member(p_code text) returns json
language plpgsql security definer set search_path = public as $$
declare m public.members; s record;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  select * into m from public.members where code = upper(trim(p_code)) and public.member_live(active, until);
  if m.id is null then raise exception '멤버 코드가 맞지 않아요'; end if;
  if m.user_id is not null and m.user_id <> auth.uid() then raise exception '이미 다른 계정에 연결된 코드예요'; end if;
  update public.members set user_id = auth.uid() where id = m.id;
  for s in select id from public.spaces where is_main loop
    insert into public.space_members (space, user_id, name) values (s.id, auth.uid(), m.name)
      on conflict (space, user_id) do update set name = excluded.name;
  end loop;
  return json_build_object('id', m.id, 'name', m.name, 'role', m.role, 'is_admin', m.is_admin and m.kind = 'member', 'gmail', m.gmail,
    'kind', m.kind, 'until', m.until, 'projects', to_json(m.projects));
end $$;

-- 명단: 종류·기간·맡은 프로젝트를 같이. 코드는 관리자에게만, 지메일은 단기 작업자에게 안 보임
create or replace function public.list_members() returns setof json
language sql security definer set search_path = public stable as $$
  select json_build_object('id', id, 'name', name, 'role', role, 'gmail', case when public.is_guest() then '' else gmail end,
    'is_admin', is_admin and kind = 'member', 'active', active,
    'joined', user_id is not null, 'user_id', user_id, 'code', case when public.is_admin() then code else null end,
    'color', color, 'avatar', avatar, 'kind', kind, 'until', until, 'projects', to_json(projects),
    'ended', not public.member_live(active, until))
  from public.members
  where public.is_active()
  order by is_admin desc, kind desc, created_at
$$;

-- 관리자: 멤버 추가·수정 (종류·기간·맡길 프로젝트까지). 예전 7칸짜리는 없애고 이것만 씀(뒤의 세 칸은 비워도 됨)
drop function if exists public.admin_save_member(uuid, text, text, text, text, boolean, boolean);
drop function if exists public.admin_save_member(uuid, text, text, text, text, boolean, boolean, text, date, text[], boolean);
create or replace function public.admin_save_member(p_id uuid, p_code text, p_name text, p_role text, p_gmail text, p_is_admin boolean, p_active boolean,
  p_kind text default null, p_until date default null, p_projects text[] default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare m public.members; c text := upper(trim(p_code)); k text;
begin
  if not public.is_admin() then raise exception '관리자만 할 수 있어요'; end if;
  if p_id is null then
    k := coalesce(p_kind, 'member');
    insert into public.members (code, name, role, gmail, is_admin, active, kind, until, projects)
      values (c, p_name, coalesce(p_role,''), coalesce(p_gmail,''), coalesce(p_is_admin,false) and k = 'member', coalesce(p_active,true), k, p_until, coalesce(p_projects, '{}')) returning * into m;
  else
    select kind into k from public.members where id = p_id; k := coalesce(p_kind, k, 'member');
    update public.members set code = c, name = p_name, role = coalesce(p_role,''), gmail = coalesce(p_gmail,''),
        is_admin = coalesce(p_is_admin,false) and k = 'member', active = coalesce(p_active,true), kind = k,
        until = case when p_kind is null then until else p_until end,   -- 예전 앱(종류를 안 보냄)이 고치면 기간은 그대로
        projects = coalesce(p_projects, projects)
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
revoke all on function public.admin_save_member(uuid, text, text, text, text, boolean, boolean, text, date, text[]) from public, anon;
grant execute on function public.admin_save_member(uuid, text, text, text, text, boolean, boolean, text, date, text[]) to authenticated;

-- (v1.39.0) 팀 기록을 고칠 때마다 서버가 'record "old" has no field "by"'로 막던 것을 고침.
-- 올린 사람 칸 이름(by)이 예약어라 따옴표 없이 쓰면 새로 넣기는 되는데 고치기가 전부 실패했음 (할 일 끝내기, 일정 옮기기 등이 팀에 안 올라감).
create or replace function public.space_items_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then new."by" := auth.uid(); return new; end if;
  if old.col = 'audit' then return old; end if;
  new."by" := old."by"; new.col := old.col;
  return new;
end $$;

-- 보안 점검(11/25 Security Advisor): search_path가 고정 안 된 함수 고정 (다시 실행해도 안전)
alter function public.touch_server_at() set search_path = public;
alter function public.space_items_guard() set search_path = public;
alter function public.member_live(boolean, date) set search_path = public;
