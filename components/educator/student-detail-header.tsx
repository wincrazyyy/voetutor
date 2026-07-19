import { CalendarDays, GraduationCap, Layers, Phone, School, Target } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { UserAvatar } from "@/components/ui/user-avatar";
import { getDisplayName, relativeTime } from "@/lib/utils/format";
import type { StudentAccess } from "@/lib/queries/class-access";
import type { StudentClassDetail } from "@/lib/queries/student-insights";

/** Fixed locale + UTC so server and client render the same string (no hydration mismatch). */
const ABS_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatAbsDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : ABS_DATE.format(date);
}

/** Tone per derived-signal label (plan §4E); unknown labels fall back to the muted tone. */
function signalClasses(signal: string): string {
  switch (signal) {
    case "Inactive":
    case "Never started":
    case "Restricted · no passes":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    case "Behind class average":
      return "border-gold/40 bg-gold/10 text-gold";
    case "On track":
      return "border-primary/30 bg-primary/5 text-primary";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function DetailRow({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof Phone;
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2 rounded-md bg-muted/30 px-3 py-2">
      <Icon className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
      <div className="min-w-0 break-words text-xs leading-relaxed">
        <span className="font-semibold uppercase tracking-wider text-muted-foreground mr-2">{label}</span>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline decoration-muted-foreground/50 underline-offset-2 hover:text-primary"
          >
            {value}
          </a>
        ) : (
          <span className="text-foreground">{value}</span>
        )}
      </div>
    </div>
  );
}

/**
 * Panel A + E of the student insight page: identity, enrolment details from the
 * get_class_student_detail RPC, join dates, access chips, and the derived signal badges.
 * View-only — no edit affordance ever renders here (admin editing lives under /admin/students).
 */
export function StudentDetailHeader({
  detail,
  access,
  signals,
}: {
  detail: StudentClassDetail;
  access: StudentAccess;
  signals: string[];
}) {
  const name = getDisplayName(detail.first_name, detail.last_name, detail.display_name);
  const whatsappDigits = (detail.whatsapp_number ?? "").replace(/\D/g, "");
  const whatsappHref = whatsappDigits.length >= 8 ? `https://wa.me/${whatsappDigits}` : undefined;

  return (
    <Card className="border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <UserAvatar
            avatarUrl={detail.avatar_url}
            firstName={detail.first_name}
            lastName={detail.last_name}
            displayName={detail.display_name}
            size="lg"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="min-w-0 break-words text-xl font-bold text-foreground">{name}</h2>
              <Badge variant="outline" className="uppercase tracking-wider">
                Student
              </Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {access.scope === "full" ? (
                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs md:text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Full
                </span>
              ) : access.passes.length === 0 ? (
                <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-xs md:text-[10px] font-semibold uppercase tracking-wider text-destructive">
                  Restricted · no passes
                </span>
              ) : (
                access.passes.map((pass) => (
                  <span
                    key={pass.id}
                    className="inline-flex min-w-0 max-w-[10rem] items-center rounded-full bg-gold/10 px-2 py-0.5 text-xs md:text-[10px] font-semibold text-gold"
                  >
                    <span className="truncate">{pass.name}</span>
                  </span>
                ))
              )}
            </div>
          </div>
        </div>

        {signals.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
            {signals.map((signal) => (
              <span
                key={signal}
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${signalClasses(signal)}`}
              >
                {signal}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {detail.whatsapp_number && (
          <DetailRow icon={Phone} label="WhatsApp" value={detail.whatsapp_number} href={whatsappHref} />
        )}
        {detail.school && <DetailRow icon={School} label="School" value={detail.school} />}
        {detail.school_year && (
          <DetailRow icon={GraduationCap} label="School year" value={detail.school_year} />
        )}
        {detail.target_grade && <DetailRow icon={Target} label="Target grade" value={detail.target_grade} />}
        <DetailRow
          icon={CalendarDays}
          label="Joined platform"
          value={`${formatAbsDate(detail.account_created_at)} · ${relativeTime(detail.account_created_at)}`}
        />
        <DetailRow
          icon={CalendarDays}
          label="Joined class"
          value={`${formatAbsDate(detail.enrolled_at)} · ${relativeTime(detail.enrolled_at)}`}
        />
        <DetailRow
          icon={Layers}
          label="Enrollments"
          value={`${detail.enrolled_class_count} ${detail.enrolled_class_count === 1 ? "class" : "classes"} on the platform`}
        />
      </div>
    </Card>
  );
}
