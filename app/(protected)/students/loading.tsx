import { ListSkeleton, PageHeaderSkeleton } from "@/components/loading/page-skeletons";

export default function Loading() {
  return (
    <div className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto max-w-5xl mx-auto w-full space-y-8">
      <PageHeaderSkeleton />
      <ListSkeleton count={6} />
    </div>
  );
}
