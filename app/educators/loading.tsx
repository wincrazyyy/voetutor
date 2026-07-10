import { PageHeaderSkeleton, CardGridSkeleton } from "@/components/loading/page-skeletons";

export default function EducatorsLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-5 py-12 md:py-16">
      <PageHeaderSkeleton />
      <CardGridSkeleton />
    </div>
  );
}
