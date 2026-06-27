-- Marketplace ordering: surface PREMIUM educators first on the homepage rack + /educators directory.
-- Body-only change (same signature/return type), so CREATE OR REPLACE preserves grants; the
-- REVOKE/GRANT below are belt-and-suspenders + idempotent. Hand-authored (db diff isn't used here).

create or replace function public.list_published_educators(p_limit integer default 24, p_subject text default null)
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
    is_verified boolean,
    tier public.educator_tier,
    published_at timestamptz
) as $$
    select
        ep.educator_id, p.first_name, p.last_name, p.display_name,
        ep.avatar_url, ep.role_label, ep.headline, ep.hourly_rate_cents,
        ep.subject_tags, ep.is_verified, ep.tier, ep.published_at
    from public.educator_profiles ep
    join public.profiles p on p.id = ep.educator_id
    where ep.is_published = true
      and (
        (p.role = 'educator'::public.user_role and p.is_approved = true)
        or p.role = 'admin'::public.user_role
      )
      and (p_subject is null or ep.subject_tags @> array[p_subject])
    order by (ep.tier = 'premium'::public.educator_tier) desc, ep.is_verified desc, ep.published_at desc nulls last
    limit greatest(1, least(coalesce(p_limit, 24), 60));
$$ language sql stable security definer set search_path = '';

revoke execute on function public.list_published_educators(integer, text) from public;
grant  execute on function public.list_published_educators(integer, text) to anon, authenticated;
