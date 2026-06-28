-- ============================================================================
-- Narrows — per-user write rate limits (anti-spam)
-- Run in Supabase → SQL Editor. Safe to re-run (drops triggers first).
--
-- Supabase rate-limits AUTH endpoints, but not your table writes. A logged-in
-- token could otherwise spam posts/comments/pins. These BEFORE INSERT triggers
-- reject a write if the same user inserted too recently.
-- ============================================================================

-- One reusable function. The trigger passes the minimum gap (in seconds) as an
-- argument, e.g. ('10') = at most one insert per 10 seconds per user.
create or replace function public.enforce_rate_limit()
returns trigger
language plpgsql
security definer            -- counts the user's rows regardless of RLS
set search_path = public
as $$
declare
  min_seconds int := (tg_argv[0])::int;
  recent_count int;
begin
  execute format(
    'select count(*) from %I.%I where user_id = $1 and created_at > now() - make_interval(secs => $2)',
    tg_table_schema, tg_table_name
  )
  into recent_count
  using new.user_id, min_seconds;

  if recent_count >= 1 then
    raise exception 'Please wait a few seconds before posting again.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- posts: 1 per 10s
drop trigger if exists posts_rate_limit on public.posts;
create trigger posts_rate_limit
  before insert on public.posts
  for each row execute function public.enforce_rate_limit('10');

-- comments: 1 per 5s (comments are lighter, allow a bit faster)
drop trigger if exists comments_rate_limit on public.comments;
create trigger comments_rate_limit
  before insert on public.comments
  for each row execute function public.enforce_rate_limit('5');

-- catch_pins: 1 per 10s
drop trigger if exists catch_pins_rate_limit on public.catch_pins;
create trigger catch_pins_rate_limit
  before insert on public.catch_pins
  for each row execute function public.enforce_rate_limit('10');
