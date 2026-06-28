"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

interface RealtimeSubscription {
  table: string;
  /** Optional postgres-changes filter, e.g. `class_id=eq.<uuid>`. */
  filter?: string;
}

interface TableRefreshProps {
  /** Unique Supabase channel name for this mount. */
  channel: string;
  subscriptions: RealtimeSubscription[];
}

/**
 * Generic invisible live-refresh: opens a Supabase Realtime channel for the given table subscriptions and
 * calls a debounced router.refresh() on any change, so server-rendered data (and the sidebar) updates
 * without a manual reload. Respects RLS (the browser session JWT) and fails soft — if the table isn't in
 * the `supabase_realtime` publication the channel just never fires. (The forum has its own `forum-realtime`;
 * consolidating it onto this is a noted follow-up.)
 */
export function TableRefresh({ channel, subscriptions }: TableRefreshProps) {
  const router = useRouter();
  const key = JSON.stringify(subscriptions);

  useEffect(() => {
    const subs = JSON.parse(key) as RealtimeSubscription[];
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    };

    const ch = supabase.channel(channel);
    for (const sub of subs) {
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: sub.table, ...(sub.filter ? { filter: sub.filter } : {}) },
        refresh,
      );
    }
    ch.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(ch);
    };
  }, [channel, key, router]);

  return null;
}
