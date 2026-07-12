/*
  Fix: internal.handle_new_user() inserted NULL into profiles.must_change_password (NOT NULL)
  for student self-signups, so every student self-signup / invite-link signup aborted with
  SQLSTATE 23502. The old expression

      (v_role = 'student' AND NEW.raw_user_meta_data->>'must_change_password' = 'true')

  evaluates to NULL when the metadata key is absent (TRUE AND NULL = NULL under SQL three-valued
  logic) — the normal case for self-signup. Educator signups were unaffected (v_role = 'student'
  is FALSE, and FALSE AND NULL = FALSE), and educator-provisioned students pass the key
  explicitly. Wrap the boolean in COALESCE(..., FALSE) so an absent/garbage key yields FALSE.
*/

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
        COALESCE(
            v_role = 'student'::public.user_role
            AND NEW.raw_user_meta_data->>'must_change_password' = 'true',
            FALSE
        )
    );

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

COMMENT ON FUNCTION internal.handle_new_user() IS 'Automates profile provisioning upon identity creation. Reads intended_role from user-controlled metadata but constrains the resulting state: educator implies is_approved = FALSE (gated until an admin promotes them); anything else lands on a fully-approved student. The admin role is never assignable from this path, neutralising privilege escalation via signup metadata. Also intakes must_change_password from signup metadata for students only, via a string comparison wrapped in COALESCE(..., FALSE): a boolean cast would abort on garbage metadata, and a bare comparison yields NULL when the key is absent (every student self-signup / invite signup), which would violate the NOT NULL column and abort signup — COALESCE pins the default to FALSE. TRUE marks accounts provisioned by an educator/admin with a temporary password.';
