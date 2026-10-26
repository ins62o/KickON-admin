-- RLS continues to restrict rows; these grants only expose the operations the
-- mobile comment repository performs (insert, returning id, and feed joins).
grant select on public.comments to authenticated;
grant insert (post_id, user_id, content, emoticon_key, parent_comment_id)
  on public.comments to authenticated;
