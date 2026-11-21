-- 프롬프트 스튜디오(따로 떼어 낸 유료 서비스, /studio/)의 서버 구조.
-- 팀 앱 표와 섞이지 않게 모두 ps_ 로 시작. 손님은 로그인 없이 "복구 코드(token)"로 구분.
-- 표는 직접 못 읽고(정책 없음 + 권한 회수), 아래 함수로만 다룸. 다시 실행해도 안전.
-- 비밀 값(입금 알림 비밀키)과 유료 틀 본문은 이 파일에 넣지 않음. 따로 실행하는 비공개 SQL에 있음.

create table if not exists public.ps_templates (
  id text primary key,
  cat text not null,
  title text not null,
  summary text not null default '',
  body text not null,
  free boolean not null default false,
  sort int not null default 0,
  lang text not null default 'ko',
  updated_at timestamptz not null default now()
);
create table if not exists public.ps_customers (
  token text primary key,
  code text unique not null,
  paid_until timestamptz,
  created_at timestamptz not null default now(),
  last_seen timestamptz
);
create table if not exists public.ps_deposits (
  id bigserial primary key,
  raw text not null,
  amount int,
  code text,
  days int not null default 0,
  matched boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.ps_settings (k text primary key, v text not null default '');

alter table public.ps_templates enable row level security;
alter table public.ps_customers enable row level security;
alter table public.ps_deposits enable row level security;
alter table public.ps_settings enable row level security;
revoke all on public.ps_templates, public.ps_customers, public.ps_deposits, public.ps_settings from anon, authenticated;

-- 목록: 유료 틀은 제목·설명만, 본문은 무료 틀만
create or replace function public.ps_catalog(p_lang text default 'ko')
returns table(id text, cat text, title text, summary text, free boolean, sort int, body text)
language sql stable security definer set search_path = public as $$
  select t.id, t.cat, t.title, t.summary, t.free, t.sort, case when t.free then t.body else null end
  from ps_templates t where t.lang = coalesce(p_lang, 'ko') order by t.sort, t.title;
$$;

-- 새 손님: 복구 코드와 입금 코드(예: K7M2)를 만들어 줌
create or replace function public.ps_join()
returns json language plpgsql volatile security definer set search_path = public as $$
declare v_token text; v_code text; L text := 'ABCDEFGHJKLMNPQRSTUVWXYZ'; D text := '23456789'; i int := 0;
begin
  if (select count(*) from ps_customers where created_at > now() - interval '1 minute') > 40 then
    raise exception 'busy';
  end if;
  v_token := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
  loop
    v_code := substr(L, 1 + floor(random() * 24)::int, 1) || substr(D, 1 + floor(random() * 8)::int, 1)
           || substr(L, 1 + floor(random() * 24)::int, 1) || substr(D, 1 + floor(random() * 8)::int, 1);
    exit when not exists (select 1 from ps_customers where code = v_code);
    i := i + 1; if i > 50 then raise exception 'code'; end if;
  end loop;
  insert into ps_customers(token, code, last_seen) values (v_token, v_code, now());
  return json_build_object('token', v_token, 'code', v_code, 'paid_until', null, 'active', false);
end $$;

-- 내 상태
create or replace function public.ps_me(p_token text)
returns json language plpgsql volatile security definer set search_path = public as $$
declare c ps_customers;
begin
  update ps_customers set last_seen = now() where token = upper(trim(p_token)) returning * into c;
  if c.token is null then return null; end if;
  return json_build_object('token', c.token, 'code', c.code, 'paid_until', c.paid_until, 'active', coalesce(c.paid_until > now(), false));
end $$;

-- 틀 본문: 무료이거나 구독 중일 때만
create or replace function public.ps_body(p_token text, p_id text)
returns text language sql stable security definer set search_path = public as $$
  select t.body from ps_templates t
  where t.id = p_id and (t.free or exists (select 1 from ps_customers c where c.token = upper(trim(coalesce(p_token, ''))) and c.paid_until > now()));
$$;

-- 손님에게 보여 줄 입금 계좌 (관리 화면에서 넣음)
create or replace function public.ps_bank()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'bank', (select v from ps_settings where k = 'bank'),
    'account', (select v from ps_settings where k = 'account'),
    'holder', (select v from ps_settings where k = 'holder'));
$$;

-- 입금 금액 → 늘릴 날짜 (11/21 가격 조정): 24,900원마다 365일, 남은 7,900원마다 93일,
-- 남은 돈은 2,900원 = 31일 비율로(옛 가격 990원을 보내면 10일)
create or replace function public.ps_days(p_amount int)
returns int language sql immutable as $$
  select (a / 24900) * 365 + ((a % 24900) / 7900) * 93 + ((a % 24900 % 7900) * 31 / 2900)
  from (select greatest(coalesce(p_amount, 0), 0) as a) x;
