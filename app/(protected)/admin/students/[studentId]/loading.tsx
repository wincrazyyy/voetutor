import { ProfileSkeleton } from "@/components/loading/page-skeletons";

export default function Loading() {
  return (
    <div className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto max-w-3xl mx-auto w-full">
      <ProfileSkeleton />
    </div>
  );
}
