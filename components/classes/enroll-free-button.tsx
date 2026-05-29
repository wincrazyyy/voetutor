"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { enrollInFreeClassAction } from "@/app/actions/classes";

interface EnrollFreeButtonProps {
  classId: string;
  className?: string;
}

export function EnrollFreeButton({ classId, className }: EnrollFreeButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      const result = await enrollInFreeClassAction(classId);
      if (result?.error) setError(result.error);
    });
  };

  return (
    <div className={className}>
      <Button onClick={handleClick} disabled={pending} className="w-full">
        {pending ? "Enrolling..." : "Enrol for free"}
      </Button>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
