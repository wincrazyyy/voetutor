import { ClassPageSkeleton } from "@/components/loading/page-skeletons";

export default function ClassLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 md:p-8">
      <ClassPageSkeleton />
    </div>
  );
}
