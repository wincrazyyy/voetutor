"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Unlink, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { unplaceNoteAction } from "@/app/actions/resources";

interface UnplaceNoteButtonProps {
  placementId: string;
  onError?: (message: string) => void;
}

/**
 * Per-row "remove from this topic/subtopic" for a placed note: removes this one
 * placement, not the library note. Two-click confirm for safety.
 */
export function UnplaceNoteButton({ placementId, onError }: UnplaceNoteButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleRemove = () => {
    startTransition(async () => {
      const result = await unplaceNoteAction(placementId);
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
        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
        onClick={() => setConfirming(true)}
        aria-label="Remove from here"
        title="Remove from here"
      >
        <Unlink className="w-3.5 h-3.5" />
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
        onClick={handleRemove}
        disabled={pending}
        aria-label="Confirm remove"
        title="Confirm remove"
      >
        <Check className="w-3.5 h-3.5" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0 text-muted-foreground"
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
