/* Admin-side educator profile editor: let admins INSERT / UPDATE any educator's public-profile row so
   the /admin/educators/<id>/profile builder can write on the educator's behalf. These are SEPARATE
   permissive policies added alongside the existing self-only policies (educator_profiles_insert_self /
   educator_profiles_update_self) — RLS policies are OR'd, and a non-admin never satisfies is_admin(),
   so nothing widens for non-admins. Idempotent (DROP IF EXISTS + CREATE) — safe to re-run / paste.

   Cross-tenant safety is layered above this policy, not in it: the adminSaveEducatorProfileAction
   server action (a) gates on the caller being an admin, (b) verifies the TARGET profile's role is
   educator/admin before upserting (so a student row can never be materialised), (c) writes an explicit
   column whitelist that never touches tier / is_verified / slug / published_at (the
   enforce_educator_admin_fields trigger early-returns for admins, so the whitelist is the guard), and
   (d) origin-pins images to the TARGET educator's storage prefix. */

drop policy if exists educator_profiles_insert_admin on public.educator_profiles;
create policy educator_profiles_insert_admin on public.educator_profiles
    for insert to authenticated
    with check ((select internal.is_admin()));

drop policy if exists educator_profiles_update_admin on public.educator_profiles;
create policy educator_profiles_update_admin on public.educator_profiles
    for update to authenticated
    using ((select internal.is_admin()))
    with check ((select internal.is_admin()));
