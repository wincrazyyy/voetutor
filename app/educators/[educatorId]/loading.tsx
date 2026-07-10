import { ProfileSkeleton } from "@/components/loading/page-skeletons";

export default function EducatorProfileLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-12">
      <ProfileSkeleton />
    </div>
  );
}
