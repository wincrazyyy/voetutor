"use client";

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import * as tus from "tus-js-client";

import { createVideoUploadAction, deleteVideoAction } from "@/app/actions/videos";
import type { PlacementParent } from "@/lib/types/database";

/** tus chunk size — Cloudflare requires a multiple of 256 KiB; 50 MB works. */
const CHUNK_SIZE = 50 * 1024 * 1024;
/** How many uploads push bytes at once; the rest wait as "queued". */
const MAX_CONCURRENT = 3;
/** Successful jobs clear themselves from the tray after this long. */
const SUCCESS_DISMISS_MS = 6000;

export type UploadJobStatus = "queued" | "starting" | "uploading" | "success" | "error";

export interface UploadJob {
  id: string;
  fileName: string;
  title: string;
  parentLabel: string | null;
  progress: number;
  status: UploadJobStatus;
  error: string | null;
}

export interface EnqueueItem {
  file: File;
  title: string;
  description: string;
  parent?: PlacementParent | null;
  classId?: string | null;
  parentLabel?: string | null;
}

interface ManagedJob extends UploadJob {
  file: File;
  description: string;
  parent: PlacementParent | null;
  classId: string | null;
  videoId: string | null;
}

interface UploadActions {
  enqueue: (items: EnqueueItem[]) => void;
  cancel: (jobId: string) => void;
  dismiss: (jobId: string) => void;
  retry: (jobId: string) => void;
}

const UploadActionsContext = createContext<UploadActions | null>(null);
const UploadJobsContext = createContext<UploadJob[] | null>(null);

/** Stable action handlers. Safe for the upload dialog — never changes on progress. */
export function useUploadActions(): UploadActions {
  const ctx = useContext(UploadActionsContext);
  if (!ctx) throw new Error("useUploadActions must be used within UploadManagerProvider");
  return ctx;
}

/** The live job list. Re-renders on every progress tick — use only in the tray. */
export function useUploadJobs(): UploadJob[] {
  const ctx = useContext(UploadJobsContext);
  if (!ctx) throw new Error("useUploadJobs must be used within UploadManagerProvider");
  return ctx;
}

