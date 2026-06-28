"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { deleteAnnouncementAction } from "@/app/actions/announcements";

interface AnnouncementActionsProps {
  classId: string;
  announcementId: string;
  size?: "sm" | "xs";
}

export function AnnouncementActions({ classId, announcementId, size = "sm" }: AnnouncementActionsProps) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
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
      setConfirm(false);
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size={size} className="text-muted-foreground" asChild>
        <Link href={`/class/${classId}/announce/${announcementId}/edit`}>
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </Link>
      </Button>
      {confirm ? (
        <span className="flex items-center gap-1 text-xs">
          <Button variant="ghost" size={size} className="text-destructive" onClick={doDelete} disabled={pending}>
            Delete?
          </Button>
          <Button variant="ghost" size={size} onClick={() => setConfirm(false)} disabled={pending}>
            No
          </Button>
        </span>
      ) : (
        <Button variant="ghost" size={size} className="text-muted-foreground hover:text-destructive" onClick={() => setConfirm(true)}>
          <Trash2 className="w-3.5 h-3.5" />
          Delete
        </Button>
      )}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
