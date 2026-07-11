/* Removes the student_profiles.courses ("enrolled courses" free-text subjects) field — no longer
   collected at sign-up or in the educator-created-account form. NOTE: this is the free-text list of
   subjects a student studies, NOT the platform class enrolments (those live in class_enrollments and
   are untouched). Updates internal.handle_new_user to stop reading the metadata key (body byte-identical
   to supabase/schemas/01_functions.sql), then drops the column. Function first so it no longer
   references the column before the drop. */

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

    INSERT INTO public.profiles (id, first_name, last_name, display_name, role, is_approved, must_change_password)
    VALUES (
        NEW.id,
        NEW.raw_user_meta_data->>'first_name',
        NEW.raw_user_meta_data->>'last_name',
        NEW.raw_user_meta_data->>'display_name',
        v_role,
        v_is_approved,
        (v_role = 'student'::public.user_role
            AND NEW.raw_user_meta_data->>'must_change_password' = 'true')
    );

    /* Students provide extra enrollment details at sign-up (passed in signup metadata); persist them
       into the sidecar. Values are truncated to the column caps so an oversized metadata payload can
       never abort account creation, and blanks collapse to NULL. */
    IF v_role = 'student'::public.user_role THEN
        INSERT INTO public.student_profiles (
            student_id, whatsapp_number, school, school_year, target_grade
        )
        VALUES (
            NEW.id,
            LEFT(NULLIF(NEW.raw_user_meta_data->>'whatsapp_number', ''), 50),
            LEFT(NULLIF(NEW.raw_user_meta_data->>'school', ''), 200),
            LEFT(NULLIF(NEW.raw_user_meta_data->>'school_year', ''), 60),
            LEFT(NULLIF(NEW.raw_user_meta_data->>'target_grade', ''), 100)
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION internal.handle_new_user() IS 'Automates profile provisioning upon identity creation. Reads intended_role from user-controlled metadata but constrains the resulting state: educator implies is_approved = FALSE (gated until an admin promotes them); anything else lands on a fully-approved student. The admin role is never assignable from this path, neutralising privilege escalation via signup metadata. Also intakes must_change_password from signup metadata for students only, via a total string comparison (never a boolean cast, which would abort account creation on garbage metadata) — TRUE marks accounts provisioned by an educator/admin with a temporary password.';

ALTER TABLE public.student_profiles DROP COLUMN IF EXISTS courses;
