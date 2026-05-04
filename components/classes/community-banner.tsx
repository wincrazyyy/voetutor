import Link from "next/link";
import { MessageSquare, ArrowRight, Users } from "lucide-react";
import { Card } from "@/components/ui/card";

interface CommunityBannerProps {
  classId: string;
  memberCount: number;
}

export function CommunityBanner({ classId, memberCount }: CommunityBannerProps) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold">Community</h2>
      <Card className="p-5 border-primary/20 shadow-sm bg-primary/5 hover:bg-primary/10 transition-colors group overflow-hidden relative cursor-pointer">
        <div className="absolute top-0 left-0 w-1 h-full bg-primary"></div>
        <Link href={`/classes/${classId}/forum`} className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-primary font-bold">
              <MessageSquare className="w-5 h-5" />
              <h3>Class Forum</h3>
            </div>
            <ArrowRight className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
          </div>
          <p className="text-sm text-muted-foreground">Ask questions, share resources, and collaborate with your peers.</p>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium mt-1">
            <Users className="w-3.5 h-3.5" />
            {memberCount} {memberCount === 1 ? "member" : "members"}
          </div>
        </Link>
      </Card>
    </div>
  );
}
