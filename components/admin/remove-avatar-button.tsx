"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageOff } from "lucide-react";

import { ConfirmDeleteButton } from "@/components/shared/buttons/confirm-delete-button";
import { adminRemoveStudentAvatarAction } from "@/app/actions/admin-students";

/**
 * Admin moderation: removes a student's account avatar (clears the URL and reaps the storage
 * object). Uses the shared arm-then-confirm icon button — NOT the type-the-id modal, because
 * the student can simply re-upload. Render only when the student actually has a custom
 * avatar_url.
 */
export function RemoveAvatarButton({ studentId }: { studentId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const remove = () => {
    setError(null);
    startTransition(async () => {
      const result = await adminRemoveStudentAvatarAction(studentId);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-start gap-1.5">
      <ConfirmDeleteButton
        label="Remove avatar"
        confirmLabel="Confirm remove avatar"
        icon={ImageOff}
        pending={pending}
        onConfirm={remove}
        onArmedChange={(armed) => {
          if (armed) setError(null);
        }}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
