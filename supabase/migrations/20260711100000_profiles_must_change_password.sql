/* Forced first-sign-in password change groundwork (see plans student-management-consolidation).
   Adds profiles.must_change_password, set from signup metadata by internal.handle_new_user (updated in
   the companion migration) for student accounts provisioned by an educator/admin with a temporary
   password. Hand-authored to stay byte-identical to the declarative schema; deliberately touches
   neither the profiles_public view nor any storage.objects policy. */

ALTER TABLE public.profiles ADD COLUMN must_change_password BOOLEAN DEFAULT FALSE NOT NULL;

COMMENT ON COLUMN public.profiles.must_change_password IS 'TRUE only for accounts provisioned by an educator/admin with a temporary password (set from signup metadata by internal.handle_new_user). While TRUE the proxy confines the signed-in user to /onboarding/set-password until they set their own password. Deliberately NOT locked by internal.protect_profile_role: the owner clears it themselves after supabase.auth.updateUser succeeds (like avatar_url). A user who clears it without changing the password only weakens their own account — the educator who provisioned it already knows the temporary password; the flag is a UX rail, not the security boundary. Never exposed via profiles_public.';
