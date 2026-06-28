"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

interface ForumRealtimeProps {
  classId: string;
  /** When present, subscribes to one thread (post + its replies); otherwise the whole class list. */
  postId?: string;
}

/**
 * Invisible live-update hook. Subscribes to Supabase Realtime postgres-changes on the forum tables and
 * calls router.refresh() (debounced) when something relevant changes, so new posts/replies/votes/pins
 * appear without a manual reload. Realtime respects RLS (the browser session's JWT), so a user only
 * receives changes they're allowed to see. Fails soft: if the realtime publication isn't enabled the
 * subscription simply never fires and the forum still works via normal navigation.
 */
export function ForumRealtime({ classId, postId }: ForumRealtimeProps) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    };

    const channel = supabase.channel(`forum:${postId ?? classId}`);
    if (postId) {
      channel
        .on("postgres_changes", { event: "*", schema: "public", table: "forum_posts", filter: `id=eq.${postId}` }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "forum_replies", filter: `post_id=eq.${postId}` }, refresh);
    } else {
      channel.on("postgres_changes", { event: "*", schema: "public", table: "forum_posts", filter: `class_id=eq.${classId}` }, refresh);
    }
    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [classId, postId, router]);

  return null;
}
