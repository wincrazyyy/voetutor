import { redirect } from "next/navigation";
import { Film } from "lucide-react";

import { getCurrentProfile } from "@/lib/queries/profile";
import { getVideoLibrary, getEducatorPlacementTree } from "@/lib/queries/video-library";
import { VideoLibraryList } from "@/components/educator/video-library-list";
import { PortalUploadButton } from "@/components/educator/portal-upload-button";
import { PortalUploadPanel } from "@/components/educator/portal-upload-panel";

export default async function EducatorVideosPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");
  if (profile.role === "educator" && !profile.is_approved) redirect("/pending");
  if (profile.role !== "educator" && profile.role !== "admin") redirect("/dashboard");

  const [videos, tree] = await Promise.all([
    getVideoLibrary(profile.id),
    getEducatorPlacementTree(profile.id),
  ]);

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-2">
            <Film className="w-7 h-7 text-primary" />
            Video Library
          </h1>
          <p className="text-muted-foreground">
            Upload teaching videos once, then place them into any of your classes — the same video
            can live in more than one.
          </p>
        </div>
        <PortalUploadButton />
      </div>

      <PortalUploadPanel />

      <VideoLibraryList videos={videos} tree={tree} />
    </div>
  );
}
