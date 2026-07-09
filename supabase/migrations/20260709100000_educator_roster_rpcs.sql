-- Educator/admin roster writers for the class "Students" tab.
--   educator_enroll_student_by_email  -- add a student by email (email -> user id is the one roster
--                                         step RLS cannot do; kick + roster-read use existing
--                                         class_enrollments RLS via the normal user client).
--   educator_move_student             -- atomically move a student between two of the caller's classes
--                                         (one transaction: never in both, never in neither).
-- Hand-authored (functions are not managed by supabase db diff); idempotent via CREATE OR REPLACE.
-- Bodies are byte-identical to supabase/schemas/01_functions.sql. Never put a /* */ comment here.

CREATE OR REPLACE FUNCTION public.educator_enroll_student_by_email(p_class_id UUID, p_email TEXT)
RETURNS TABLE (status TEXT, student_id UUID, student_name TEXT)
AS $$
DECLARE
    v_uid    UUID := (SELECT auth.uid());
    v_target UUID;
    v_role   public.user_role;
    v_name   TEXT;
    v_exists BOOLEAN;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'AUTH REQUIRED: Sign in to manage the roster.';
    END IF;

    IF NOT ((SELECT internal.is_admin()) OR (SELECT internal.is_class_educator(p_class_id))) THEN
        RAISE EXCEPTION 'Only the class educator or an admin may add students to this class.';
    END IF;

    SELECT u.id INTO v_target
    FROM auth.users u
    WHERE LOWER(u.email) = LOWER(TRIM(p_email))
    LIMIT 1;

    IF v_target IS NULL THEN
        RETURN QUERY SELECT 'not_found'::TEXT, NULL::UUID, NULL::TEXT;
        RETURN;
    END IF;

    SELECT p.role INTO v_role FROM public.profiles p WHERE p.id = v_target;

    IF v_role IS DISTINCT FROM 'student'::public.user_role THEN
        RETURN QUERY SELECT 'not_found'::TEXT, NULL::UUID, NULL::TEXT;
        RETURN;
    END IF;

    SELECT COALESCE(
             NULLIF(TRIM(COALESCE(pp.display_name, CONCAT_WS(' ', pp.first_name, pp.last_name))), ''),
             'Student')
    INTO v_name
    FROM public.profiles_public pp
    WHERE pp.id = v_target;

    SELECT EXISTS (
        SELECT 1 FROM public.class_enrollments ce
        WHERE ce.user_id = v_target AND ce.class_id = p_class_id
    ) INTO v_exists;

    IF v_exists THEN
        RETURN QUERY SELECT 'already_enrolled'::TEXT, v_target, v_name;
        RETURN;
    END IF;

    INSERT INTO public.class_enrollments (user_id, class_id)
    VALUES (v_target, p_class_id)
    ON CONFLICT (user_id, class_id) DO NOTHING;

    RETURN QUERY SELECT 'enrolled'::TEXT, v_target, v_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION public.educator_enroll_student_by_email(UUID, TEXT) IS 'Educator/admin roster writer: resolves an email to a student user id (a step the class educator cannot do under RLS, since they cannot read auth.users / other profiles) and enrolls them into the given class. SECURITY DEFINER bypasses the admin/educator-only insert policy on class_enrollments, like enroll_in_free_class. Authorizes the caller as admin OR the class educator (a true EXCEPTION otherwise). Missing user and non-student role are collapsed into a single not_found status so the class owner cannot probe for educator/admin account emails (a residual student-email oracle for the owner is accepted, matching the invite-preview trust surface). Deliberately skips the is_published / price_cents checks — an explicit educator grant for a possibly-draft class, like redeem_class_invite. Does NOT touch user_video_progress (keyed by user+video, not enrollment), so re-adding a student restores their prior progress view. Returns status (enrolled | already_enrolled | not_found), the student id, and their display name.';

REVOKE EXECUTE ON FUNCTION public.educator_enroll_student_by_email(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.educator_enroll_student_by_email(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.educator_move_student(p_student_id UUID, p_from_class_id UUID, p_to_class_id UUID)
RETURNS TEXT
AS $$
DECLARE
    v_uid UUID := (SELECT auth.uid());
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'AUTH REQUIRED: Sign in to manage the roster.';
    END IF;

    IF p_from_class_id = p_to_class_id THEN
        RAISE EXCEPTION 'Pick a different destination class.';
    END IF;

    IF NOT (
        (SELECT internal.is_admin())
        OR (
            (SELECT internal.is_class_educator(p_from_class_id))
            AND (SELECT internal.is_class_educator(p_to_class_id))
        )
    ) THEN
        RAISE EXCEPTION 'You must own both classes to move a student between them.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.class_enrollments
        WHERE user_id = p_student_id AND class_id = p_from_class_id
    ) THEN
        RETURN 'not_in_source';
    END IF;

    INSERT INTO public.class_enrollments (user_id, class_id)
    VALUES (p_student_id, p_to_class_id)
    ON CONFLICT (user_id, class_id) DO NOTHING;

    DELETE FROM public.class_enrollments
    WHERE user_id = p_student_id AND class_id = p_from_class_id;

    RETURN 'moved';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION public.educator_move_student(UUID, UUID, UUID) IS 'Atomically moves a student from one of the caller''s classes to another. Authorizes the caller as admin OR the educator of BOTH classes (a true EXCEPTION otherwise). The whole body runs in one transaction, so the dest INSERT (ON CONFLICT DO NOTHING) and source DELETE either both apply or neither does — the student is never left in both classes or in neither, unlike a two-round-trip insert+delete from the client. Returns not_in_source when the student is not enrolled in the source class (so Move never silently becomes an enroll of a stale/forged id), else moved. Does NOT touch user_video_progress (keyed by user+video), so progress survives the move.';

REVOKE EXECUTE ON FUNCTION public.educator_move_student(UUID, UUID, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.educator_move_student(UUID, UUID, UUID) TO authenticated;
