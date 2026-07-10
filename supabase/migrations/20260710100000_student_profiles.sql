/* Student enrolment details sidecar (see plans student-registration-fields).
   Adds public.student_profiles (1:1 with profiles, students only) holding whatsapp_number, school,
   school_year, courses, target_grade — collected at sign-up and self-editable in Settings. Extends
   internal.handle_new_user to seed the row from signup metadata for students. Mirrors the
   educator_profiles sidecar pattern. Hand-authored to stay byte-identical to the declarative schema. */

CREATE TABLE public.student_profiles (
    student_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
    whatsapp_number TEXT CHECK (whatsapp_number IS NULL OR char_length(whatsapp_number) <= 50),
    school TEXT CHECK (school IS NULL OR char_length(school) <= 200),
    school_year TEXT CHECK (school_year IS NULL OR char_length(school_year) <= 60),
    courses TEXT CHECK (courses IS NULL OR char_length(courses) <= 1000),
    target_grade TEXT CHECK (target_grade IS NULL OR char_length(target_grade) <= 100),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
COMMENT ON TABLE public.student_profiles IS 'Optional 1:1 sidecar to profiles holding enrolment details that only students care about — WhatsApp number, school, school year, courses being studied, and target grade. Collected at sign-up (handle_new_user inserts the row from signup metadata) and self-editable in Settings. All columns are nullable so the row survives partial completion and pre-feature students who backfill later. Mirrors the educator_profiles sidecar shape.';
COMMENT ON COLUMN public.student_profiles.courses IS 'Free-text list of the courses/subjects the student is studying (e.g. "Math AA HL, Physics HL, Economics SL"). Not the platform class enrolments (those live in class_enrollments).';
COMMENT ON COLUMN public.student_profiles.target_grade IS 'Free-text goal grade the student is aiming for (e.g. "7", "40/45", "A*").';

CREATE OR REPLACE FUNCTION internal.prevent_student_profile_modifications()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.student_id IS DISTINCT FROM OLD.student_id THEN
        RAISE EXCEPTION 'SECURITY VIOLATION: student_id (PK) modifications are strictly prohibited.';
    END IF;
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'SECURITY VIOLATION: created_at timestamp modifications are strictly prohibited.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION internal.prevent_student_profile_modifications() IS 'Variant of prevent_immutable_modifications scoped to student_profiles (PK is student_id, not the conventional id column). Locks student_id and created_at against post-insert mutation; the student_profiles_update_self RLS WITH CHECK clause separately prevents row redirection.';

CREATE OR REPLACE FUNCTION internal.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_intended TEXT := NEW.raw_user_meta_data->>'intended_role';
    v_role public.user_role;
    v_is_approved BOOLEAN;
BEGIN
    IF v_intended = 'educator' THEN
        v_role := 'educator'::public.user_role;
        v_is_approved := FALSE;
    ELSE
        v_role := 'student'::public.user_role;
        v_is_approved := TRUE;
    END IF;

    INSERT INTO public.profiles (id, first_name, last_name, display_name, role, is_approved)
    VALUES (
        NEW.id,
        NEW.raw_user_meta_data->>'first_name',
        NEW.raw_user_meta_data->>'last_name',
        NEW.raw_user_meta_data->>'display_name',
        v_role,
        v_is_approved
    );

    /* Students provide extra enrollment details at sign-up (passed in signup metadata); persist them
       into the sidecar. Values are truncated to the column caps so an oversized metadata payload can
       never abort account creation, and blanks collapse to NULL. */
    IF v_role = 'student'::public.user_role THEN
        INSERT INTO public.student_profiles (
            student_id, whatsapp_number, school, school_year, courses, target_grade
        )
        VALUES (
            NEW.id,
            LEFT(NULLIF(NEW.raw_user_meta_data->>'whatsapp_number', ''), 50),
            LEFT(NULLIF(NEW.raw_user_meta_data->>'school', ''), 200),
            LEFT(NULLIF(NEW.raw_user_meta_data->>'school_year', ''), 60),
            LEFT(NULLIF(NEW.raw_user_meta_data->>'courses', ''), 1000),
            LEFT(NULLIF(NEW.raw_user_meta_data->>'target_grade', ''), 100)
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE TRIGGER set_student_profiles_updated_at
    BEFORE UPDATE ON public.student_profiles
    FOR EACH ROW EXECUTE PROCEDURE internal.set_current_timestamp_updated_at();

CREATE TRIGGER enforce_immutability_student_profiles
    BEFORE UPDATE ON public.student_profiles
    FOR EACH ROW EXECUTE PROCEDURE internal.prevent_student_profile_modifications();

ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_profiles FORCE ROW LEVEL SECURITY;

CREATE POLICY student_profiles_select_self_or_admin ON public.student_profiles
    FOR SELECT TO authenticated
    USING ((SELECT internal.is_admin()) OR (SELECT auth.uid()) = student_id);

CREATE POLICY student_profiles_insert_self ON public.student_profiles
    FOR INSERT TO authenticated
    WITH CHECK (
        (SELECT auth.uid()) = student_id
        AND EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = (SELECT auth.uid()) AND p.role = 'student'::public.user_role
        )
    );

CREATE POLICY student_profiles_update_self ON public.student_profiles
    FOR UPDATE TO authenticated
    USING ((SELECT auth.uid()) = student_id)
    WITH CHECK ((SELECT auth.uid()) = student_id);

CREATE POLICY student_profiles_delete_self_or_admin ON public.student_profiles
    FOR DELETE TO authenticated
    USING ((SELECT internal.is_admin()) OR (SELECT auth.uid()) = student_id);
