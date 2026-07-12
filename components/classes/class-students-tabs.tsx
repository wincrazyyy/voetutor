"use client";

import type { ReactNode } from "react";
import { Link2, Ticket, Users } from "lucide-react";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

/**
 * Client tabs shell for the class students page. The server page keeps all guards + data-fetching and
 * passes its server-rendered Roster JSX (add-student card + roster) in as the `roster` slot, the
 * invite-links body as `invites`, and the Access-passes manager as `passes` (server children into a
 * client component is fine).
 */
export function ClassStudentsTabs({
  roster,
  invites,
  passes,
  studentCount,
  pendingInviteCount,
  passCount,
}: {
  roster: ReactNode;
  invites: ReactNode;
  passes: ReactNode;
  studentCount: number;
  pendingInviteCount: number;
  passCount: number;
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
        <TabsTrigger value="passes" className="gap-1.5">
          <Ticket className="h-4 w-4" />
          Access passes
          {passCount > 0 ? (
            <span className="ml-1 rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
              {passCount}
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
      <TabsContent value="passes" className="mt-6 space-y-6">
        {passes}
      </TabsContent>
    </Tabs>
  );
}
