"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Unlink } from "lucide-react";

import { ConfirmDeleteButton } from "@/components/shared/buttons/confirm-delete-button";
import { unplaceNoteAction } from "@/app/actions/resources";

interface UnplaceNoteButtonProps {
  placementId: string;
  onError?: (message: string) => void;
}

/**
 * Per-row "remove from this topic/subtopic" for a placed note: removes this one
 * placement, not the library note. Shared arm-then-confirm for safety.
 */
export function UnplaceNoteButton({ placementId, onError }: UnplaceNoteButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleRemove = () => {
    startTransition(async () => {
      const result = await unplaceNoteAction(placementId);
      if (result?.error) {
        onError?.(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <ConfirmDeleteButton
      label="Remove from here"
      confirmLabel="Confirm remove from here"
      icon={Unlink}
      size="icon"
      className="sm:size-10 xl:size-7"
      pending={pending}
      onConfirm={handleRemove}
    />
  );
}
