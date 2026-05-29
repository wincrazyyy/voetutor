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

  const handleDismiss = () => {
    setError(null);
    startTransition(async () => {
      const result = await dismissReportAction(reportId);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  };

  const handleUnpublish = () => {
    setError(null);
    startTransition(async () => {
      const result = await actionReportAction(reportId);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={handleDismiss} disabled={pending}>
          Dismiss
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={handleUnpublish}
          disabled={pending || !classIsPublished}
          title={classIsPublished ? "Unpublish class and resolve all pending reports against it" : "Class is already unpublished"}
        >
          {pending ? "Working..." : classIsPublished ? "Unpublish Class" : "Already Unpublished"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
