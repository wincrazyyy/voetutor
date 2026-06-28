import { Library } from "lucide-react";

import { requireEducatorPage } from "@/lib/tiers/gate";
import { getVideoLibrary, getEducatorPlacementTree } from "@/lib/queries/video-library";
import { getNoteLibrary } from "@/lib/queries/note-library";
import { LibraryTabs } from "@/components/educator/library-tabs";

export default async function ContentLibraryPage() {
  const { profile } = await requireEducatorPage({ premium: true });

  const [videos, notes, tree] = await Promise.all([
    getVideoLibrary(profile.id),
    getNoteLibrary(profile.id),
    getEducatorPlacementTree(profile.id),
  ]);

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-2">
          <Library className="w-7 h-7 text-primary" />
          Content Library
        </h1>
        <p className="text-muted-foreground">
          Upload videos and PDF notes once, then place them into any of your classes — the same item
          can live in more than one topic or subtopic.
        </p>
      </div>

      <LibraryTabs videos={videos} notes={notes} tree={tree} />
    </div>
  );
}
