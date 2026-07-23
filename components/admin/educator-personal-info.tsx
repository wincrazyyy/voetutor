import {
  BookOpen,
  CalendarDays,
  GraduationCap,
  Layers,
  Phone,
  User,
  UserCheck,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { relativeTime } from "@/lib/utils/format";
import type { EducatorProfile } from "@/lib/types/database";

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

function LongText({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/30 px-3 py-2">
      <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">{value}</p>
    </div>
  );
}

interface EducatorPersonalInfoProps {
  educatorProfile: EducatorProfile | null;
  accountCreatedAt: string;
  approvedAt: string | null;
}

/**
 * Read-only card of the educator's private application details (the /pending form) plus the
 * account join/approval dates — visible to admins only. Editing these lives with the educator in
 * their own Settings; this surface deliberately has no mutation path.
 */
export function EducatorPersonalInfo({
  educatorProfile,
  accountCreatedAt,
  approvedAt,
}: EducatorPersonalInfoProps) {
  const ep = educatorProfile;
  const whatsappDigits = (ep?.whatsapp_number ?? "").replace(/\D/g, "");
  const whatsappHref = whatsappDigits.length >= 8 ? `https://wa.me/${whatsappDigits}` : undefined;
  const degreeLine = [ep?.education_degree, ep?.education_major].filter(Boolean).join(" · ");

  const hasApplicationDetails = Boolean(
    ep &&
      (ep.whatsapp_number ||
        ep.gender ||
        ep.education ||
        degreeLine ||
        ep.graduation_year != null ||
        ep.teaching_subjects ||
        ep.teaching_experience ||
        ep.self_introduction),
  );

  return (
    <Card className="border-border bg-card p-5 shadow-sm sm:p-6">
      <h2 className="mb-1 text-lg font-bold">Personal information</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Application details this educator submitted — visible to admins only. Read-only.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {ep?.whatsapp_number ? (
          <DetailRow icon={Phone} label="WhatsApp" value={ep.whatsapp_number} href={whatsappHref} />
        ) : null}
        {ep?.gender ? <DetailRow icon={User} label="Gender" value={ep.gender} /> : null}
        {ep?.education ? (
          <DetailRow icon={GraduationCap} label="Education" value={ep.education} />
        ) : null}
        {degreeLine ? <DetailRow icon={BookOpen} label="Degree" value={degreeLine} /> : null}
        {ep?.graduation_year != null ? (
          <DetailRow icon={CalendarDays} label="Graduated" value={String(ep.graduation_year)} />
        ) : null}
        {ep?.teaching_subjects ? (
          <DetailRow icon={Layers} label="Teaching subjects" value={ep.teaching_subjects} />
        ) : null}
        <DetailRow
          icon={CalendarDays}
          label="Joined platform"
          value={`${formatAbsDate(accountCreatedAt)} · ${relativeTime(accountCreatedAt)}`}
        />
        {approvedAt ? (
          <DetailRow
            icon={UserCheck}
            label="Approved"
            value={`${formatAbsDate(approvedAt)} · ${relativeTime(approvedAt)}`}
          />
        ) : null}
      </div>

      {ep?.teaching_experience ? (
        <div className="mt-2">
          <LongText label="Teaching experience" value={ep.teaching_experience} />
        </div>
      ) : null}
      {ep?.self_introduction ? (
        <div className="mt-2">
          <LongText label="Self introduction" value={ep.self_introduction} />
        </div>
      ) : null}

      {!hasApplicationDetails ? (
        <p className="p-2 text-sm text-muted-foreground">
          No application form details were submitted.
        </p>
      ) : null}
    </Card>
  );
}