$$;

create or replace function public.ps_ok(p_secret text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from ps_settings where k = 'hook_secret' and length(v) >= 16 and v = coalesce(p_secret, ''));
$$;

-- 입금 알림 받기: 폰 자동화가 알림 글을 그대로 보냄. 글에서 금액과 입금 코드를 찾아 기간을 늘림
create or replace function public.ps_deposit(p_secret text, p_msg text)
returns json language plpgsql volatile security definer set search_path = public as $$
declare v_msg text := left(coalesce(p_msg, ''), 600); v_amount int; v_code text; m text[]; v_days int; c ps_customers;
begin
  if not ps_ok(p_secret) then raise exception 'denied'; end if;
  -- 같은 알림이 두 번 오면 한 번만
  if exists (select 1 from ps_deposits where raw = v_msg and created_at > now() - interval '10 minutes') then
    return json_build_object('ok', true, 'dup', true);
  end if;
  m := regexp_match(v_msg, '([0-9][0-9,]*)\s*원');
  if m is not null then v_amount := replace(m[1], ',', '')::int; end if;
  for m in select regexp_matches(upper(v_msg), '[A-Z][2-9][A-Z][2-9]', 'g') loop
    if exists (select 1 from ps_customers where code = m[1]) then v_code := m[1]; exit; end if;
  end loop;
  v_days := ps_days(v_amount);
  if v_code is not null and v_days > 0 then
    update ps_customers set paid_until = greatest(coalesce(paid_until, now()), now()) + make_interval(days => v_days)
    where code = v_code returning * into c;
    insert into ps_deposits(raw, amount, code, days, matched) values (v_msg, v_amount, v_code, v_days, true);
    return json_build_object('ok', true, 'code', v_code, 'days', v_days, 'until', c.paid_until);
  end if;
  insert into ps_deposits(raw, amount, code, days, matched) values (v_msg, v_amount, v_code, 0, false);
  return json_build_object('ok', false, 'amount', v_amount, 'code', v_code);
end $$;

-- 관리: 최근 입금·손님 보기
create or replace function public.ps_admin(p_secret text)
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not ps_ok(p_secret) then raise exception 'denied'; end if;
  return json_build_object(
    'deposits', (select coalesce(json_agg(d order by d.created_at desc), '[]') from (select * from ps_deposits order by created_at desc limit 60) d),
    'active', (select count(*) from ps_customers where paid_until > now()),
    'customers', (select count(*) from ps_customers),
    'recent', (select coalesce(json_agg(x order by x.paid_until desc nulls last), '[]') from (select code, paid_until, created_at, last_seen from ps_customers where paid_until is not null order by paid_until desc limit 60) x));
end $$;

-- 관리: 손으로 기간 주기(못 맞춘 입금 처리용). 음수면 줄임
create or replace function public.ps_admin_grant(p_secret text, p_code text, p_days int, p_deposit bigint default null)
returns json language plpgsql volatile security definer set search_path = public as $$
declare c ps_customers;
begin
  if not ps_ok(p_secret) then raise exception 'denied'; end if;
  update ps_customers set paid_until = greatest(coalesce(paid_until, now()), now()) + make_interval(days => p_days)
  where code = upper(trim(p_code)) returning * into c;
  if c.token is null then return json_build_object('ok', false); end if;
  if p_deposit is not null then update ps_deposits set code = c.code, days = p_days, matched = true where id = p_deposit; end if;
  return json_build_object('ok', true, 'code', c.code, 'until', c.paid_until);
end $$;

-- 관리: 계좌 정보 넣기 (bank/account/holder만)
create or replace function public.ps_admin_set(p_secret text, p_k text, p_v text)
returns boolean language plpgsql volatile security definer set search_path = public as $$
begin
  if not ps_ok(p_secret) then raise exception 'denied'; end if;
  if p_k not in ('bank', 'account', 'holder') then return false; end if;
  insert into ps_settings(k, v) values (p_k, left(coalesce(p_v, ''), 60)) on conflict (k) do update set v = excluded.v;
  return true;
end $$;

revoke all on function public.ps_catalog(text), public.ps_join(), public.ps_me(text), public.ps_body(text, text), public.ps_bank(),
  public.ps_days(int), public.ps_ok(text), public.ps_deposit(text, text), public.ps_admin(text), public.ps_admin_grant(text, text, int, bigint),
  public.ps_admin_set(text, text, text) from public;
grant execute on function public.ps_catalog(text), public.ps_join(), public.ps_me(text), public.ps_body(text, text), public.ps_bank(),
  public.ps_deposit(text, text), public.ps_admin(text), public.ps_admin_grant(text, text, int, bigint), public.ps_admin_set(text, text, text)
  to anon, authenticated;

