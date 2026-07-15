"use client";

import { useState, useTransition } from "react";
import { ArrowBigUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { togglePostUpvoteAction, toggleReplyUpvoteAction } from "@/app/actions/forum";

interface ForumUpvoteButtonProps {
  classId: string;
  postId: string;
  /** When present the vote targets a reply; otherwise the post. */
  replyId?: string;
  initialCount: number;
  initialUpvoted: boolean;
  size?: "sm" | "md";
}

export function ForumUpvoteButton({
  classId,
  postId,
  replyId,
  initialCount,
  initialUpvoted,
  size = "md",
}: ForumUpvoteButtonProps) {
  const [count, setCount] = useState(initialCount);
  const [upvoted, setUpvoted] = useState(initialUpvoted);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    if (pending) return;
    const next = !upvoted;
    setUpvoted(next);
    setCount((c) => Math.max(0, c + (next ? 1 : -1)));
    startTransition(async () => {
      const res = replyId
        ? await toggleReplyUpvoteAction(classId, postId, replyId)
        : await togglePostUpvoteAction(classId, postId);
      if (res.error || typeof res.upvoted !== "boolean") {
        setUpvoted(!next);
        setCount((c) => Math.max(0, c + (next ? -1 : 1)));
      }
    });
  };

  const iconSize = size === "sm" ? "w-4 h-4" : "w-5 h-5";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={upvoted}
      aria-label={upvoted ? "Remove upvote" : "Upvote"}
      className={cn(
        "flex shrink-0 flex-col items-center justify-center rounded-md transition-colors",
        size === "sm" ? "size-10 gap-0 sm:h-auto sm:w-auto sm:px-1.5 sm:py-0.5" : "w-11 gap-0.5 px-2 py-1.5 sm:w-auto",
        upvoted ? "text-primary bg-primary/10" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <ArrowBigUp className={cn(iconSize, upvoted && "fill-primary/20")} />
      <span className={cn("font-bold tabular-nums", size === "sm" ? "text-[11px]" : "text-xs")}>{count}</span>
    </button>
  );
}
