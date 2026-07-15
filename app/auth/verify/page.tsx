"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/auth/safe-next";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function VerifyForm() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const next = safeNext(searchParams.get("next"), "/dashboard");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError("Email is missing. Please try signing up again.");
      return;
    }

    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: "signup",
      });
      
      if (error) throw error;
      router.push(next);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl">Check your email</CardTitle>
        <CardDescription>
          We sent a verification code to <strong>{email}</strong>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleVerify} className="flex flex-col gap-6">
          <div className="grid gap-2">
            <Label htmlFor="token">Verification Code</Label>
            <Input
              id="token"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              enterKeyHint="done"
              placeholder="Enter 6-digit code"
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="text-center font-mono text-lg tracking-[0.5em] placeholder:text-sm placeholder:tracking-normal sm:placeholder:text-lg sm:placeholder:tracking-[0.5em]"
              maxLength={6}
            />
          </div>
          
          {error && <p className="text-sm text-red-500 text-center">{error}</p>}
          <Button type="submit" className="w-full" disabled={isLoading || token.length < 6}>
            {isLoading ? "Verifying..." : "Verify Account"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function VerifyPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <Suspense fallback={<div className="text-muted-foreground">Loading...</div>}>
        <VerifyForm />
      </Suspense>
    </div>
  );
}
