-- 하진 프롬프터(따로 떼어 낸 촬영용 대본 앱, /prompter/)의 구독 서버 구조.
-- 팀 앱·프롬프트 스튜디오 표와 섞이지 않게 모두 pr_ 로 시작. 손님은 로그인 없이 "복구 코드(token)"로 구분.
-- 표는 직접 못 읽고(정책 없음 + 권한 회수), 아래 함수로만 다룸. 다시 실행해도 안전.
-- 비밀 값(관리 비밀키, 결제사 시크릿, 빌링키)은 이 파일에 넣지 않음.
--   관리 비밀키: 비공개 SQL 한 줄로 따로 넣음 (insert into pr_settings(k,v) values ('admin_secret', '...')).
--   결제사 시크릿: supabase secrets set 으로 Edge Function(prompter-billing)에만.
--
-- 구독 규칙 하나: 구독 중 = pr_customers.paid_until > now(). 카드·기프트 키·손으로 주기 모두 이 값만 늘림.

create table if not exists public.pr_customers (
  token text primary key,                 -- 복구 코드 16자 (손님 브라우저에 저장)
  paid_until timestamptz,                 -- 'infinity'면 평생
  created_at timestamptz not null default now(),
  last_seen timestamptz
);
create table if not exists public.pr_settings (k text primary key, v text not null default '');

