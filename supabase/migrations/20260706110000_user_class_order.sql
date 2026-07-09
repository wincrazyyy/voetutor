/* Per-user sidebar class ordering (enrolled students AND teaching educators).
   Mirrors supabase/schemas/02_schema.sql + 03_rls.sql; idempotent. */

CREATE TABLE IF NOT EXISTS public.user_class_order (
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE ON UPDATE CASCADE,
    position INTEGER NOT NULL CHECK (position >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    PRIMARY KEY (user_id, class_id)
);
COMMENT ON TABLE public.user_class_order IS 'Per-user preferred ordering of the sidebar class list (enrolled students AND teaching educators). Separate from the immutable class_enrollments so ordering stays mutable and role-agnostic; consumed only by the sidebar, never the marketplace.';
COMMENT ON COLUMN public.user_class_order.position IS 'Zero-based sort key for the caller''s sidebar class list; classes lacking a row sort after positioned ones in their natural order.';

CREATE INDEX IF NOT EXISTS idx_user_class_order_class_id ON public.user_class_order(class_id);

DROP TRIGGER IF EXISTS set_user_class_order_updated_at ON public.user_class_order;
CREATE TRIGGER set_user_class_order_updated_at
    BEFORE UPDATE ON public.user_class_order
    FOR EACH ROW EXECUTE PROCEDURE internal.set_current_timestamp_updated_at();

ALTER TABLE public.user_class_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_class_order FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_class_order_select_self ON public.user_class_order;
CREATE POLICY user_class_order_select_self ON public.user_class_order
    FOR SELECT TO authenticated
    USING ((SELECT internal.is_admin()) OR user_id = (SELECT auth.uid()));
COMMENT ON POLICY user_class_order_select_self ON public.user_class_order IS 'A user reads only their own sidebar ordering (admins all).';

DROP POLICY IF EXISTS user_class_order_insert_self ON public.user_class_order;
CREATE POLICY user_class_order_insert_self ON public.user_class_order
    FOR INSERT TO authenticated
    WITH CHECK (
        user_id = (SELECT auth.uid())
        AND class_id IN (SELECT internal.get_user_class_ids())
    );
COMMENT ON POLICY user_class_order_insert_self ON public.user_class_order IS 'A user may position only their own rows, and only for a class they are enrolled in or teach (internal.get_user_class_ids covers both roles).';

DROP POLICY IF EXISTS user_class_order_update_self ON public.user_class_order;
CREATE POLICY user_class_order_update_self ON public.user_class_order
    FOR UPDATE TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (
        user_id = (SELECT auth.uid())
        AND class_id IN (SELECT internal.get_user_class_ids())
    );
COMMENT ON POLICY user_class_order_update_self ON public.user_class_order IS 'A user may reorder only their own rows, still bound to a class they are enrolled in or teach.';

DROP POLICY IF EXISTS user_class_order_delete_self ON public.user_class_order;
CREATE POLICY user_class_order_delete_self ON public.user_class_order
    FOR DELETE TO authenticated
    USING (user_id = (SELECT auth.uid()));
COMMENT ON POLICY user_class_order_delete_self ON public.user_class_order IS 'A user may drop only their own ordering rows.';
