import Link from "next/link";
import { MessageSquare, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";

interface CommunityBannerProps {
  classId: string;
}

export function CommunityBanner({ classId }: CommunityBannerProps) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold">Community</h2>
      <Card className="p-5 border-primary/20 shadow-sm bg-primary/5 hover:bg-primary/10 transition-colors group overflow-hidden relative cursor-pointer">
        <div className="absolute top-0 left-0 w-1 h-full bg-primary"></div>
        <Link href={`/class/${classId}/forum`} className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-primary font-bold">
              <MessageSquare className="w-5 h-5" />
              <h3>Class Forum</h3>
            </div>
            <ArrowRight className="w-4 h-4 text-primary opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-hover:translate-x-1 transition-all" />
          </div>
          <p className="text-sm text-muted-foreground">Ask questions, share resources, and collaborate with your peers.</p>
        </Link>
      </Card>
    </div>
  );
}
