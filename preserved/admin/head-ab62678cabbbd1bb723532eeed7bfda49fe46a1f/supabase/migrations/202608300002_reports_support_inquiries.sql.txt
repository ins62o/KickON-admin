create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('POST', 'FIXTURE_CHEER')),
  post_id uuid references public.posts(id) on delete cascade,
  cheer_message_id uuid references public.fixture_cheer_messages(id) on delete cascade,
  reason text not null check (
    reason in ('SPAM', 'ABUSE', 'HATE', 'PRIVACY', 'INAPPROPRIATE', 'OTHER')
  ),
  details text check (details is null or char_length(details) <= 500),
  status text not null default 'OPEN'
    check (status in ('OPEN', 'REVIEWED', 'RESOLVED', 'DISMISSED')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint content_reports_single_target_check check (
    (target_type = 'POST' and post_id is not null and cheer_message_id is null)
    or
    (target_type = 'FIXTURE_CHEER' and cheer_message_id is not null and post_id is null)
  )
);

create unique index content_reports_reporter_post_unique
  on public.content_reports (reporter_user_id, post_id)
  where post_id is not null;
create unique index content_reports_reporter_cheer_unique
  on public.content_reports (reporter_user_id, cheer_message_id)
  where cheer_message_id is not null;
create index content_reports_status_created_idx
  on public.content_reports (status, created_at);

alter table public.content_reports enable row level security;
revoke all on public.content_reports from anon, authenticated;

create or replace function public.report_content(
  report_target_type text,
  report_target_id uuid,
  report_reason text,
  report_details text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_author_id uuid;
  existing_report_id uuid;
  created_report_id uuid;
  normalized_details text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if report_target_type not in ('POST', 'FIXTURE_CHEER') then
    raise exception 'INVALID_REPORT_TARGET';
  end if;
  if report_reason not in (
    'SPAM', 'ABUSE', 'HATE', 'PRIVACY', 'INAPPROPRIATE', 'OTHER'
  ) then
    raise exception 'INVALID_REPORT_REASON';
  end if;

  normalized_details := nullif(trim(coalesce(report_details, '')), '');
  if normalized_details is not null and char_length(normalized_details) > 500 then
    raise exception 'REPORT_DETAILS_TOO_LONG';
  end if;

  if report_target_type = 'POST' then
    select user_id into target_author_id
    from public.posts
    where id = report_target_id;
  else
    select user_id into target_author_id
    from public.fixture_cheer_messages
    where id = report_target_id;
  end if;

  if target_author_id is null then
    raise exception 'REPORT_TARGET_NOT_FOUND';
  end if;
  if target_author_id = auth.uid() then
    raise exception 'CANNOT_REPORT_OWN_CONTENT';
  end if;

  select id into existing_report_id
  from public.content_reports
  where reporter_user_id = auth.uid()
    and (
      (report_target_type = 'POST' and post_id = report_target_id)
      or
      (report_target_type = 'FIXTURE_CHEER' and cheer_message_id = report_target_id)
    );
  if existing_report_id is not null then
    return existing_report_id;
  end if;

  insert into public.content_reports (
    reporter_user_id,
    target_type,
    post_id,
    cheer_message_id,
    reason,
    details
  ) values (
    auth.uid(),
    report_target_type,
    case when report_target_type = 'POST' then report_target_id end,
    case when report_target_type = 'FIXTURE_CHEER' then report_target_id end,
    report_reason,
    normalized_details
  ) returning id into created_report_id;

  return created_report_id;
end;
$$;

revoke all on function public.report_content(text, uuid, text, text)
  from public, anon;
grant execute on function public.report_content(text, uuid, text, text)
  to authenticated;

create table public.support_inquiries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (
    category in (
      'APP_ERROR', 'DATA_ERROR', 'ACCOUNT', 'NOTIFICATION',
      'ATTENDANCE', 'COMMUNITY', 'SUGGESTION', 'OTHER'
    )
  ),
  subject text not null check (char_length(trim(subject)) between 2 and 100),
  content text not null check (char_length(trim(content)) between 10 and 2000),
  status text not null default 'RECEIVED'
    check (status in ('RECEIVED', 'IN_PROGRESS', 'ANSWERED', 'CLOSED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  answered_at timestamptz
);

create index support_inquiries_user_created_idx
  on public.support_inquiries (user_id, created_at desc);
create index support_inquiries_status_created_idx
  on public.support_inquiries (status, created_at);

alter table public.support_inquiries enable row level security;
grant select on public.support_inquiries to authenticated;
create policy "users read own support inquiries"
  on public.support_inquiries for select
  to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.create_support_inquiry(
  inquiry_category text,
  inquiry_subject text,
  inquiry_content text
)
returns public.support_inquiries
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_subject text;
  normalized_content text;
  created_inquiry public.support_inquiries;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if inquiry_category not in (
    'APP_ERROR', 'DATA_ERROR', 'ACCOUNT', 'NOTIFICATION',
    'ATTENDANCE', 'COMMUNITY', 'SUGGESTION', 'OTHER'
  ) then
    raise exception 'INVALID_INQUIRY_CATEGORY';
  end if;

  normalized_subject := trim(coalesce(inquiry_subject, ''));
  normalized_content := trim(coalesce(inquiry_content, ''));
  if char_length(normalized_subject) not between 2 and 100 then
    raise exception 'INVALID_INQUIRY_SUBJECT';
  end if;
  if char_length(normalized_content) not between 10 and 2000 then
    raise exception 'INVALID_INQUIRY_CONTENT';
  end if;

  if (
    select count(*)
    from public.support_inquiries recent
    where recent.user_id = auth.uid()
      and recent.created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'INQUIRY_RATE_LIMITED';
  end if;

  insert into public.support_inquiries (
    user_id,
    category,
    subject,
    content
  ) values (
    auth.uid(),
    inquiry_category,
    normalized_subject,
    normalized_content
  ) returning * into created_inquiry;

  return created_inquiry;
end;
$$;

revoke all on function public.create_support_inquiry(text, text, text)
  from public, anon;
grant execute on function public.create_support_inquiry(text, text, text)
  to authenticated;