-- ── 마이페이지: 보관함·폴더·결제 내역 (2차) ──
alter table public.ps_customers add column if not exists folders jsonb not null default '[]';
create table if not exists public.ps_saves (
  id text primary key,
  token text not null references public.ps_customers(token) on delete cascade,
  title text not null default '',
  template_id text,
  folder text not null default '',
  vals jsonb not null default '{}',
  text text not null default '',
  pinned boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists ps_saves_token on public.ps_saves(token, updated_at desc);
alter table public.ps_saves enable row level security;
revoke all on public.ps_saves from anon, authenticated;

create or replace function public.ps_cust(p_token text)
returns public.ps_customers language sql stable security definer set search_path = public as $$
  select * from ps_customers where token = upper(trim(coalesce(p_token, '')));
$$;

-- 내 보관함 전체 + 폴더 + 결제 내역
create or replace function public.ps_mine(p_token text)
returns json language plpgsql stable security definer set search_path = public as $$
declare c ps_customers := ps_cust(p_token);
begin
  if c.token is null then return null; end if;
  return json_build_object(
    'folders', c.folders,
    'saves', (select coalesce(json_agg(s order by s.pinned desc, s.updated_at desc), '[]') from (select id, title, template_id, folder, vals, text, pinned, updated_at from ps_saves where token = c.token order by updated_at desc limit 500) s),
    'payments', (select coalesce(json_agg(p order by p.created_at desc), '[]') from (select amount, days, created_at from ps_deposits where code = c.code and matched order by created_at desc limit 50) p));
end $$;

-- 보관하기(새로 또는 고치기). 한 사람에 500개까지
create or replace function public.ps_save(p_token text, p_item json)
returns json language plpgsql volatile security definer set search_path = public as $$
declare c ps_customers := ps_cust(p_token); v_id text := left(coalesce(p_item->>'id', ''), 40);
begin
  if c.token is null then raise exception 'token'; end if;
  if v_id = '' then v_id := replace(gen_random_uuid()::text, '-', ''); end if;
  if not exists (select 1 from ps_saves where id = v_id) and (select count(*) from ps_saves where token = c.token) >= 500 then raise exception 'full'; end if;
  insert into ps_saves(id, token, title, template_id, folder, vals, text, pinned, updated_at)
  values (v_id, c.token, left(coalesce(p_item->>'title', ''), 80), left(p_item->>'template_id', 60), left(coalesce(p_item->>'folder', ''), 30),
    coalesce((p_item->'vals')::jsonb, '{}'), left(coalesce(p_item->>'text', ''), 20000), coalesce((p_item->>'pinned')::boolean, false), now())
  on conflict (id) do update set title = excluded.title, folder = excluded.folder, vals = excluded.vals, text = excluded.text, pinned = excluded.pinned, updated_at = now()
  where ps_saves.token = c.token;
  return json_build_object('id', v_id);
end $$;

create or replace function public.ps_unsave(p_token text, p_id text)
returns boolean language sql volatile security definer set search_path = public as $$
  with d as (delete from ps_saves where id = p_id and token = upper(trim(coalesce(p_token, ''))) returning 1) select exists (select 1 from d);
$$;

-- 폴더 목록 통째로 저장(이름 바꾸기·지우기는 화면에서 보관함도 같이 고침)
create or replace function public.ps_folders(p_token text, p_folders json)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare c ps_customers := ps_cust(p_token);
begin
  if c.token is null then return false; end if;
  if json_typeof(p_folders) <> 'array' or json_array_length(p_folders) > 50 then return false; end if;
  update ps_customers set folders = p_folders::jsonb where token = c.token;
  return true;
end $$;

-- 폴더 이름 바꾸기·지우기(지우면 안의 것은 "폴더 없음"으로)
create or replace function public.ps_move_folder(p_token text, p_from text, p_to text)
returns boolean language sql volatile security definer set search_path = public as $$
  with u as (update ps_saves set folder = left(coalesce(p_to, ''), 30), updated_at = now() where token = upper(trim(coalesce(p_token, ''))) and folder = p_from returning 1) select true;
$$;

revoke all on function public.ps_cust(text), public.ps_mine(text), public.ps_save(text, json), public.ps_unsave(text, text), public.ps_folders(text, json), public.ps_move_folder(text, text, text) from public;
grant execute on function public.ps_mine(text), public.ps_save(text, json), public.ps_unsave(text, text), public.ps_folders(text, json), public.ps_move_folder(text, text, text) to anon, authenticated;

-- ── 기프트 키 (3차): 한 달 무료·평생 무료 등. 평생은 paid_until = 'infinity' ──
create table if not exists public.ps_gifts (
  key text primary key,
  days int,                         -- null이면 평생
  max_uses int not null default 1,
  used int not null default 0,
  note text not null default '',
  expires_at timestamptz,           -- 이 날짜가 지나면 못 씀(null이면 계속)
  created_at timestamptz not null default now()
);
create table if not exists public.ps_gift_uses (
  key text not null references public.ps_gifts(key) on delete cascade,
  token text not null references public.ps_customers(token) on delete cascade,
  used_at timestamptz not null default now(),
  primary key (key, token)
);
alter table public.ps_gifts enable row level security;
alter table public.ps_gift_uses enable row level security;
revoke all on public.ps_gifts, public.ps_gift_uses from anon, authenticated;

-- 손님: 키 넣기. 없으면 손님부터 만들어 줌(복구 코드는 화면이 저장)
create or replace function public.ps_redeem(p_token text, p_key text)
returns json language plpgsql volatile security definer set search_path = public as $$
declare k text := upper(regexp_replace(coalesce(p_key, ''), '[^A-Za-z0-9]', '', 'g')); k2 text; g ps_gifts; c ps_customers := ps_cust(p_token);
begin
  if length(k) < 8 then return json_build_object('ok', false, 'why', 'format'); end if;
  select * into g from ps_gifts where replace(key, '-', '') = k for update;
  if g.key is null then return json_build_object('ok', false, 'why', 'none'); end if;
  if g.expires_at is not null and g.expires_at < now() then return json_build_object('ok', false, 'why', 'expired'); end if;
  if c.token is null then
    k2 := ps_join()->>'token'; -- 새 손님
    select * into c from ps_customers where token = k2;
  end if;
  if exists (select 1 from ps_gift_uses where key = g.key and token = c.token) then return json_build_object('ok', false, 'why', 'mine', 'token', c.token); end if;
  if g.used >= g.max_uses then return json_build_object('ok', false, 'why', 'used'); end if;
  update ps_gifts set used = used + 1 where key = g.key;
  insert into ps_gift_uses(key, token) values (g.key, c.token);
  update ps_customers set paid_until = case when g.days is null then 'infinity'::timestamptz
    else greatest(coalesce(paid_until, now()), now()) + make_interval(days => g.days) end
  where token = c.token returning * into c;
  return json_build_object('ok', true, 'token', c.token, 'code', c.code, 'days', g.days, 'forever', g.days is null, 'paid_until', c.paid_until);
end $$;

-- 관리: 키 만들기. p_days 0이면 평생. 키 모양 XXXX-XXXX-XXXX
create or replace function public.ps_admin_gift_make(p_secret text, p_days int, p_count int, p_max_uses int default 1, p_note text default '', p_expires timestamptz default null)
returns json language plpgsql volatile security definer set search_path = public as $$
declare A text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; out text[] := '{}'; k text; i int; j int;
begin
  if not ps_ok(p_secret) then raise exception 'denied'; end if;
  for i in 1..least(greatest(coalesce(p_count, 1), 1), 100) loop
    loop
      k := '';
      for j in 1..12 loop
        k := k || substr(A, 1 + (get_byte(decode(md5(gen_random_uuid()::text), 'hex'), 0) % 32), 1);
        if j in (4, 8) then k := k || '-'; end if;
      end loop;
      exit when not exists (select 1 from ps_gifts where key = k);
    end loop;
    insert into ps_gifts(key, days, max_uses, note, expires_at)
    values (k, nullif(p_days, 0), greatest(coalesce(p_max_uses, 1), 1), left(coalesce(p_note, ''), 60), p_expires);
    out := out || k;
  end loop;
  return to_json(out);
end $$;

create or replace function public.ps_admin_gifts(p_secret text)
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not ps_ok(p_secret) then raise exception 'denied'; end if;
  return (select coalesce(json_agg(g order by g.created_at desc), '[]') from (select key, days, max_uses, used, note, expires_at, created_at from ps_gifts order by created_at desc limit 200) g);
end $$;

create or replace function public.ps_admin_gift_del(p_secret text, p_key text)
returns boolean language plpgsql volatile security definer set search_path = public as $$
begin
  if not ps_ok(p_secret) then raise exception 'denied'; end if;
  delete from ps_gifts where key = p_key and used = 0;
  return found;
end $$;

revoke all on function public.ps_redeem(text, text), public.ps_admin_gift_make(text, int, int, int, text, timestamptz), public.ps_admin_gifts(text), public.ps_admin_gift_del(text, text) from public;
grant execute on function public.ps_redeem(text, text), public.ps_admin_gift_make(text, int, int, int, text, timestamptz), public.ps_admin_gifts(text), public.ps_admin_gift_del(text, text) to anon, authenticated;
