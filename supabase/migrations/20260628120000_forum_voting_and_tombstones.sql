CREATE OR REPLACE FUNCTION internal.set_forum_reply_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION internal.set_forum_reply_updated_at() IS 'Reply analogue of set_forum_post_updated_at. Skips the timestamp bump when fired inside a nested trigger chain (the forum_reply_upvotes ledger maintenance), so comment endorsements never mark a reply as edited. User-issued content edits and soft-deletes arrive at depth 1 and bump updated_at.';

CREATE OR REPLACE FUNCTION internal.maintain_forum_reply_upvote_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.forum_replies SET upvotes = upvotes + 1 WHERE id = NEW.reply_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.forum_replies SET upvotes = GREATEST(upvotes - 1, 0) WHERE id = OLD.reply_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION internal.maintain_forum_reply_upvote_count() IS 'Reply analogue of maintain_forum_post_upvote_count. Keeps forum_replies.upvotes in lockstep with the forum_reply_upvotes ledger. SECURITY DEFINER (empty search_path, fully-qualified references) so the upvoter can mutate the counter despite forum_replies RLS.';

CREATE OR REPLACE FUNCTION internal.protect_forum_reply_upvotes()
RETURNS TRIGGER AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    IF NEW.upvotes IS DISTINCT FROM OLD.upvotes AND NOT internal.is_admin() THEN
        RAISE EXCEPTION 'SECURITY VIOLATION: Direct manipulation of reply upvote counts is prohibited. Insert into forum_reply_upvotes instead.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION internal.protect_forum_reply_upvotes() IS 'Reply analogue of protect_forum_post_upvotes. Hard-rejects direct UPDATEs to the denormalized forum_replies.upvotes column by non-admins; legitimate changes flow through the forum_reply_upvotes ledger and are detected via pg_trigger_depth().';

CREATE OR REPLACE FUNCTION internal.protect_forum_reply_integrity()
RETURNS TRIGGER AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;
    IF NOT internal.is_admin() THEN
        IF NEW.author_id IS DISTINCT FROM OLD.author_id THEN
            RAISE EXCEPTION 'SECURITY VIOLATION: Reply authorship cannot be reassigned.';
        END IF;
        IF NEW.post_id IS DISTINCT FROM OLD.post_id OR NEW.parent_reply_id IS DISTINCT FROM OLD.parent_reply_id THEN
            RAISE EXCEPTION 'SECURITY VIOLATION: Replies cannot be moved between threads.';
        END IF;
        IF NEW.content IS DISTINCT FROM OLD.content
           AND OLD.author_id <> auth.uid()
           AND NOT (OLD.is_deleted = FALSE AND NEW.is_deleted = TRUE) THEN
            RAISE EXCEPTION 'SECURITY VIOLATION: Only the author may edit a reply (moderators may only remove it).';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION internal.protect_forum_reply_integrity() IS 'Anti-tampering guard for forum_replies UPDATEs. Non-admins cannot reassign authorship or move a reply to another thread/parent, and may not rewrite a body that is not their own — except a class educator (or the author) may blank the content while tombstoning it (is_deleted false -> true), which backs the soft-delete moderation path. Depth-guarded so the upvote-ledger maintenance write passes.';

ALTER TABLE public.forum_replies ADD COLUMN upvotes INTEGER DEFAULT 0 NOT NULL CHECK (upvotes >= 0);
ALTER TABLE public.forum_replies ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE NOT NULL;
COMMENT ON COLUMN public.forum_replies.upvotes IS 'Denormalized endorsement counter fed by the forum_reply_upvotes ledger via internal.maintain_forum_reply_upvote_count. Never written directly by non-admins (internal.protect_forum_reply_upvotes guards it).';
COMMENT ON COLUMN public.forum_replies.is_deleted IS 'Soft-delete tombstone. A deleted reply that still has children is flagged here (content blanked in the UI as "[deleted]") so the comment tree below it survives; leaf replies are hard-deleted instead.';

DROP TRIGGER IF EXISTS set_forum_replies_updated_at ON public.forum_replies;
CREATE TRIGGER set_forum_replies_updated_at
    BEFORE UPDATE ON public.forum_replies
    FOR EACH ROW EXECUTE PROCEDURE internal.set_forum_reply_updated_at();

