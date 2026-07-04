/* Expose the public educator avatar through profiles_public so every cross-user identity chip
   (forum authors, announcement authors, marketplace, etc.) can render the avatar, falling back to
   initials. avatar_url lives on educator_profiles; the view runs security_invoker = off (owner
   privileges) so the LEFT JOIN bypasses RLS on both tables. avatar_url is non-sensitive — it is
   already public via get_public_educator_profile / list_published_educators and served from the
   public educator-assets bucket. NULL for non-educators.

   Hand-authored (not db diff): db diff re-emits the view WITHOUT the GRANT, which would break every
   cross-user read. CREATE OR REPLACE keeps the existing column order and appends avatar_url. */

CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = off) AS
SELECT p.id, p.first_name, p.last_name, p.display_name, p.role, p.is_approved, ep.avatar_url
FROM public.profiles p
LEFT JOIN public.educator_profiles ep ON ep.educator_id = p.id;

GRANT SELECT ON public.profiles_public TO authenticated;
