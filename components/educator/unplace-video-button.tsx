"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Unlink, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { unplaceVideoAction } from "@/app/actions/videos";

interface UnplaceVideoButtonProps {
  placementId: string;
  onError?: (message: string) => void;
}

/**
 * Per-row "remove from subtopic" for the curriculum board: removes this one
 * placement (not the library video). A two-click confirm guards it because, if
 * it's the video's last placement in the class, the action also clears that
 * class's dependent Q&A.
 */
export function UnplaceVideoButton({ placementId, onError }: UnplaceVideoButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleRemove = () => {
    startTransition(async () => {
      const result = await unplaceVideoAction(placementId);
      if (result?.error) {
        onError?.(result.error);
        setConfirming(false);
        return;
      }
      router.refresh();
    });
  };

  if (!confirming) {
    return (
      <Button
        size="sm"
        variant="ghost"
        className="h-10 w-10 p-0 text-muted-foreground hover:text-destructive sm:h-7 sm:w-7"
        onClick={() => setConfirming(true)}
        aria-label="Remove from subtopic"
        title="Remove from subtopic"
      >
        <Unlink className="w-3.5 h-3.5" />
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 sm:gap-0.5">
      <Button
        size="sm"
        variant="ghost"
        className="h-10 w-10 p-0 text-destructive hover:text-destructive sm:h-7 sm:w-7"
        onClick={handleRemove}
        loading={pending}
        loadingText={null}
        aria-label="Confirm remove from subtopic"
        title="Confirm remove"
      >
        <Check className="w-3.5 h-3.5" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-10 w-10 p-0 text-muted-foreground sm:h-7 sm:w-7"
        onClick={() => setConfirming(false)}
        disabled={pending}
        aria-label="Cancel"
        title="Cancel"
      >
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
