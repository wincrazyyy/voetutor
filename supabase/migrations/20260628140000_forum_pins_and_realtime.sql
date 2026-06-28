ALTER TABLE public.forum_posts ADD COLUMN is_pinned BOOLEAN DEFAULT FALSE NOT NULL;
COMMENT ON COLUMN public.forum_posts.is_pinned IS 'Educator/admin sticky flag. Pinned threads float to the top of the forum list across all sorts. Only the class educator or an admin may toggle it (internal.protect_forum_post_ownership guards it against the post author).';

CREATE OR REPLACE FUNCTION internal.protect_forum_post_ownership()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT internal.is_admin() THEN
        IF NEW.author_id IS DISTINCT FROM OLD.author_id THEN
            RAISE EXCEPTION 'SECURITY VIOLATION: Post authorship cannot be reassigned.';
        END IF;
        IF NEW.class_id IS DISTINCT FROM OLD.class_id THEN
            RAISE EXCEPTION 'SECURITY VIOLATION: Posts cannot be moved between classes.';
        END IF;
        IF NEW.is_pinned IS DISTINCT FROM OLD.is_pinned AND NOT internal.is_class_educator(OLD.class_id) THEN
            RAISE EXCEPTION 'SECURITY VIOLATION: Only the class educator or an admin can pin or unpin a thread.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION internal.protect_forum_post_ownership() IS 'Prevents users (incl. the post author) from tampering with a forum post''s authorship, class association, or pin state. The pin flag is reserved to the class educator (internal.is_class_educator) or an admin; authorship/class moves are admin-only.';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'forum_posts') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.forum_posts;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'forum_replies') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.forum_replies;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'forum_post_upvotes') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.forum_post_upvotes;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'forum_reply_upvotes') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.forum_reply_upvotes;
    END IF;
END $$;
