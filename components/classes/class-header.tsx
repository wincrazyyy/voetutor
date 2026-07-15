import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface ClassHeaderProps {
  title: string;
  progress: number;
}

export function ClassHeader({ title, progress }: ClassHeaderProps) {
  return (
    <div>
      <Link href="/dashboard">
        <Button variant="ghost" size="sm" className="mb-6 gap-2 text-muted-foreground hover:text-foreground -ml-2">
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Button>
      </Link>

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold tracking-tight break-words sm:text-3xl">{title}</h1>
          </div>
          <p className="text-muted-foreground">
            Your centralized dashboard for curriculum, progress, and educator updates.
          </p>
        </div>
        <div className="w-full md:w-72 bg-card p-4 rounded-xl border border-border shadow-sm">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-semibold">Overall Progress</span>
            <span className="text-sm font-bold text-primary">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      </div>
    </div>
  );
}
