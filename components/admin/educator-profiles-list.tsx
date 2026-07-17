"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Inbox, Pencil, Search, ShieldCheck, Star } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DeleteAccountButton } from "@/components/admin/delete-account-button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { deleteEducatorAccountAction } from "@/app/actions/educators";
import type { EducatorProfile, Profile } from "@/lib/types/database";
import { getDisplayName } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

interface EducatorProfilesListProps {
  educators: Profile[];
  educatorProfiles: Record<string, EducatorProfile>;
  currentUserId: string;
}

type ProfileState = "live" | "draft" | "none";

function profileState(ep: EducatorProfile | undefined): ProfileState {
  if (!ep) return "none";
  if (ep.is_published) return "live";
  const hasContent =
    (ep.profile_doc?.sections?.length ?? 0) > 0 ||
    Boolean(ep.headline) ||
    Boolean(ep.role_label) ||
    Boolean(ep.avatar_url) ||
    (ep.subject_tags?.length ?? 0) > 0;
  return hasContent ? "draft" : "none";
}

const STATE_PILL: Record<ProfileState, { label: string; className: string }> = {
  live: { label: "Live", className: "bg-primary/10 text-primary" },
  draft: { label: "Draft — hidden", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  none: { label: "No profile yet", className: "bg-muted text-muted-foreground" },
};

export function EducatorProfilesList({ educators, educatorProfiles, currentUserId }: EducatorProfilesListProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return educators;
    return educators.filter((educator) => {
      const ep = educatorProfiles[educator.id];
      const haystack = [
        educator.first_name,
        educator.last_name,
        educator.display_name,
        ep?.role_label,
        ep?.headline,
        ...(ep?.subject_tags ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [query, educators, educatorProfiles]);

  if (educators.length === 0) {
    return (
      <Card className="border border-dashed border-border bg-card/50 p-10 text-center">
        <Inbox className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <h3 className="mb-1 text-lg font-bold">No educators yet</h3>
        <p className="text-sm text-muted-foreground">
          Approved educators and admins appear here once they exist.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative w-full">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search educators by name, subject, headline…"
          aria-label="Search educators"
          inputMode="search"
          enterKeyHint="search"
          className="h-11 w-full rounded-full border border-input bg-background pl-10 pr-4 text-base outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-sm"
        />
      </div>

      {query.trim() && (
        <p className="text-xs text-muted-foreground">
          {filtered.length} of {educators.length} {educators.length === 1 ? "educator" : "educators"}
        </p>
      )}

      {filtered.length === 0 ? (
        <Card className="border border-dashed border-border bg-card/50 p-10 text-center">
          <Search className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h3 className="mb-1 text-lg font-bold">No matches</h3>
          <p className="text-sm text-muted-foreground">
            No educator matches &ldquo;{query.trim()}&rdquo;. Try a different name or subject.
          </p>
        </Card>
      ) : (
        filtered.map((educator) => {
          const ep = educatorProfiles[educator.id];
          const state = profileState(ep);
          const pill = STATE_PILL[state];
          const name = getDisplayName(educator.first_name, educator.last_name, educator.display_name);

          return (
            <Card key={educator.id} className="flex flex-col items-start gap-3 border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:gap-4">
              <div className="flex w-full min-w-0 flex-1 items-center gap-3">
                <UserAvatar
                  avatarUrl={ep?.avatar_url ?? null}
                  firstName={educator.first_name}
                  lastName={educator.last_name}
                  displayName={educator.display_name}
                  size="md"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{name}</span>
                    {educator.role === "admin" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-secondary-foreground">
                        <ShieldCheck className="h-3 w-3" />
                        Admin
                      </span>
                    ) : null}
                    {ep?.is_verified ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                        Verified
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                        pill.className,
                      )}
                    >
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          state === "live" ? "bg-primary" : state === "draft" ? "bg-amber-500" : "bg-muted-foreground/60",
                        )}
                        aria-hidden
                      />
                      {pill.label}
                    </span>
                  </div>
                </div>
              </div>

              {/* Native `title` tooltips never fire on touch, so below `lg` every action renders a
                  labelled twin instead. The `lg:inline-flex` copies are the icon-only desktop row. */}
              <div className="flex w-full shrink-0 flex-wrap items-center justify-start gap-1.5 sm:w-auto sm:justify-end">
                {state === "live" ? (
                  <>
                    <Button variant="outline" size="sm" asChild className="lg:hidden" aria-label="View public profile">
                      <Link href={`/educators/${educator.id}`} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                        View
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      asChild
                      className="hidden lg:inline-flex"
                      title="View public profile"
                      aria-label="View public profile"
                    >
                      <Link href={`/educators/${educator.id}`} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                      className="lg:hidden"
                      aria-label="View public profile — not public yet"
                    >
                      <ExternalLink className="h-4 w-4" />
                      View
                    </Button>
                    <span title="This profile isn't public yet" className="hidden lg:inline-flex">
                      <Button
                        variant="outline"
                        size="icon-sm"
                        disabled
                        aria-label="View public profile — not public yet"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </span>
                  </>
                )}
                <Button variant="outline" size="sm" asChild className="lg:hidden" aria-label="Manage reviews">
                  <Link href={`/admin/educators/${educator.id}/reviews`}>
                    <Star className="h-4 w-4" />
                    Reviews
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  asChild
                  className="hidden lg:inline-flex"
                  title="Manage reviews"
                  aria-label="Manage reviews"
                >
                  <Link href={`/admin/educators/${educator.id}/reviews`}>
                    <Star className="h-4 w-4" />
                  </Link>
                </Button>
                <Button size="sm" asChild className="lg:hidden" aria-label="Edit profile">
                  <Link href={`/admin/educators/${educator.id}/edit`}>
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Link>
                </Button>
                <Button
                  size="icon-sm"
                  asChild
                  className="hidden lg:inline-flex"
                  title="Edit profile"
                  aria-label="Edit profile"
                >
                  <Link href={`/admin/educators/${educator.id}/edit`}>
                    <Pencil className="h-4 w-4" />
                  </Link>
                </Button>
                {educator.id !== currentUserId ? (
                  <DeleteAccountButton
                    accountId={educator.id}
                    accountName={name}
                    action={deleteEducatorAccountAction}
                    description={
                      <>
                        removes their login, public profile and reviews, every class they own — with all
                        topics, lessons, notes, announcements, forum threads, and every student&apos;s
                        enrolment and progress in those classes — plus their entire content library and all
                        uploaded videos and files. This cannot be undone.
                      </>
                    }
                  />
                ) : (
                  /* Holds the Delete column on the signed-in admin's own row, which has no Delete
                     button — without it the other actions re-flow into Delete's slot. */
                  <div aria-hidden className="size-9 shrink-0 sm:size-8" />
                )}
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
