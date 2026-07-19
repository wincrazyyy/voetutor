"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { ConfirmDeleteButton } from "@/components/shared/buttons/confirm-delete-button";
import { deleteSubtopicAction, deleteTopicAction } from "@/app/actions/curriculum";

interface DeleteCurriculumItemButtonProps {
  kind: "topic" | "subtopic";
  itemId: string;
  classId: string;
  name: string;
  /** Human-readable summary of what cascades, e.g. "2 subtopics and 5 videos". */
  summary?: string;
  /** Surfaces action failures in the board's error banner. */
  onError?: (message: string) => void;
}

/**
 * Topic/subtopic delete on the curriculum board. Arm-then-confirm (tier 1) — the cascade
 * summary rides in the armed tooltip/aria name. Library videos/notes placed elsewhere
 * survive; only fully-orphaned items are GC'd by the action.
 */
export function DeleteCurriculumItemButton({
  kind,
  itemId,
  classId,
  name,
  summary,
  onError,
}: DeleteCurriculumItemButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      const result =
        kind === "topic"
          ? await deleteTopicAction(itemId, classId)
          : await deleteSubtopicAction(itemId, classId);
      if (result?.error) {
        onError?.(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <ConfirmDeleteButton
      label={`Delete ${kind}`}
      confirmLabel={
        summary
          ? `Permanently delete ${name} — removes ${summary}, including the underlying video files`
          : `Permanently delete ${name}`
      }
      size="icon"
      className="sm:size-10 xl:size-7"
      pending={pending}
      onConfirm={handleDelete}
    />
  );
}
