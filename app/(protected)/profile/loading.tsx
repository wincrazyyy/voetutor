import { ProfileSkeleton } from "@/components/loading/page-skeletons";

export default function ProfileLoading() {
  return (
    <div className="mx-auto w-full max-w-4xl p-4 sm:p-6 md:p-8">
      <ProfileSkeleton />
    </div>
  );
}
