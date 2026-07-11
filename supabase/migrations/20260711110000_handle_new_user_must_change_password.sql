/* Companion to 20260711100000_profiles_must_change_password: internal.handle_new_user now stamps the
   new profiles.must_change_password column from signup metadata (students only, total string compare —
   never a boolean cast, which would abort every signup on garbage metadata). Hand-authored; the body
   below is byte-identical to supabase/schemas/01_functions.sql. */

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
COMMENT ON FUNCTION internal.handle_new_user() IS 'Automates profile provisioning upon identity creation. Reads intended_role from user-controlled metadata but constrains the resulting state: educator implies is_approved = FALSE (gated until an admin promotes them); anything else lands on a fully-approved student. The admin role is never assignable from this path, neutralising privilege escalation via signup metadata. Also intakes must_change_password from signup metadata for students only, via a total string comparison (never a boolean cast, which would abort account creation on garbage metadata) — TRUE marks accounts provisioned by an educator/admin with a temporary password.';
