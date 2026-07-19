import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EnrollFreeButton } from "@/components/classes/enroll-free-button";
import { ReportClassButton } from "@/components/classes/report-class-button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { formatPrice, getDisplayName } from "@/lib/utils/format";
import type { MarketplaceClass } from "@/lib/queries/marketplace";

interface MarketplaceCardProps {
  cls: MarketplaceClass;
}

export function MarketplaceCard({ cls }: MarketplaceCardProps) {
  const educatorName = cls.educator
    ? getDisplayName(cls.educator.first_name, cls.educator.last_name, cls.educator.display_name)
    : "Unassigned";
  const isFree = cls.price_cents === 0;

  return (
    <Card className="flex flex-col overflow-hidden border border-border shadow-sm hover:shadow-md transition-shadow bg-card relative">
      <div className="absolute top-0 left-0 w-full h-1 bg-primary" />
      <div className="p-5 flex-1 mt-2 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 flex-1 break-words text-lg font-bold leading-tight">{cls.title}</h3>
          <Badge
            variant="secondary"
            className="text-xs sm:text-[10px] font-bold tracking-wider uppercase text-muted-foreground bg-muted shrink-0"
          >
            {cls.code}
          </Badge>
        </div>

        <div className="flex min-w-0 items-center">
          {cls.educatorProfilePublished && cls.educator_id ? (
            <Link
              href={`/educators/${cls.educator_id}`}
              className="group/educator flex min-w-0 items-center gap-2"
            >
              {cls.educator && (
                <UserAvatar
                  avatarUrl={cls.educator.avatar_url}
                  firstName={cls.educator.first_name}
                  lastName={cls.educator.last_name}
                  displayName={cls.educator.display_name}
                  size={28}
                />
              )}
              <p className="min-w-0 break-words text-xs text-muted-foreground">
                Taught by{" "}
                <span className="font-semibold text-primary group-hover/educator:underline">
                  {educatorName}
                </span>
              </p>
            </Link>
          ) : (
            <div className="flex min-w-0 items-center gap-2">
              {cls.educator && (
                <UserAvatar
                  avatarUrl={cls.educator.avatar_url}
                  firstName={cls.educator.first_name}
                  lastName={cls.educator.last_name}
                  displayName={cls.educator.display_name}
                  size={28}
                />
              )}
              <p className="min-w-0 break-words text-xs text-muted-foreground">
                Taught by <span className="font-semibold text-foreground">{educatorName}</span>
              </p>
            </div>
          )}
        </div>

        {cls.description && (
          <p className="text-sm text-muted-foreground line-clamp-3">{cls.description}</p>
        )}

        <div className="mt-auto pt-2">
          <ReportClassButton classId={cls.id} />
        </div>
      </div>

      <div className="flex flex-col items-stretch gap-3 border-t border-border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 truncate text-lg font-black">{formatPrice(cls.price_cents, cls.currency)}</div>
        {isFree ? (
          <EnrollFreeButton classId={cls.id} className="w-full sm:w-auto sm:min-w-[10rem]" />
        ) : (
          <Button disabled className="w-full sm:w-auto sm:min-w-[10rem]" title="Paid checkout coming soon">
            Buy (coming soon)
          </Button>
        )}
      </div>
    </Card>
  );
}
