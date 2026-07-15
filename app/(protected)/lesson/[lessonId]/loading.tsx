import { Spinner } from "@/components/ui/spinner";

export default function LessonLoading() {
  return (
    <div className="flex-1 flex flex-col lg:flex-row lg:h-full lg:overflow-hidden bg-background">
      <div className="flex-1 flex flex-col p-4 md:p-6 lg:p-8 lg:overflow-y-auto">
        <div className="w-full aspect-video bg-black rounded-2xl shadow-2xl overflow-hidden relative border-4 border-card shrink-0">
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-t from-black/60 to-transparent text-white">
            <Spinner className="w-16 h-16 text-primary/80" />
            <p className="mt-4 font-medium text-lg opacity-80 animate-pulse">Loading lesson...</p>
          </div>
        </div>

        <div className="flex items-center justify-between mt-6 shrink-0">
          <div className="h-10 w-28 rounded-full bg-muted/60 animate-pulse" />
          <div className="h-10 w-48 rounded-full bg-muted/60 animate-pulse" />
          <div className="h-10 w-28 rounded-full bg-muted/60 animate-pulse" />
        </div>
      </div>

      <aside className="w-full border-t bg-card flex flex-col lg:h-full lg:w-[400px] lg:shrink-0 lg:border-l lg:border-t-0 xl:w-[450px]">
        <div className="p-4 border-b border-border bg-card shrink-0">
          <div className="grid grid-cols-3 gap-1 bg-muted/50 p-1 rounded-md">
            <div className="h-8 rounded bg-muted/60 animate-pulse" />
            <div className="h-8 rounded bg-muted/60 animate-pulse" />
            <div className="h-8 rounded bg-muted/60 animate-pulse" />
          </div>
        </div>
        <div className="flex-1 flex flex-col lg:overflow-y-auto">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="px-4 py-3 border-b border-border/50">
              <div className="h-4 w-full rounded bg-muted/40 animate-pulse" />
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
