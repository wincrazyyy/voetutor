"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { markAnnouncementsReadAction } from "@/app/actions/announcements";

/**
 * Invisible "mark as read on view" hook. Given the ids the current user hasn't read yet, it records read
 * receipts once on mount and refreshes so the unread/"new" affordances clear. No-op when there's nothing
 * unread, so it never loops (after the refresh the list is empty).
 */
export function MarkAnnouncementsRead({ unreadIds }: { unreadIds: string[] }) {
  const router = useRouter();
  const done = useRef(false);

  useEffect(() => {
    if (done.current || unreadIds.length === 0) return;
    done.current = true;
    (async () => {
      const res = await markAnnouncementsReadAction(unreadIds);
      if (!res.error) router.refresh();
    })();
  }, [unreadIds, router]);

  return null;
}
