import { PageHeaderSkeleton, CardGridSkeleton } from "@/components/loading/page-skeletons";

export default function ClassesLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-6 md:p-8">
      <PageHeaderSkeleton />
      <CardGridSkeleton />
    </div>
  );
}
