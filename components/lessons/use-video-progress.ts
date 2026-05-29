"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";

/** Throttle: persist playback state at most this often during play. */
const SAVE_INTERVAL_MS = 10_000;
/** A timeupdate jump larger than this is a seek, not watched time. */
const MAX_TICK_DELTA_SECONDS = 2;
/** Watching past this fraction of the video counts as completed. */
const COMPLETION_RATIO = 0.95;

interface UseVideoProgressOptions {
  userId: string;
  videoId: string;
  initialWatchSeconds: number;
  initialCompleted: boolean;
}

/**
 * Owns the playback-telemetry writes for a lesson. Frequent timeupdate
 * events are accumulated in refs (no re-render) and flushed to
 * user_video_progress at most once per SAVE_INTERVAL_MS, plus a final
 * flush when the page is hidden or unmounted. Writes go straight through
 * the browser Supabase client — user_video_progress RLS already gates
 * them to the signed-in user.
 */
export function useVideoProgress({
  userId,
  videoId,
  initialWatchSeconds,
  initialCompleted,
}: UseVideoProgressOptions) {
  const [supabase] = useState(() => createClient());
  const [completed, setCompleted] = useState(initialCompleted);

  const positionRef = useRef(0);
  const watchSecondsRef = useRef(initialWatchSeconds);
  const lastTickRef = useRef<number | null>(null);
  const lastSavedAtRef = useRef(0);
  const completedRef = useRef(initialCompleted);
  const completedAtRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);

  const persist = useCallback(async () => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    const row: Record<string, unknown> = {
      user_id: userId,
      video_id: videoId,
      last_position: `${Math.round(positionRef.current)} seconds`,
      total_watch_time: `${Math.round(watchSecondsRef.current)} seconds`,
      is_completed: completedRef.current,
    };
    /* Only sent when the video was completed in THIS session, so an
       earlier completion timestamp is never overwritten or cleared. */
    if (completedAtRef.current) {
      row.completed_at = completedAtRef.current;
    }
    await supabase.from("user_video_progress").upsert(row, { onConflict: "user_id,video_id" });
  }, [supabase, userId, videoId]);

  const flagComplete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    completedAtRef.current = new Date().toISOString();
    dirtyRef.current = true;
    setCompleted(true);
  }, []);

  const recordProgress = useCallback(
    (currentTime: number, duration: number) => {
      positionRef.current = currentTime;
      dirtyRef.current = true;

      const last = lastTickRef.current;
      if (last !== null) {
        const delta = currentTime - last;
        if (delta > 0 && delta < MAX_TICK_DELTA_SECONDS) {
          watchSecondsRef.current += delta;
        }
      }
      lastTickRef.current = currentTime;

      if (duration > 0 && currentTime / duration >= COMPLETION_RATIO) {
        flagComplete();
      }

      const now = Date.now();
      if (now - lastSavedAtRef.current >= SAVE_INTERVAL_MS) {
        lastSavedAtRef.current = now;
        void persist();
      }
    },
    [flagComplete, persist],
  );

  const markComplete = useCallback(() => {
    flagComplete();
    void persist();
  }, [flagComplete, persist]);

  const handleEnded = useCallback(() => {
    positionRef.current = 0;
    flagComplete();
    void persist();
  }, [flagComplete, persist]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") void persist();
    };
    const onPageHide = () => {
      void persist();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      void persist();
    };
  }, [persist]);

  return { completed, recordProgress, markComplete, handleEnded };
}