-- 카드 정기결제(빌링키). billing_key는 Edge Function만 읽음. 손님 함수 반환값에 절대 넣지 않음.
create table if not exists public.pr_billing (
  token text primary key references public.pr_customers(token) on delete cascade,
  billing_key text not null,
  card_label text not null default '',    -- 예: "신한 1234"
  plan text not null default 'month',     -- month(월 990원 자동)
  amount int not null default 990,
  status text not null default 'active',  -- active / canceled / failed
  next_at timestamptz,                    -- 다음 청구일
  fail_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- 모든 결제·기간 변동 기록 (카드·기프트·손으로)
create table if not exists public.pr_payments (
  id bigserial primary key,
  token text references public.pr_customers(token) on delete set null,
  method text not null,                   -- card / gift / admin
  amount int not null default 0,
  currency text not null default 'KRW',
  ext_id text unique,                     -- 결제사 paymentId (중복 반영 막기)
  status text not null default 'paid',    -- paid / failed / canceled / refunded
  days int,                               -- 늘린 일수 (null = 평생)
  memo text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists public.pr_gifts (
  key text primary key,
  days int,                               -- null이면 평생
  max_uses int not null default 1,
  used int not null default 0,
  note text not null default '',
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.pr_gift_uses (
  key text not null references public.pr_gifts(key) on delete cascade,
  token text not null references public.pr_customers(token) on delete cascade,
  used_at timestamptz not null default now(),
  primary key (key, token)
);

alter table public.pr_customers enable row level security;
alter table public.pr_settings enable row level security;
alter table public.pr_billing enable row level security;
alter table public.pr_payments enable row level security;
alter table public.pr_gifts enable row level security;
alter table public.pr_gift_uses enable row level security;
revoke all on public.pr_customers, public.pr_settings, public.pr_billing, public.pr_payments, public.pr_gifts, public.pr_gift_uses from anon, authenticated;
revoke all on sequence public.pr_payments_id_seq from anon, authenticated;

-- 기간 늘리기 (null days = 평생)
create or replace function public.pr_extend(p_token text, p_days int)
returns timestamptz language sql volatile security definer set search_path = public as $$
  update pr_customers set paid_until = case when p_days is null then 'infinity'::timestamptz
    else greatest(coalesce(paid_until, now()), now()) + make_interval(days => p_days) end
  where token = p_token returning paid_until;
$$;

create or replace function public.pr_ok(p_secret text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from pr_settings where k = 'admin_secret' and length(v) >= 16 and v = coalesce(p_secret, ''));
$$;

-- 새 손님
create or replace function public.pr_join()
returns json language plpgsql volatile security definer set search_path = public as $$
declare v_token text;
begin
  if (select count(*) from pr_customers where created_at > now() - interval '1 minute') > 40 then raise exception 'busy'; end if;
  v_token := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
  insert into pr_customers(token, last_seen) values (v_token, now());
  return json_build_object('token', v_token, 'paid_until', null, 'active', false, 'card', null);
end $$;

-- 내 상태 (카드는 이름·다음 결제일만, 빌링키는 안 줌)
create or replace function public.pr_me(p_token text)
returns json language plpgsql volatile security definer set search_path = public as $$
declare c pr_customers; b pr_billing;
begin
  update pr_customers set last_seen = now() where token = upper(trim(coalesce(p_token, ''))) returning * into c;
  if c.token is null then return null; end if;
  select * into b from pr_billing where token = c.token;
  return json_build_object('token', c.token, 'paid_until', c.paid_until, 'active', coalesce(c.paid_until > now(), false),
    'card', case when b.token is null then null else json_build_object('label', b.card_label, 'status', b.status, 'next_at', b.next_at, 'amount', b.amount) end,
    'history', (select coalesce(json_agg(x order by x.created_at desc), '[]') from (
      select method, amount, currency, status, days, created_at from pr_payments where token = c.token order by created_at desc limit 24) x));
end $$;

-- 카드 해지: 다음 청구부터 안 함. 남은 기간은 그대로
create or replace function public.pr_card_cancel(p_token text)
returns json language plpgsql volatile security definer set search_path = public as $$
begin
  update pr_billing set status = 'canceled', updated_at = now() where token = upper(trim(coalesce(p_token, ''))) and status <> 'canceled';
  return json_build_object('ok', found);
end $$;

-- 기프트 키 넣기. 손님이 없으면 만들어 줌
create or replace function public.pr_redeem(p_token text, p_key text)
returns json language plpgsql volatile security definer set search_path = public as $$
declare k text := upper(regexp_replace(coalesce(p_key, ''), '[^A-Za-z0-9]', '', 'g')); g pr_gifts; v_token text; v_until timestamptz;
begin
  if length(k) < 8 then return json_build_object('ok', false, 'why', 'format'); end if;
  select * into g from pr_gifts where replace(key, '-', '') = k for update;
  if g.key is null then return json_build_object('ok', false, 'why', 'none'); end if;
  if g.expires_at is not null and g.expires_at < now() then return json_build_object('ok', false, 'why', 'expired'); end if;
  select token into v_token from pr_customers where token = upper(trim(coalesce(p_token, '')));
  if v_token is null then v_token := pr_join()->>'token'; end if;
  if exists (select 1 from pr_gift_uses where key = g.key and token = v_token) then return json_build_object('ok', false, 'why', 'mine', 'token', v_token); end if;
  if g.used >= g.max_uses then return json_build_object('ok', false, 'why', 'used'); end if;
  update pr_gifts set used = used + 1 where key = g.key;
  insert into pr_gift_uses(key, token) values (g.key, v_token);
  v_until := pr_extend(v_token, g.days);
  insert into pr_payments(token, method, amount, days, memo) values (v_token, 'gift', 0, g.days, g.key);
  return json_build_object('ok', true, 'token', v_token, 'days', g.days, 'forever', g.days is null, 'paid_until', v_until);
end $$;

-- ── 관리 (비밀키) ──
create or replace function public.pr_admin(p_secret text)
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not pr_ok(p_secret) then raise exception 'denied'; end if;
  return json_build_object(
    'customers', (select count(*) from pr_customers),
    'active', (select count(*) from pr_customers where paid_until > now()),
    'cards', (select count(*) from pr_billing where status = 'active'),
    'month_sum', (select coalesce(sum(amount), 0) from pr_payments where method = 'card' and status = 'paid' and created_at > date_trunc('month', now())),
    'payments', (select coalesce(json_agg(p order by p.created_at desc), '[]') from (
      select id, left(token, 4) as who, method, amount, currency, status, days, memo, created_at from pr_payments order by created_at desc limit 60) p));
end $$;

-- 손으로 기간 주기. p_token은 복구 코드 앞 4자리 이상. 0이면 평생, 음수면 줄임
create or replace function public.pr_admin_grant(p_secret text, p_token text, p_days int)
returns json language plpgsql volatile security definer set search_path = public as $$
declare v_token text; n int; v_until timestamptz;
begin
  if not pr_ok(p_secret) then raise exception 'denied'; end if;
  select count(*), min(token) into n, v_token from pr_customers where token like upper(trim(p_token)) || '%' and length(trim(p_token)) >= 4;
  if n <> 1 then return json_build_object('ok', false, 'found', n); end if;
  v_until := pr_extend(v_token, nullif(p_days, 0));
  insert into pr_payments(token, method, amount, days, memo) values (v_token, 'admin', 0, nullif(p_days, 0), '손으로 주기');
  return json_build_object('ok', true, 'until', v_until);
end $$;

create or replace function public.pr_admin_gift_make(p_secret text, p_days int, p_count int, p_max_uses int default 1, p_note text default '', p_expires timestamptz default null)
returns json language plpgsql volatile security definer set search_path = public as $$
declare A text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; out text[] := '{}'; k text; i int; j int; b bytea;
begin
  if not pr_ok(p_secret) then raise exception 'denied'; end if;
  for i in 1..least(greatest(coalesce(p_count, 1), 1), 100) loop
    loop
      b := decode(md5(gen_random_uuid()::text), 'hex'); k := '';
      for j in 0..11 loop
        k := k || substr(A, 1 + (get_byte(b, j) % 32), 1);
        if j in (3, 7) then k := k || '-'; end if;
      end loop;
      exit when not exists (select 1 from pr_gifts where key = k);
    end loop;
    insert into pr_gifts(key, days, max_uses, note, expires_at)
    values (k, nullif(p_days, 0), greatest(coalesce(p_max_uses, 1), 1), left(coalesce(p_note, ''), 60), p_expires);
    out := out || k;
  end loop;
  return to_json(out);
end $$;

create or replace function public.pr_admin_gifts(p_secret text)
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not pr_ok(p_secret) then raise exception 'denied'; end if;
  return (select coalesce(json_agg(g order by g.created_at desc), '[]') from (select key, days, max_uses, used, note, expires_at, created_at from pr_gifts order by created_at desc limit 200) g);
end $$;

create or replace function public.pr_admin_gift_del(p_secret text, p_key text)
returns boolean language plpgsql volatile security definer set search_path = public as $$
begin
  if not pr_ok(p_secret) then raise exception 'denied'; end if;
  delete from pr_gifts where key = p_key and used = 0;
  return found;
end $$;

-- ── 카드 결제 반영 (Edge Function prompter-billing 만 부름: service_role) ──
-- 첫 결제·매달 청구가 성공했을 때. 같은 paymentId가 두 번 와도 한 번만 늘림
create or replace function public.pr_card_paid(p_token text, p_payment_id text, p_amount int, p_days int, p_billing_key text default null, p_card_label text default null)
returns json language plpgsql volatile security definer set search_path = public as $$
declare v_until timestamptz;
begin
  if exists (select 1 from pr_payments where ext_id = p_payment_id) then return json_build_object('ok', true, 'dup', true); end if;
  insert into pr_payments(token, method, amount, ext_id, status, days) values (p_token, 'card', p_amount, p_payment_id, 'paid', p_days);
  v_until := pr_extend(p_token, p_days);
  if p_billing_key is not null then
    insert into pr_billing(token, billing_key, card_label, amount, status, next_at, fail_count)
    values (p_token, p_billing_key, coalesce(p_card_label, ''), p_amount, 'active', v_until, 0)
    on conflict (token) do update set billing_key = excluded.billing_key, card_label = excluded.card_label, amount = excluded.amount,
      status = 'active', next_at = excluded.next_at, fail_count = 0, updated_at = now();
  else
    update pr_billing set next_at = v_until, fail_count = 0, status = 'active', updated_at = now() where token = p_token and status <> 'canceled';
  end if;
  return json_build_object('ok', true, 'paid_until', v_until);
end $$;

-- 청구 실패: 3일 뒤 다시, 3번 실패하면 failed
create or replace function public.pr_card_failed(p_token text, p_payment_id text, p_reason text default '')
returns json language plpgsql volatile security definer set search_path = public as $$
declare b pr_billing;
begin
  insert into pr_payments(token, method, amount, ext_id, status, memo) values (p_token, 'card', 0, p_payment_id, 'failed', left(coalesce(p_reason, ''), 200))
  on conflict (ext_id) do nothing;
  update pr_billing set fail_count = fail_count + 1, next_at = now() + interval '3 days',
    status = case when fail_count + 1 >= 3 then 'failed' else status end, updated_at = now()
  where token = p_token returning * into b;
  return json_build_object('ok', true, 'status', b.status, 'fail_count', b.fail_count);
end $$;

-- 오늘 청구할 것 (빌링키 포함이라 service_role 전용)
create or replace function public.pr_card_due()
returns table(token text, billing_key text, amount int)
language sql stable security definer set search_path = public as $$
  select b.token, b.billing_key, b.amount from pr_billing b where b.status = 'active' and b.next_at <= now() order by b.next_at limit 200;
$$;

-- 권한: 손님·관리 함수만 공개, 결제 반영 함수는 service_role 전용
revoke all on function public.pr_extend(text, int), public.pr_ok(text), public.pr_join(), public.pr_me(text), public.pr_card_cancel(text), public.pr_redeem(text, text),
  public.pr_admin(text), public.pr_admin_grant(text, text, int), public.pr_admin_gift_make(text, int, int, int, text, timestamptz), public.pr_admin_gifts(text), public.pr_admin_gift_del(text, text),
  public.pr_card_paid(text, text, int, int, text, text), public.pr_card_failed(text, text, text), public.pr_card_due() from public, anon, authenticated;
grant execute on function public.pr_join(), public.pr_me(text), public.pr_card_cancel(text), public.pr_redeem(text, text),
  public.pr_admin(text), public.pr_admin_grant(text, text, int), public.pr_admin_gift_make(text, int, int, int, text, timestamptz), public.pr_admin_gifts(text), public.pr_admin_gift_del(text, text) to anon, authenticated;
grant execute on function public.pr_card_paid(text, text, int, int, text, text), public.pr_card_failed(text, text, text), public.pr_card_due() to service_role;
