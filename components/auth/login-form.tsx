"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRouter } from "nextjs-toploader/app";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/auth/safe-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({ className, ...props }: React.ComponentPropsWithoutRef<"form">) {
  const searchParams = useSearchParams();
  /** Same-origin-guarded return path (e.g. an invite link); empty when absent or unsafe. */
  const next = safeNext(searchParams.get("next"), "");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      /* Stay loading through the push: router.push resolves immediately but the dashboard takes
         seconds to render, and clearing here would leave the button reading "Log in" the whole time.
         The component unmounts on navigation, so this never leaks. */
      router.push(next || "/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleLogin} className={cn("flex flex-col gap-6", className)} {...props}>
      <div className="grid gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="ada@example.com"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isLoading}
        />
      </div>

      <div className="grid gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link href="/auth/forgot-password" className="relative text-xs text-muted-foreground after:absolute after:-inset-3 after:content-[''] hover:text-primary hover:underline">
            Forgot password?
          </Link>
        </div>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isLoading}
        />
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full gap-2" loading={isLoading} loadingText="Signing in…">
        Log in
      </Button>

      <div className="text-center text-sm text-muted-foreground">
        New to VOETutor?{" "}
        <Link
          href={next ? `/auth/sign-up?next=${encodeURIComponent(next)}` : "/auth/sign-up"}
          className="relative text-primary font-semibold after:absolute after:-inset-3 after:content-[''] hover:underline"
        >
          Create an account
        </Link>
      </div>
    </form>
  );
}
