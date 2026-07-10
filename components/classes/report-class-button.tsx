"use client";

import { useState, useTransition } from "react";
import { Flag, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { reportClassAction } from "@/app/actions/class-reports";

interface ReportClassButtonProps {
  classId: string;
}

export function ReportClassButton({ classId }: ReportClassButtonProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setReason("");
    setError(null);
    setSubmitted(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await reportClassAction(classId, reason);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSubmitted(true);
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
        title="Report this class"
      >
        <Flag className="w-3 h-3" />
        Report
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card shadow-lg p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <Flag className="w-5 h-5 text-destructive" />
            <h2 className="text-lg font-bold">Report this class</h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {submitted ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Thanks — an admin will review this class soon.
            </p>
            <div className="flex justify-end">
              <Button onClick={() => setOpen(false)}>Close</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-2">
              <label htmlFor="report-reason" className="text-sm font-semibold">
                What&apos;s wrong with this class?
              </label>
              <textarea
                id="report-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={5}
                required
                maxLength={1000}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
                placeholder="Misleading title, inappropriate content, suspected scam, etc."
              />
              <p className="text-xs text-muted-foreground">
                Reports are visible to platform admins only.
              </p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" loading={pending} loadingText="Submitting..." disabled={reason.trim().length === 0}>
                Submit Report
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
