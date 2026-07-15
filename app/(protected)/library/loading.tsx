import { PageHeaderSkeleton, CardGridSkeleton } from "@/components/loading/page-skeletons";

export default function LibraryLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 p-4 sm:p-6 md:p-8">
      <PageHeaderSkeleton />
      <CardGridSkeleton />
    </div>
  );
}
