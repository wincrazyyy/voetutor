-- Admins ARE tutors with extra perms (both of the platform's admins also tutor). Treat them as normal
-- educators for the PUBLIC profile boundary: an admin with a published profile is viewable at
-- /educators/<id> and links from the marketplace, exactly like an approved educator. The admin role
-- is never surfaced publicly. Idempotent (CREATE OR REPLACE) — safe to re-run / paste; lands correctly
-- whether or not 20260616090000_published_educator_ids_fn.sql has been applied yet.

create or replace function public.get_public_educator_profile(p_educator_id uuid)
returns table (
    educator_id uuid,
    first_name text,
    last_name text,
    display_name text,
    avatar_url text,
    role_label text,
    headline text,
    hourly_rate_cents integer,
    subject_tags text[],
    profile_doc jsonb,
    is_verified boolean,
    tier public.educator_tier,
    published_at timestamptz
) as $$
begin
    return query
    select
        ep.educator_id, p.first_name, p.last_name, p.display_name,
        ep.avatar_url, ep.role_label, ep.headline, ep.hourly_rate_cents,
        ep.subject_tags, ep.profile_doc, ep.is_verified, ep.tier, ep.published_at
    from public.educator_profiles ep
    join public.profiles p on p.id = ep.educator_id
    where ep.educator_id = p_educator_id
      and ep.is_published = true
      and (
        (p.role = 'educator'::public.user_role and p.is_approved = true)
        or p.role = 'admin'::public.user_role
      );
end;
$$ language plpgsql stable security definer set search_path = '';

revoke execute on function public.get_public_educator_profile(uuid) from public;
grant  execute on function public.get_public_educator_profile(uuid) to anon, authenticated;

create or replace function public.published_educator_ids(p_ids uuid[])
returns uuid[] as $$
    select coalesce(array_agg(ep.educator_id), '{}')
    from public.educator_profiles ep
    join public.profiles p on p.id = ep.educator_id
    where ep.educator_id = any(p_ids)
      and ep.is_published = true
      and (
        (p.role = 'educator'::public.user_role and p.is_approved = true)
        or p.role = 'admin'::public.user_role
      );
$$ language sql stable security definer set search_path = '';

revoke execute on function public.published_educator_ids(uuid[]) from public;
grant  execute on function public.published_educator_ids(uuid[]) to anon, authenticated;
