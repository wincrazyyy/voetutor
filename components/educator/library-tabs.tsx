"use client";

import { FileText, Film } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VideoLibraryList } from "@/components/educator/video-library-list";
import { NoteLibraryList } from "@/components/educator/note-library-list";
import { PortalUploadButton } from "@/components/educator/portal-upload-button";
import { PortalUploadPanel } from "@/components/educator/portal-upload-panel";
import { NoteUploadDialog } from "@/components/educator/note-upload-dialog";
import type { LibraryVideo, PlacementTreeClass } from "@/lib/queries/video-library";
import type { LibraryNote } from "@/lib/queries/note-library";

interface LibraryTabsProps {
  videos: LibraryVideo[];
  notes: LibraryNote[];
  tree: PlacementTreeClass[];
}

/**
 * The unified Content Library: Videos | Notes tabs over the two owner-owned libraries. Both share the
 * same chrome (upload entry, search, placement chips, assign dialog, delete).
 */
export function LibraryTabs({ videos, notes, tree }: LibraryTabsProps) {
  return (
    <Tabs defaultValue="videos" className="w-full gap-6">
      <TabsList>
        <TabsTrigger value="videos">
          <Film className="w-4 h-4" />
          Videos
        </TabsTrigger>
        <TabsTrigger value="notes">
          <FileText className="w-4 h-4" />
          Notes
        </TabsTrigger>
      </TabsList>

      <TabsContent value="videos" className="space-y-6">
        <div className="flex justify-end">
          <PortalUploadButton />
        </div>
        <PortalUploadPanel />
        <VideoLibraryList videos={videos} tree={tree} />
      </TabsContent>

      <TabsContent value="notes" className="space-y-6">
        <div className="flex justify-end">
          <NoteUploadDialog buttonLabel="Upload note" />
        </div>
        <NoteLibraryList notes={notes} tree={tree} />
      </TabsContent>
    </Tabs>
  );
}
