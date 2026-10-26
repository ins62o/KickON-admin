-- Ensure PostgREST sees the reply columns added to community_comment_feed.
notify pgrst, 'reload schema';
