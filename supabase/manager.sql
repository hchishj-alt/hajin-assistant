-- 매니저(인스타·틱톡) 계정용 표. Supabase SQL Editor에서 한 번 실행. 여러 번 실행해도 안전.
-- mg_data: 계정마다 기기 기록 백업 한 줄 / mg_subs: 구독 기간(결제 서버만 씀) / mg_delete_me: 탈퇴

create table if not exists public.mg_data (
  owner uuid primary key default auth.uid() references auth.users on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.mg_data enable row level security;
drop policy if exists mg_data_own on public.mg_data;
create policy mg_data_own on public.mg_data for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

create table if not exists public.mg_subs (
  owner uuid primary key references auth.users on delete cascade,
  plan text not null default 'pro',
  paid_until timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.mg_subs enable row level security;
drop policy if exists mg_subs_read on public.mg_subs;
create policy mg_subs_read on public.mg_subs for select to authenticated using (owner = auth.uid());
-- 쓰기 정책은 없음: 결제 확인 서버(service role)만 기간을 넣음

create or replace function public.mg_delete_me() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  -- 비서 앱 멤버 계정은 여기서 지우지 않음
  if exists (select 1 from public.members where user_id = auth.uid()) then raise exception '이 계정은 여기서 지울 수 없어요'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.mg_delete_me() from public, anon;
grant execute on function public.mg_delete_me() to authenticated;
