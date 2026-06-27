import { createClient } from "@/lib/supabase/server";
import type { PublicEducatorCard } from "@/lib/types/database";

export interface ListEducatorsOptions {
  limit?: number;
  subject?: string | null;
}

/**
 * Bulk list of PUBLIC educator profiles (published + approved educators, plus admins) for the
 * marketplace surfaces — the homepage featured rack and the /educators directory. Reads through the
 * public.list_published_educators SECURITY DEFINER RPC, so it works for anonymous visitors and never
 * touches educator_profiles RLS directly. Premium-first, then verified, then most-recently-published.
 */
export async function listPublishedEducators(opts: ListEducatorsOptions = {}): Promise<PublicEducatorCard[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("list_published_educators", {
    p_limit: opts.limit ?? 24,
    p_subject: opts.subject ?? null,
  });
  return (data ?? []) as PublicEducatorCard[];
}
