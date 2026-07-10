"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { setClassPublishedAction } from "@/app/actions/classes";

interface PublishToggleProps {
  classId: string;
  isPublished: boolean;
}

export function PublishToggle({ classId, isPublished }: PublishToggleProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleToggle = () => {
    setError(null);
    startTransition(async () => {
      const result = await setClassPublishedAction(classId, !isPublished);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        variant={isPublished ? "outline" : "default"}
        size="sm"
        onClick={handleToggle}
        loading={pending}
        loadingText="Working…"
      >
        {isPublished ? "Unpublish" : "Publish to marketplace"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
