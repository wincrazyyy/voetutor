import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getPublicEducatorProfile, getEducatorProfile } from "@/lib/queries/educator-profiles";
import {
  getPublicEducatorReviews,
  getReviewsForEducatorManage,
  manageReviewsToPublic,
} from "@/lib/queries/educator-reviews";
import { getCurrentProfile } from "@/lib/queries/profile";
import { VoeWordmark } from "@/components/brand/vault-mark";
import { ProfileHeader } from "@/components/profile/public/profile-header";
import { ReviewsSection } from "@/components/profile/public/reviews-section";
import { ProfileDoc } from "@/components/profile/render/profile-doc";
import { imageAllowed } from "@/components/profile/render/photos";
import { getDisplayName } from "@/lib/utils/format";
import type { PublicEducatorProfile } from "@/lib/types/database";

interface PageProps {
  params: Promise<{ educatorId: string }>;
}

/**
 * Resolves a public profile. Published+approved -> via the RPC (works for anon). Otherwise, if the
 * signed-in viewer is the owner, render their own draft (self-RLS) behind a preview banner.
 */
async function loadProfile(
  educatorId: string,
): Promise<{ profile: PublicEducatorProfile; isOwnerPreview: boolean } | null> {
  const published = await getPublicEducatorProfile(educatorId);
  if (published) return { profile: published, isOwnerPreview: false };

  const me = await getCurrentProfile();
  if (!me || me.id !== educatorId) return null;
  const own = await getEducatorProfile(educatorId);
  if (!own) return null;

  return {
    isOwnerPreview: true,
    profile: {
      educator_id: me.id,
      first_name: me.first_name,
      last_name: me.last_name,
      display_name: me.display_name,
      avatar_url: own.avatar_url,
      role_label: own.role_label,
      headline: own.headline,
      hourly_rate_cents: own.hourly_rate_cents,
      subject_tags: own.subject_tags,
      profile_doc: own.profile_doc,
      is_verified: own.is_verified,
      tier: own.tier,
      published_at: own.published_at,
    },
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { educatorId } = await params;
  const published = await getPublicEducatorProfile(educatorId);
  if (!published) return { title: "Educator profile | VOETutor" };
  const name = getDisplayName(published.first_name, published.last_name, published.display_name);
  const title = published.role_label ? `${name} — ${published.role_label} | VOETutor` : `${name} | VOETutor`;
  const description = published.headline ?? `${name} on VOETutor.`;
  const images =
    published.avatar_url && imageAllowed(published.avatar_url, published.educator_id)
      ? [published.avatar_url]
      : undefined;
  return { title, description, openGraph: { title, description, images } };
}

export default async function EducatorPublicProfilePage({ params }: PageProps) {
  const { educatorId } = await params;
  const loaded = await loadProfile(educatorId);
  if (!loaded) notFound();

  const { profile, isOwnerPreview } = loaded;
  const name = getDisplayName(profile.first_name, profile.last_name, profile.display_name);
  const hasBody = (profile.profile_doc?.sections?.length ?? 0) > 0;
  /* Published page reads the public RPC; an owner previewing a draft reads their own rows (the RPC
     returns nothing for an unpublished profile) so the preview matches what will go live. */
  const reviews = isOwnerPreview
    ? manageReviewsToPublic(await getReviewsForEducatorManage(profile.educator_id))
    : await getPublicEducatorReviews(profile.educator_id);

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3 sm:px-8">
          <Link href="/" className="hover:opacity-80 transition-opacity">
            <VoeWordmark />
          </Link>
          <Link href="/classes/browse" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Browse classes
          </Link>
        </div>
      </div>

      {isOwnerPreview ? (
        <div className="border-b border-primary/30 bg-primary/5">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-5 py-3 text-sm sm:px-8">
            <span>
              <strong className="text-primary">Draft preview</strong> — only you can see this. Publish from your
              builder to go live.
            </span>
            <Link href="/educator/profile" className="shrink-0 font-semibold text-primary underline">
              Edit
            </Link>
          </div>
        </div>
      ) : null}

      <main className="mx-auto flex max-w-3xl flex-col px-5 sm:px-8">
        <ProfileHeader profile={profile} />

        <div className="h-px w-full bg-primary/40" aria-hidden />

        {hasBody ? (
          <ProfileDoc doc={profile.profile_doc} educatorId={profile.educator_id} tier={profile.tier} />
        ) : (
          <p className="py-10 text-base text-muted-foreground">
            {name} is still putting their profile together.
          </p>
        )}

        <ReviewsSection reviews={reviews} educatorId={profile.educator_id} />

        <p className="py-10 text-center text-xs text-muted-foreground">
          VOETutor · Verified educator profiles
        </p>
      </main>
    </div>
  );
}
