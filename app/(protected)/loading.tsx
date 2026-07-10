import { PageHeaderSkeleton, ListSkeleton } from "@/components/loading/page-skeletons";

export default function ProtectedLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-6 md:p-8">
      <PageHeaderSkeleton />
      <ListSkeleton />
    </div>
  );
}
