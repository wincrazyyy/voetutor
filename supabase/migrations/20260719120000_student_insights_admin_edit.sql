CREATE OR REPLACE FUNCTION public.get_class_student_detail(p_class_id UUID, p_student_id UUID)
RETURNS TABLE (
    student_id UUID,
    first_name TEXT,
    last_name TEXT,
    display_name TEXT,
    avatar_url TEXT,
    whatsapp_number TEXT,
    school TEXT,
    school_year TEXT,
    target_grade TEXT,
    account_created_at TIMESTAMPTZ,
    enrolled_at TIMESTAMPTZ,
    access_scope public.enrollment_access,
    enrolled_class_count INTEGER
) AS $$
DECLARE
    v_uid UUID := (SELECT auth.uid());
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'AUTH REQUIRED: Sign in to view student details.';
    END IF;

    IF NOT ((SELECT internal.is_admin()) OR (SELECT internal.is_class_educator(p_class_id))) THEN
        RAISE EXCEPTION 'Only the class educator or an admin may view student details.';
    END IF;

    RETURN QUERY
    SELECT
        p.id,
        p.first_name,
        p.last_name,
        p.display_name,
        p.avatar_url,
        sp.whatsapp_number,
        sp.school,
        sp.school_year,
        sp.target_grade,
        p.created_at,
        ce.enrolled_at,
        ce.access_scope,
        (SELECT COUNT(*)::INTEGER FROM public.class_enrollments c2 WHERE c2.user_id = p.id)
    FROM public.class_enrollments ce
    JOIN public.profiles p ON p.id = ce.user_id
    LEFT JOIN public.student_profiles sp ON sp.student_id = p.id
    WHERE ce.class_id = p_class_id
      AND ce.user_id = p_student_id
      AND p.role = 'student'::public.user_role;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION public.get_class_student_detail(UUID, UUID) IS 'Educator/admin read boundary for one enrolled student''s profile: the caller must be an admin OR the educator of p_class_id, AND the target must be a student currently enrolled in that exact class (zero rows otherwise — an educator can never probe arbitrary accounts). Returns profile identity + the student_profiles enrolment fields (whatsapp / school / school year / target grade), the platform join date, this class''s enrolled_at + access_scope, and an identity-free count of the student''s total enrollments. Deliberately NO email column (matching the educator_enroll_student_by_email no-oracle design) and no other-class identities. The WHERE clause plus the column list ARE the boundary; base-table RLS on student_profiles stays self-or-admin.';

REVOKE EXECUTE ON FUNCTION public.get_class_student_detail(UUID, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_class_student_detail(UUID, UUID) TO authenticated;

CREATE POLICY student_profiles_update_admin ON student_profiles
    FOR UPDATE TO authenticated
    USING ((SELECT internal.is_admin()))
    WITH CHECK ((SELECT internal.is_admin()));
COMMENT ON POLICY student_profiles_update_admin ON student_profiles IS 'Admins may moderate any student''s enrolment details from the admin students console (adminUpdateStudentProfileAction). Separate permissive policy alongside student_profiles_update_self — a non-admin never satisfies is_admin(), so this widens nothing for them. student_id and created_at stay locked by prevent_student_profile_modifications.';

CREATE POLICY student_profiles_insert_admin ON student_profiles
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT internal.is_admin()));
COMMENT ON POLICY student_profiles_insert_admin ON student_profiles IS 'Backs the admin-side upsert for students who have no sidecar row yet (pre-sidecar accounts). The action verifies the TARGET row belongs to a student before writing, mirroring the adminSaveEducatorProfileAction convention; the PK prevents duplicates.';

CREATE POLICY announcement_reads_select_class_educator ON announcement_reads
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.announcements a
            WHERE a.id = announcement_reads.announcement_id
              AND (SELECT internal.is_class_educator(a.class_id))
        )
    );
COMMENT ON POLICY announcement_reads_select_class_educator ON announcement_reads IS 'The class educator may read receipts for announcements of classes they teach — the per-student announcement-read ratio on the student insight page. Receipts for other classes stay invisible; admins already read everything via announcement_reads_select_self. Separate permissive SELECT policy; the insert-self-only / no-UPDATE immutability of receipts is unchanged.';
