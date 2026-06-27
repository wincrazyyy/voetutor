import Link from "next/link";
import { ExternalLink, Inbox, Pencil, ShieldCheck, Star } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { EducatorProfile, Profile } from "@/lib/types/database";
import { getDisplayName, getInitials } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

interface EducatorProfilesListProps {
  educators: Profile[];
  educatorProfiles: Record<string, EducatorProfile>;
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

export function EducatorProfilesList({ educators, educatorProfiles }: EducatorProfilesListProps) {
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
    <div className="flex flex-col gap-3">
      {educators.map((educator) => {
        const ep = educatorProfiles[educator.id];
        const state = profileState(ep);
        const pill = STATE_PILL[state];
        const name = getDisplayName(educator.first_name, educator.last_name, educator.display_name);
        const initials = getInitials(educator.first_name, educator.last_name, educator.display_name);

        return (
          <Card key={educator.id} className="flex flex-wrap items-center gap-4 border-border bg-card p-4 shadow-sm">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {ep?.avatar_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={ep.avatar_url}
                  alt=""
                  className="h-11 w-11 shrink-0 rounded-full border border-border object-cover"
                />
              ) : (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">
                  {initials}
                </div>
              )}
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

            <div className="flex shrink-0 items-center gap-2">
              {state === "live" ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/educators/${educator.id}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />
                    View
                  </Link>
                </Button>
              ) : null}
              <Button variant="outline" size="sm" asChild>
                <Link href={`/admin/educators/${educator.id}/reviews`}>
                  <Star className="h-3.5 w-3.5" />
                  Reviews
                </Link>
              </Button>
              <Button size="sm" asChild>
                <Link href={`/admin/educators/${educator.id}/profile`}>
                  <Pencil className="h-3.5 w-3.5" />
                  Edit profile
                </Link>
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
