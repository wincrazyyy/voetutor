"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Unlink } from "lucide-react";

import { ConfirmDeleteButton } from "@/components/shared/buttons/confirm-delete-button";
import { unplaceVideoAction } from "@/app/actions/videos";

interface UnplaceVideoButtonProps {
  placementId: string;
  onError?: (message: string) => void;
}

/**
 * Per-row "remove from subtopic" for the curriculum board: removes this one
 * placement (not the library video). The shared arm-then-confirm guards it
 * because, if it's the video's last placement in the class, the action also
 * clears that class's dependent Q&A.
 */
export function UnplaceVideoButton({ placementId, onError }: UnplaceVideoButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleRemove = () => {
    startTransition(async () => {
      const result = await unplaceVideoAction(placementId);
      if (result?.error) {
        onError?.(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <ConfirmDeleteButton
      label="Remove from subtopic"
      confirmLabel="Confirm remove from subtopic"
      icon={Unlink}
      size="icon"
      className="sm:size-10 xl:size-7"
      pending={pending}
      onConfirm={handleRemove}
    />
  );
}
