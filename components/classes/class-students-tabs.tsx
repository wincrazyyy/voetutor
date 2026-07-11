"use client";

import type { ReactNode } from "react";
import { Link2, Users } from "lucide-react";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

/**
 * Client tabs shell for the class students page. The server page keeps all guards + data-fetching and
 * passes its server-rendered Roster JSX (add-student card + roster) in as the `roster` slot and the
 * invite-links body as `invites` (server children into a client component is fine).
 */
export function ClassStudentsTabs({
  roster,
  invites,
  studentCount,
  pendingInviteCount,
}: {
  roster: ReactNode;
  invites: ReactNode;
  studentCount: number;
  pendingInviteCount: number;
}) {
  return (
    <Tabs defaultValue="roster" className="w-full">
      <TabsList>
        <TabsTrigger value="roster" className="gap-1.5">
          <Users className="h-4 w-4" />
          Roster
          <span className="ml-1 rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
            {studentCount}
          </span>
        </TabsTrigger>
        <TabsTrigger value="invites" className="gap-1.5">
          <Link2 className="h-4 w-4" />
          Invite links
          {pendingInviteCount > 0 ? (
            <span className="ml-1 rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
              {pendingInviteCount}
            </span>
          ) : null}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="roster" className="mt-6 space-y-6">
        {roster}
      </TabsContent>
      <TabsContent value="invites" className="mt-6 space-y-6">
        {invites}
      </TabsContent>
    </Tabs>
  );
}