CREATE TRIGGER enforce_reply_upvote_count_integrity BEFORE UPDATE ON public.forum_replies FOR EACH ROW EXECUTE PROCEDURE internal.protect_forum_reply_upvotes();
CREATE TRIGGER enforce_forum_reply_security BEFORE UPDATE ON public.forum_replies FOR EACH ROW EXECUTE PROCEDURE internal.protect_forum_reply_integrity();

CREATE TABLE public.forum_reply_upvotes (
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
    reply_id UUID NOT NULL REFERENCES public.forum_replies(id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    PRIMARY KEY (user_id, reply_id)
);
COMMENT ON TABLE public.forum_reply_upvotes IS 'Reply analogue of forum_post_upvotes. One-vote-per-user ledger (composite primary key) feeding the denormalized forum_replies.upvotes counter.';

CREATE INDEX idx_forum_reply_upvotes_reply_id ON public.forum_reply_upvotes(reply_id);

CREATE TRIGGER maintain_reply_upvote_count_on_insert
    AFTER INSERT ON public.forum_reply_upvotes
    FOR EACH ROW EXECUTE PROCEDURE internal.maintain_forum_reply_upvote_count();

CREATE TRIGGER maintain_reply_upvote_count_on_delete
    AFTER DELETE ON public.forum_reply_upvotes
    FOR EACH ROW EXECUTE PROCEDURE internal.maintain_forum_reply_upvote_count();

ALTER TABLE public.forum_reply_upvotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_reply_upvotes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS forum_replies_update_author ON public.forum_replies;
CREATE POLICY forum_replies_update_authorized ON public.forum_replies
    FOR UPDATE TO authenticated
    USING (
        (SELECT internal.is_admin())
        OR author_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.forum_posts fp
            JOIN public.classes c ON c.id = fp.class_id
            WHERE fp.id = forum_replies.post_id AND c.educator_id = (SELECT auth.uid())
        )
    );
COMMENT ON POLICY forum_replies_update_authorized ON public.forum_replies IS 'Authors edit their own replies; class educators and admins may UPDATE to moderate. internal.protect_forum_reply_integrity restricts what each role can change — educators can only tombstone (set is_deleted + blank content), never rewrite a member''s words.';

CREATE POLICY forum_reply_upvotes_select_authorized ON public.forum_reply_upvotes
    FOR SELECT TO authenticated
    USING (
        (SELECT internal.is_admin())
        OR EXISTS (
            SELECT 1 FROM public.forum_replies fr
            JOIN public.forum_posts fp ON fp.id = fr.post_id
            WHERE fr.id = forum_reply_upvotes.reply_id AND fp.class_id IN (SELECT internal.get_user_class_ids())
        )
    );
COMMENT ON POLICY forum_reply_upvotes_select_authorized ON public.forum_reply_upvotes IS 'Mirrors reply visibility — endorsements are visible only to users authorised to access the parent post''s class context.';

CREATE POLICY forum_reply_upvotes_insert_self ON public.forum_reply_upvotes
    FOR INSERT TO authenticated
    WITH CHECK (
        user_id = (SELECT auth.uid())
        AND EXISTS (
            SELECT 1 FROM public.forum_replies fr
            JOIN public.forum_posts fp ON fp.id = fr.post_id
            WHERE fr.id = forum_reply_upvotes.reply_id AND fp.class_id IN (SELECT internal.get_user_class_ids())
        )
    );
COMMENT ON POLICY forum_reply_upvotes_insert_self ON public.forum_reply_upvotes IS 'Permits a user to register a single endorsement against a reply within their authorisation perimeter. The composite primary key structurally prevents duplicate votes.';

CREATE POLICY forum_reply_upvotes_delete_self ON public.forum_reply_upvotes
    FOR DELETE TO authenticated
    USING ((SELECT internal.is_admin()) OR user_id = (SELECT auth.uid()));
COMMENT ON POLICY forum_reply_upvotes_delete_self ON public.forum_reply_upvotes IS 'Permits self-rescission of a reply endorsement, alongside administrative override for moderation.';
