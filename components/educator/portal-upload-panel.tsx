"use client";

import { AlertTriangle, CheckCircle2, Clock, RotateCcw, UploadCloud, X } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
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
  return <Spinner className="w-4 h-4 text-primary shrink-0" />;
}

function UploadRow({
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
          {job.parentLabel && (
            <p className="text-[11px] text-muted-foreground truncate">→ {job.parentLabel}</p>
          )}
        </div>
        {job.status === "error" ? (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onRetry}
              aria-label="Retry upload"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground sm:size-4"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground sm:size-4"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={job.status === "success" ? onDismiss : onCancel}
            aria-label={job.status === "success" ? "Dismiss" : "Cancel upload"}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground sm:size-4"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {inFlight && (
        <div className="flex items-center gap-2">
          <Progress value={job.progress} className="h-1.5 flex-1" />
          <span className="w-9 text-right text-[11px] text-muted-foreground sm:w-8 sm:text-[10px]">{job.progress}%</span>
        </div>
      )}
      {job.status === "queued" && <p className="text-[11px] text-muted-foreground">Queued</p>}
      {job.status === "success" && <p className="text-[11px] text-primary">Uploaded — processing</p>}
      {job.status === "error" && job.error && (
        <p className="text-[11px] text-destructive break-words sm:truncate">{job.error}</p>
      )}
    </div>
  );
}

/**
 * In-page uploads panel for the portal. Replaces the floating tray — the same
 * live job list (queued / uploading / done / failed) rendered inline so it's
 * visible while managing the library. Hidden entirely when there are no jobs.
 */
export function PortalUploadPanel() {
  const jobs = useUploadJobs();
  const { cancel, dismiss, retry } = useUploadActions();

  if (jobs.length === 0) return null;

  const active = jobs.filter(
    (job) => job.status === "uploading" || job.status === "starting" || job.status === "queued",
  ).length;
  const headerLabel =
    active > 0 ? `Uploading ${active} video${active === 1 ? "" : "s"}` : "Uploads complete";

  return (
    <Card className="border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 bg-muted/40 px-4 py-2.5 border-b border-border">
        <UploadCloud className="w-4 h-4 text-primary shrink-0" />
        <span className="text-sm font-semibold truncate">{headerLabel}</span>
      </div>
      <div className="max-h-80 overflow-y-auto divide-y divide-border/60">
        {jobs.map((job) => (
          <UploadRow
            key={job.id}
            job={job}
            onCancel={() => cancel(job.id)}
            onDismiss={() => dismiss(job.id)}
            onRetry={() => retry(job.id)}
          />
        ))}
      </div>
    </Card>
  );
}
