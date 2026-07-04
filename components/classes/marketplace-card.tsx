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
          <h3 className="text-lg font-bold leading-tight">{cls.title}</h3>
          <Badge
            variant="secondary"
            className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground bg-muted shrink-0"
          >
            {cls.code}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {cls.educator && (
            <UserAvatar
              avatarUrl={cls.educator.avatar_url}
              firstName={cls.educator.first_name}
              lastName={cls.educator.last_name}
              displayName={cls.educator.display_name}
              size={28}
            />
          )}
          <p className="text-xs text-muted-foreground">
            Taught by{" "}
            {cls.educatorProfilePublished && cls.educator_id ? (
              <Link
                href={`/educators/${cls.educator_id}`}
                className="font-semibold text-primary hover:underline"
              >
                {educatorName}
              </Link>
            ) : (
              <span className="font-semibold text-foreground">{educatorName}</span>
            )}
          </p>
        </div>

        {cls.description && (
          <p className="text-sm text-muted-foreground line-clamp-3">{cls.description}</p>
        )}

        <div className="mt-auto pt-2">
          <ReportClassButton classId={cls.id} />
        </div>
      </div>

      <div className="p-4 bg-muted/20 border-t border-border flex items-center justify-between gap-3">
        <div className="text-lg font-black">{formatPrice(cls.price_cents, cls.currency)}</div>
        {isFree ? (
          <EnrollFreeButton classId={cls.id} className="min-w-[10rem]" />
        ) : (
          <Button disabled className="min-w-[10rem]" title="Paid checkout coming soon">
            Buy (coming soon)
          </Button>
        )}
      </div>
    </Card>
  );
}
