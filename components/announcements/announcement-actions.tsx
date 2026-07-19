"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDeleteButton } from "@/components/shared/buttons/confirm-delete-button";
import { deleteAnnouncementAction } from "@/app/actions/announcements";

interface AnnouncementActionsProps {
  classId: string;
  announcementId: string;
  size?: "sm" | "xs";
}

export function AnnouncementActions({ classId, announcementId, size = "sm" }: AnnouncementActionsProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const doDelete = () => {
    setError(null);
    startTransition(async () => {
      const res = await deleteAnnouncementAction(classId, announcementId);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <Button variant="ghost" size={size} className="text-muted-foreground" asChild>
        <Link href={`/class/${classId}/announce/${announcementId}/edit`}>
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </Link>
      </Button>
      <ConfirmDeleteButton
        label="Delete announcement"
        size={size === "xs" ? "icon-xs" : "icon-sm"}
        pending={pending}
        onConfirm={doDelete}
      />
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
