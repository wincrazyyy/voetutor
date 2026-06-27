/* Bulk list of PUBLIC educator profiles for the marketplace surfaces (the VOETutor homepage featured
   rack + the new /educators directory). Same access boundary as get_public_educator_profile /
   published_educator_ids, just exposed in bulk. No schema change — every column already exists on
   educator_profiles. Idempotent (CREATE OR REPLACE + grants) — safe to re-run / paste. */

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
    order by ep.is_verified desc, ep.published_at desc nulls last
    limit greatest(1, least(coalesce(p_limit, 24), 60));
$$ language sql stable security definer set search_path = '';

revoke execute on function public.list_published_educators(integer, text) from public;
grant  execute on function public.list_published_educators(integer, text) to anon, authenticated;