export function UploadManagerProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [jobs, setJobsState] = useState<ManagedJob[]>([]);
  const jobsRef = useRef<ManagedJob[]>([]);
  const tusByJob = useRef<Map<string, tus.Upload>>(new Map());
  const dismissTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const startJobRef = useRef<(jobId: string) => void>(() => {});

  const commit = useCallback((next: ManagedJob[]) => {
    jobsRef.current = next;
    setJobsState(next);
  }, []);

  const patch = useCallback(
    (jobId: string, updates: Partial<ManagedJob>) => {
      commit(jobsRef.current.map((job) => (job.id === jobId ? { ...job, ...updates } : job)));
    },
    [commit],
  );

  const remove = useCallback(
    (jobId: string) => {
      commit(jobsRef.current.filter((job) => job.id !== jobId));
    },
    [commit],
  );

  const scheduleDismiss = useCallback(
    (jobId: string) => {
      const existing = dismissTimers.current.get(jobId);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        dismissTimers.current.delete(jobId);
        remove(jobId);
      }, SUCCESS_DISMISS_MS);
      dismissTimers.current.set(jobId, timer);
    },
    [remove],
  );

  /** Start as many queued jobs as free concurrency slots allow. */
  const pump = useCallback(() => {
    const active = jobsRef.current.filter(
      (job) => job.status === "starting" || job.status === "uploading",
    ).length;
    let slots = MAX_CONCURRENT - active;
    if (slots <= 0) return;
    for (const job of jobsRef.current) {
      if (slots <= 0) break;
      if (job.status === "queued") {
        slots -= 1;
        startJobRef.current(job.id);
      }
    }
  }, []);

  const startJob = useCallback(
    async (jobId: string) => {
      const job = jobsRef.current.find((candidate) => candidate.id === jobId);
      if (!job) return;
      patch(jobId, { status: "starting", error: null, progress: 0 });

      let result;
      try {
        result = await createVideoUploadAction({
          parent: job.parent,
          title: job.title,
          description: job.description,
          fileSizeBytes: job.file.size,
        });
      } catch {
        patch(jobId, { status: "error", error: "Could not reach the server. Please retry." });
        pump();
        return;
      }

      /* The job may have been cancelled while the upload URL was being minted. */
      if (!jobsRef.current.some((candidate) => candidate.id === jobId)) {
        if (result.videoId) void deleteVideoAction(result.videoId);
        return;
      }

      if (result.error || !result.uploadUrl || !result.videoId) {
        patch(jobId, { status: "error", error: result.error ?? "Could not start the upload." });
        pump();
        return;
      }

      patch(jobId, { status: "uploading", videoId: result.videoId, progress: 0 });

      const upload = new tus.Upload(job.file, {
        uploadUrl: result.uploadUrl,
        chunkSize: CHUNK_SIZE,
        metadata: { name: job.file.name, filetype: job.file.type },
        onProgress: (sent, total) => {
          patch(jobId, { progress: total > 0 ? Math.round((sent / total) * 100) : 0 });
        },
        onError: () => {
          tusByJob.current.delete(jobId);
          const current = jobsRef.current.find((candidate) => candidate.id === jobId);
          if (current?.videoId) void deleteVideoAction(current.videoId);
          patch(jobId, { status: "error", error: "The upload failed. Please retry.", videoId: null });
          pump();
        },
        onSuccess: () => {
          tusByJob.current.delete(jobId);
          patch(jobId, { status: "success", progress: 100 });
          router.refresh();
          scheduleDismiss(jobId);
          pump();
        },
      });
      tusByJob.current.set(jobId, upload);
      upload.start();
    },
    [patch, pump, router, scheduleDismiss],
  );

  useEffect(() => {
    startJobRef.current = startJob;
  }, [startJob]);

  useEffect(() => {
    const uploads = tusByJob.current;
    const timers = dismissTimers.current;
    return () => {
      uploads.forEach((upload) => void upload.abort(true));
      uploads.clear();
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  /* In-app navigation is safe — the provider lives at the authenticated-app
     root and stays mounted. A full reload or tab close, though, destroys the
     in-memory queue and aborts the live byte transfers, which cannot resume.
     Warn while any job is still in flight so a stray refresh can't lose them. */
  const hasActiveJobs = jobs.some(
    (job) => job.status === "queued" || job.status === "starting" || job.status === "uploading",
  );
  useEffect(() => {
    if (!hasActiveJobs) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasActiveJobs]);

  const enqueue = useCallback(
    (items: EnqueueItem[]) => {
      const newJobs: ManagedJob[] = items.map((item) => ({
        id: crypto.randomUUID(),
        fileName: item.file.name,
        title: item.title,
        parentLabel: item.parentLabel ?? null,
        progress: 0,
        status: "queued",
        error: null,
        file: item.file,
        description: item.description,
        parent: item.parent ?? null,
        classId: item.classId ?? null,
        videoId: null,
      }));
      commit([...jobsRef.current, ...newJobs]);
      pump();
    },
    [commit, pump],
  );

  const cancel = useCallback(
    (jobId: string) => {
      const job = jobsRef.current.find((candidate) => candidate.id === jobId);
      if (!job) return;
      const upload = tusByJob.current.get(jobId);
      if (upload) {
        void upload.abort(true);
        tusByJob.current.delete(jobId);
      }
      const timer = dismissTimers.current.get(jobId);
      if (timer) {
        clearTimeout(timer);
        dismissTimers.current.delete(jobId);
      }
      if (job.videoId) void deleteVideoAction(job.videoId);
      remove(jobId);
      pump();
    },
    [remove, pump],
  );

  const dismiss = useCallback(
    (jobId: string) => {
      const timer = dismissTimers.current.get(jobId);
      if (timer) {
        clearTimeout(timer);
        dismissTimers.current.delete(jobId);
      }
      remove(jobId);
    },
    [remove],
  );

  const retry = useCallback(
    (jobId: string) => {
      /* Only errored jobs are re-queueable. Guarding the status here makes a
         double-click on Retry a no-op instead of launching the job twice. */
      const job = jobsRef.current.find((candidate) => candidate.id === jobId);
      if (!job || job.status !== "error") return;
      patch(jobId, { status: "queued", progress: 0, error: null, videoId: null });
      pump();
    },
    [patch, pump],
  );

  const actions = useMemo<UploadActions>(
    () => ({ enqueue, cancel, dismiss, retry }),
    [enqueue, cancel, dismiss, retry],
  );

  return (
    <UploadActionsContext.Provider value={actions}>
      <UploadJobsContext.Provider value={jobs}>{children}</UploadJobsContext.Provider>
    </UploadActionsContext.Provider>
  );
}
