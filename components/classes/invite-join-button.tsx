"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { redeemInviteAction } from "@/app/actions/class-invites";

/** The signed-in "Join class" handler on the public invite landing page. The action redirects to the
 *  class on success; RPC failures (revoked/expired/used/wrong email) surface inline. */
export function InviteJoinButton({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      const result = await redeemInviteAction(token);
      if (result?.error) setError(result.error);
    });
  };

  return (
    <div className="w-full">
      <Button onClick={handleClick} disabled={pending} className="w-full gap-2">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {pending ? "Joining..." : "Join class"}
      </Button>
      {error ? <p className="mt-2 text-center text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
