alter table public.content_reports
  drop constraint if exists content_reports_target_type_check;
alter table public.content_reports
  add constraint content_reports_target_type_check
  check (target_type in ('POST', 'COMMENT', 'FIXTURE_CHEER'));

alter table public.content_reports
  add column comment_id uuid references public.comments(id) on delete cascade;

alter table public.content_reports
  drop constraint content_reports_single_target_check;
alter table public.content_reports
  add constraint content_reports_single_target_check check (
    (
      target_type = 'POST'
      and post_id is not null
      and comment_id is null
      and cheer_message_id is null
    )
    or
    (
      target_type = 'COMMENT'
      and post_id is null
      and comment_id is not null
      and cheer_message_id is null
    )
    or
    (
      target_type = 'FIXTURE_CHEER'
      and post_id is null
      and comment_id is null
      and cheer_message_id is not null
    )
  );

create unique index content_reports_reporter_comment_unique
  on public.content_reports (reporter_user_id, comment_id)
  where comment_id is not null;

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

  if report_target_type not in ('POST', 'COMMENT', 'FIXTURE_CHEER') then
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
    select author_id into target_author_id
    from public.posts
    where id = report_target_id;
  elsif report_target_type = 'COMMENT' then
    select user_id into target_author_id
    from public.comments
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
      or (report_target_type = 'COMMENT' and comment_id = report_target_id)
      or (
        report_target_type = 'FIXTURE_CHEER'
        and cheer_message_id = report_target_id
      )
    );
  if existing_report_id is not null then
    return existing_report_id;
  end if;

  insert into public.content_reports (
    reporter_user_id,
    target_type,
    post_id,
    comment_id,
    cheer_message_id,
    reason,
    details
  ) values (
    auth.uid(),
    report_target_type,
    case when report_target_type = 'POST' then report_target_id end,
    case when report_target_type = 'COMMENT' then report_target_id end,
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

comment on column public.content_reports.comment_id is
  'Reported community comment. Exactly one report target is populated.';
