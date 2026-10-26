-- Reuse identical submissions within one minute, including concurrent retries.
CREATE OR REPLACE FUNCTION public.create_support_inquiry(inquiry_category text, inquiry_subject text, inquiry_content text)
 RETURNS support_inquiries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- Serialize a user's submissions before deduplication and the hourly limit.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 609060013));
  select * into created_inquiry
  from public.support_inquiries inquiry
  where inquiry.user_id = auth.uid()
    and inquiry.category = inquiry_category
    and inquiry.subject = normalized_subject
    and inquiry.content = normalized_content
    and inquiry.created_at > now() - interval '1 minute'
  order by inquiry.created_at desc
  limit 1;
  if found then
    return created_inquiry;
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
$function$
;
