"use client";

import type { ReactNode } from "react";
import { BarChart3, BookOpen, User } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface EducatorHudTabsProps {
  statistics: ReactNode;
  classes: ReactNode;
  personal: ReactNode;
}

/**
 * Tabbed container for the heavy reference sections of the admin educator HUD. The sections are
 * server components rendered by the page and passed in as ReactNode props, so this client wrapper
 * only owns the tab state. Default tab is Statistics.
 */
export function EducatorHudTabs({ statistics, classes, personal }: EducatorHudTabsProps) {
  return (
    <Tabs defaultValue="statistics" className="w-full">
      <TabsList className="w-full sm:w-fit">
        <TabsTrigger value="statistics" className="px-3">
          <BarChart3 className="h-4 w-4" aria-hidden />
          Statistics
        </TabsTrigger>
        <TabsTrigger value="classes" className="px-3">
          <BookOpen className="h-4 w-4" aria-hidden />
          Classes
        </TabsTrigger>
        <TabsTrigger value="personal" className="px-3">
          <User className="h-4 w-4" aria-hidden />
          Personal info
        </TabsTrigger>
      </TabsList>
      <TabsContent value="statistics">{statistics}</TabsContent>
      <TabsContent value="classes">{classes}</TabsContent>
      <TabsContent value="personal">{personal}</TabsContent>
    </Tabs>
  );
}
