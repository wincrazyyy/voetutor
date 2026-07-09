"use client";

import type { ReactNode } from "react";
import { ClipboardList, Users } from "lucide-react";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

/**
 * Client tabs shell for the class settings page. The server page keeps all guards + data-fetching and
 * passes its server-rendered Settings JSX in as the `settings` slot and <ManageStudents/> as `students`
 * (server children into a client component is fine).
 */
export function ClassSettingsTabs({
  settings,
  students,
  studentCount,
}: {
  settings: ReactNode;
  students: ReactNode;
  studentCount: number;
}) {
  return (
    <Tabs defaultValue="settings" className="w-full">
      <TabsList>
        <TabsTrigger value="settings" className="gap-1.5">
          <ClipboardList className="h-4 w-4" />
          Settings
        </TabsTrigger>
        <TabsTrigger value="students" className="gap-1.5">
          <Users className="h-4 w-4" />
          Students
          <span className="ml-1 rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
            {studentCount}
          </span>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="settings" className="mt-6 space-y-6">
        {settings}
      </TabsContent>
      <TabsContent value="students" className="mt-6">
        {students}
      </TabsContent>
    </Tabs>
  );
}
