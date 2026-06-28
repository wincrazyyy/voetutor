CREATE TABLE public.announcement_reads (
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
    announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    PRIMARY KEY (user_id, announcement_id)
);
COMMENT ON TABLE public.announcement_reads IS 'Per-user read receipts for announcements. Composite PK ⇒ one receipt per user; no UPDATE policy ⇒ immutable. Unread = announcements in the user''s classes with no matching row here.';

CREATE INDEX idx_announcement_reads_announcement_id ON public.announcement_reads(announcement_id);

ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_reads FORCE ROW LEVEL SECURITY;

CREATE POLICY announcement_reads_select_self ON public.announcement_reads
    FOR SELECT TO authenticated
    USING ((SELECT internal.is_admin()) OR user_id = (SELECT auth.uid()));
COMMENT ON POLICY announcement_reads_select_self ON public.announcement_reads IS 'A user sees only their own read receipts (admins all). Drives the unread/"new" affordance.';

CREATE POLICY announcement_reads_insert_self ON public.announcement_reads
    FOR INSERT TO authenticated
    WITH CHECK (
        user_id = (SELECT auth.uid())
        AND EXISTS (
            SELECT 1 FROM public.announcements a
            WHERE a.id = announcement_reads.announcement_id AND a.class_id IN (SELECT internal.get_user_class_ids())
        )
    );
COMMENT ON POLICY announcement_reads_insert_self ON public.announcement_reads IS 'A user may mark an announcement read only for themselves and only if the announcement is in one of their classes. No UPDATE/DELETE policy ⇒ receipts are immutable.';
