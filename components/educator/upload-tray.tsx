"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  RotateCcw,
  UploadCloud,
  X,
} from "lucide-react";

import { Progress } from "@/components/ui/progress";
import {
  type UploadJob,
  type UploadJobStatus,
  useUploadActions,
  useUploadJobs,
} from "@/components/educator/upload-manager";

function StatusIcon({ status }: { status: UploadJobStatus }) {
  if (status === "success") return <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />;
  if (status === "error") return <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />;
  if (status === "queued") return <Clock className="w-4 h-4 text-muted-foreground shrink-0" />;
  return <Loader2 className="w-4 h-4 text-primary shrink-0 animate-spin" />;
}

function UploadTrayRow({
  job,
  onCancel,
  onDismiss,
  onRetry,
}: {
  job: UploadJob;
  onCancel: () => void;
  onDismiss: () => void;
  onRetry: () => void;
}) {
  const inFlight = job.status === "uploading" || job.status === "starting";

  return (
    <div className="px-4 py-3 flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <StatusIcon status={job.status} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{job.title || job.fileName}</p>
          {job.subtopicLabel && (
            <p className="text-[11px] text-muted-foreground truncate">→ {job.subtopicLabel}</p>
          )}
        </div>
        {job.status === "error" ? (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onRetry}
              aria-label="Retry upload"
              className="text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={job.status === "success" ? onDismiss : onCancel}
            aria-label={job.status === "success" ? "Dismiss" : "Cancel upload"}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {inFlight && (
        <div className="flex items-center gap-2">
          <Progress value={job.progress} className="h-1.5 flex-1" />
          <span className="text-[10px] text-muted-foreground w-8 text-right">{job.progress}%</span>
        </div>
      )}
      {job.status === "queued" && <p className="text-[11px] text-muted-foreground">Queued</p>}
      {job.status === "success" && <p className="text-[11px] text-primary">Uploaded — processing</p>}
      {job.status === "error" && job.error && (
        <p className="text-[11px] text-destructive truncate">{job.error}</p>
      )}
    </div>
  );
}

export function UploadTray() {
  const jobs = useUploadJobs();
  const { cancel, dismiss, retry } = useUploadActions();
  const [collapsed, setCollapsed] = useState(false);

  if (jobs.length === 0) return null;

  const active = jobs.filter(
    (job) => job.status === "uploading" || job.status === "starting" || job.status === "queued",
  ).length;
  const headerLabel =
    active > 0 ? `Uploading ${active} video${active === 1 ? "" : "s"}` : "Uploads complete";

  return (
    <div className="fixed bottom-4 right-4 z-40 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card shadow-xl overflow-hidden">
      <div className="flex items-center justify-between gap-2 bg-muted/40 px-4 py-2.5 border-b border-border">
        <span className="text-sm font-semibold flex items-center gap-2 min-w-0">
          <UploadCloud className="w-4 h-4 text-primary shrink-0" />
          <span className="truncate">{headerLabel}</span>
        </span>
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? "Expand uploads" : "Collapse uploads"}
          className="text-muted-foreground hover:text-foreground shrink-0"
        >
          {collapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {!collapsed && (
        <div className="max-h-80 overflow-y-auto divide-y divide-border/60">
          {jobs.map((job) => (
            <UploadTrayRow
              key={job.id}
              job={job}
              onCancel={() => cancel(job.id)}
              onDismiss={() => dismiss(job.id)}
              onRetry={() => retry(job.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
