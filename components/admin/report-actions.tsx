"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { actionReportAction, dismissReportAction } from "@/app/actions/class-reports";

interface ReportActionsProps {
  reportId: string;
  classIsPublished: boolean;
}

export function ReportActions({ reportId, classIsPublished }: ReportActionsProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  /* Which action is in flight so only the clicked button spins while both stay disabled. */
  const [busy, setBusy] = useState<"dismiss" | "unpublish" | null>(null);

  const handleDismiss = () => {
    setError(null);
    setBusy("dismiss");
    startTransition(async () => {
      try {
        const result = await dismissReportAction(reportId);
        if (result.error) setError(result.error);
        else router.refresh();
      } finally {
        setBusy(null);
      }
    });
  };

  const handleUnpublish = () => {
    setError(null);
    setBusy("unpublish");
    startTransition(async () => {
      try {
        const result = await actionReportAction(reportId);
        if (result.error) setError(result.error);
        else router.refresh();
      } finally {
        setBusy(null);
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={handleDismiss} loading={busy === "dismiss"} disabled={pending}>
          Dismiss
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={handleUnpublish}
          loading={busy === "unpublish"}
          disabled={pending || !classIsPublished}
          loadingText="Working…"
          title={classIsPublished ? "Unpublish class and resolve all pending reports against it" : "Class is already unpublished"}
        >
          {classIsPublished ? "Unpublish class" : "Already unpublished"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
