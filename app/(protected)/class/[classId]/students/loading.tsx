import { PageHeaderSkeleton, ListSkeleton } from "@/components/loading/page-skeletons";

export default function ClassStudentsLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6 md:p-8">
      <PageHeaderSkeleton />
      <ListSkeleton />
    </div>
  );
}
