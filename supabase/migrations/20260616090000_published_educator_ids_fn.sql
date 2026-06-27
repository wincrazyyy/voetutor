-- public.published_educator_ids(uuid[]) — given a set of educator ids, returns the subset that have a
-- PUBLIC profile (published + approved educator). Lets the marketplace / feeds gate links to
-- /educators/[id] so they never dead-end on an unpublished profile. Returns only ids that are already
-- publicly viewable via get_public_educator_profile, so it leaks nothing. Idempotent (safe to re-run).

create or replace function public.published_educator_ids(p_ids uuid[])
returns uuid[] as $$
    select coalesce(array_agg(ep.educator_id), '{}')
    from public.educator_profiles ep
    join public.profiles p on p.id = ep.educator_id
    where ep.educator_id = any(p_ids)
      and ep.is_published = true
      and p.role = 'educator'::public.user_role
      and p.is_approved = true;
$$ language sql stable security definer set search_path = '';

revoke execute on function public.published_educator_ids(uuid[]) from public;
grant  execute on function public.published_educator_ids(uuid[]) to anon, authenticated;
