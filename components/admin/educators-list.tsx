"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, ChevronUp, Inbox, Phone, GraduationCap as GradCap, Calendar, BookOpen, User as UserIcon } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { EducatorProfile, Profile } from "@/lib/types/database";
import { getDisplayName, getInitials, relativeTime } from "@/lib/utils/format";

interface EducatorsListProps {
  educators: Profile[];
  educatorProfiles: Record<string, EducatorProfile>;
  filter: "pending" | "approved";
}

export function EducatorsList({ educators, educatorProfiles, filter }: EducatorsListProps) {
  if (educators.length === 0) {
    return (
      <Card className="p-10 border border-dashed border-border bg-card/50 text-center">
        <Inbox className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
        <h3 className="text-lg font-bold mb-1">No {filter} educators</h3>
        <p className="text-sm text-muted-foreground">
          {filter === "pending"
            ? "All educator sign-ups have been processed."
            : "No educators have been approved yet."}
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {educators.map((educator) => (
        <EducatorCard
          key={educator.id}
          educator={educator}
          extra={educatorProfiles[educator.id] ?? null}
          filter={filter}
        />
      ))}
    </div>
  );
}

function EducatorCard({
  educator,
  extra,
  filter,
}: {
  educator: Profile;
  extra: EducatorProfile | null;
  filter: "pending" | "approved";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(filter === "pending");

  const name = getDisplayName(educator.first_name, educator.last_name, educator.display_name);
  const initials = getInitials(educator.first_name, educator.last_name, educator.display_name);

  const handleApprove = () => {
    setError(null);
    startTransition(async () => {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc("approve_educator", {
        p_user_id: educator.id,
      });
      if (rpcError) {
        setError(rpcError.message);
        return;
      }
      router.refresh();
    });
  };

  const hasExtra = extra && (
    extra.gender ||
    extra.whatsapp_number ||
    extra.education ||
    extra.education_degree ||
    extra.education_major ||
    extra.graduation_year ||
    extra.teaching_experience ||
    extra.teaching_subjects ||
    extra.self_introduction
  );

  return (
    <Card className="p-5 border-border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
            {initials}
          </div>
          <div>
            <div className="font-semibold">{name}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {filter === "pending"
                ? `Signed up ${relativeTime(educator.created_at)}`
                : educator.approved_at
                  ? `Approved ${relativeTime(educator.approved_at)}`
                  : "Approved"}
            </div>
          </div>
        </div>

        {filter === "approved" ? (
          <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            Approved
          </Badge>
        ) : (
          <div className="flex flex-col items-end gap-2">
            <Button size="sm" className="gap-2" onClick={handleApprove} disabled={isPending}>
              <CheckCircle2 className="w-4 h-4" />
              {isPending ? "Approving..." : "Approve"}
            </Button>
            {error && <p className="text-xs text-destructive max-w-xs text-right">{error}</p>}
          </div>
        )}
      </div>

      {hasExtra && (
        <div className="mt-4 pt-4 border-t border-border/60">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {expanded ? "Hide application details" : "Show application details"}
          </button>

          {expanded && extra && (
            <div className="mt-3 grid gap-2 text-sm">
              <div className="grid sm:grid-cols-2 gap-2">
                {extra.gender && (
                  <DetailRow icon={UserIcon} label="Gender" value={extra.gender} />
                )}
                {extra.whatsapp_number && (
                  <DetailRow icon={Phone} label="WhatsApp" value={extra.whatsapp_number} />
                )}
              </div>

              {(extra.education || extra.education_degree || extra.education_major || extra.graduation_year) && (
                <DetailRow
                  icon={GradCap}
                  label="Education"
                  value={[
                    extra.education_degree,
                    extra.education_major ? `in ${extra.education_major}` : null,
                    extra.education ? `(${extra.education})` : null,
                    extra.graduation_year ? `· class of ${extra.graduation_year}` : null,
                  ]
                    .filter(Boolean)
                    .join(" ") || "—"}
                />
              )}

              {extra.teaching_subjects && (
                <DetailRow icon={BookOpen} label="Subjects" value={extra.teaching_subjects} />
              )}

              {extra.teaching_experience && (
                <DetailBlock label="Teaching experience" value={extra.teaching_experience} />
              )}

              {extra.self_introduction && (
                <DetailBlock label="Self-introduction" value={extra.self_introduction} />
              )}

              {extra.updated_at && (
                <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Last updated {relativeTime(extra.updated_at)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!hasExtra && filter === "pending" && (
        <div className="mt-4 pt-4 border-t border-border/60 text-xs text-muted-foreground italic">
          This educator hasn&apos;t filled in any additional application details yet.
        </div>
      )}
    </Card>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UserIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2 rounded-md bg-muted/30 px-3 py-2">
      <Icon className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
      <div className="text-xs leading-relaxed">
        <span className="font-semibold uppercase tracking-wider text-muted-foreground mr-2">{label}</span>
        <span className="text-foreground">{value}</span>
      </div>
    </div>
  );
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/30 px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <p className="text-sm leading-relaxed whitespace-pre-line">{value}</p>
    </div>
  );
}
