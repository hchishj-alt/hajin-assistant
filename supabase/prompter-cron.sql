-- 프롬프리에딧 매달 자동결제: 매일 한국 시간 오전 10시에 Edge Function /charge-due 를 부름.
-- 먼저 할 것(하진): 아래 한 줄의 '여기에_CRON_SECRET' 을 Edge Function 비밀 CRON_SECRET 과 같은 값으로 바꿔 한 번만 실행.
--   select vault.create_secret('여기에_CRON_SECRET', 'prompter_cron_secret');
-- 비밀 값은 저장소·채팅에 적지 않는다. 이 파일에는 이름만 있다.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('prompter-charge-due') where exists (select 1 from cron.job where jobname = 'prompter-charge-due');
select cron.schedule('prompter-charge-due', '0 1 * * *', $$
  select net.http_post(
    url := 'https://wuvqtfvvouweqxbydlqa.supabase.co/functions/v1/prompter-billing/charge-due',
    headers := jsonb_build_object('content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'prompter_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000);
$$);
