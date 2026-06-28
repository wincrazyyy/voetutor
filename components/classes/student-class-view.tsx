import {
  getClassEducator,
  getClassMemberCount,
  getClassVideoTotals,
} from "@/lib/queries/classes";
import { getCurriculumForClass } from "@/lib/queries/curriculum";
import { getAnnouncementsForClass } from "@/lib/queries/announcements";
import { getDisplayName, getInitials } from "@/lib/utils/format";
import type { Class } from "@/lib/types/database";

import { ClassHeader } from "@/components/classes/class-header";
import { UpNextHero } from "@/components/classes/up-next-hero";
import { ClassUpdatesFeed } from "@/components/classes/class-updates-feed";
import { CommunityBanner } from "@/components/classes/community-banner";
import { CurriculumAccordion } from "@/components/classes/curriculum-accordion";

/** The student learning view of a class (curriculum + updates + up-next). Rendered by /class/[id]. */
export async function StudentClassView({ cls, userId }: { cls: Class; userId: string }) {
  const classId = cls.id;

  const [curriculum, announcements, educator, totals, memberCount] = await Promise.all([
    getCurriculumForClass(classId, userId),
    getAnnouncementsForClass(classId, 10),
    getClassEducator(cls.educator_id),
    getClassVideoTotals(classId, userId),
    getClassMemberCount(classId),
  ]);

  const educatorName = educator
    ? getDisplayName(educator.first_name, educator.last_name, educator.display_name)
    : "Unassigned";
  const educatorInitials = educator
    ? getInitials(educator.first_name, educator.last_name, educator.display_name)
    : "—";

  const allVideos = curriculum.flatMap((topic) => [
    ...topic.videos.map((video) => ({
      id: video.id,
      title: video.title,
      duration: video.duration,
      is_completed: video.is_completed,
      topic_title: topic.title,
      subtopic_title: null as string | null,
      topic_status: topic.status,
    })),
    ...topic.subtopics.flatMap((sub) =>
      sub.videos.map((video) => ({
        id: video.id,
        title: video.title,
        duration: video.duration,
        is_completed: video.is_completed,
        topic_title: topic.title,
        subtopic_title: sub.title,
        topic_status: topic.status,
      })),
    ),
  ]);
  const nextVideo = allVideos.find((v) => !v.is_completed && v.topic_status !== "locked") ?? null;

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full space-y-8">
      <ClassHeader title={cls.title} progress={totals.progress_percent} />

      <UpNextHero video={nextVideo} classId={classId} />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        <ClassUpdatesFeed
          announcements={announcements}
          educator={{ name: educatorName, initials: educatorInitials }}
        />

        <div className="xl:col-span-5 space-y-8 sticky top-24">
          <CommunityBanner classId={classId} memberCount={memberCount} />
          <CurriculumAccordion curriculum={curriculum} classId={classId} />
        </div>
      </div>
    </div>
  );
}
