import { Card } from "@/components/ui/card";

interface ForumSidebarProps {
  classCode: string;
  memberCount: number;
  postCount: number;
  resolvedCount: number;
  /** Total-member count is educator/admin-only — students never see class size. Defaults to hidden. */
  showMemberCount?: boolean;
}

export function ForumSidebar({
  classCode,
  memberCount,
  postCount,
  resolvedCount,
  showMemberCount = false,
}: ForumSidebarProps) {
  return (
    <Card className="p-5 border-border shadow-sm bg-card">
      <h2 className="text-lg font-bold mb-2">About this Forum</h2>
      <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
        This space is for you to ask questions, share resources, and collaborate with your peers in {classCode}.
      </p>
      <div className="flex flex-col gap-3 text-sm font-medium">
        {showMemberCount ? (
          <div className="flex justify-between items-center py-2 border-b border-border/50">
            <span className="text-muted-foreground">Total Members</span>
            <span>{memberCount}</span>
          </div>
        ) : null}
        <div className="flex justify-between items-center py-2 border-b border-border/50">
          <span className="text-muted-foreground">Discussions</span>
          <span>{postCount}</span>
        </div>
        <div className="flex justify-between items-center py-2">
          <span className="text-muted-foreground">Resolved Questions</span>
          <span>{resolvedCount}</span>
        </div>
      </div>
    </Card>
  );
}
