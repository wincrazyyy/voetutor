"use client";

import { useState } from "react";
import { useRouter } from "nextjs-toploader/app";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
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
import { PasswordRequirements } from "@/components/auth/password-requirements";
import { validatePassword } from "@/lib/utils/password";

/**
 * First-sign-in password form for educator-provisioned accounts. Sets the user's own password via
 * supabase.auth.updateUser, then clears profiles.must_change_password with the browser client (an
 * RLS-only self-UPDATE, per the documented convention). If the flag-clear fails after the password
 * change succeeded, the proxy re-gates the user here and the next successful submit self-heals.
 * After the flag clears it also best-effort calls the consume_own_setup_tokens RPC, stamping
 * consumed_at on every outstanding setup link to this account so /welcome links die permanently,
 * independent of the mutable flag; a failure there never blocks the redirect.
 */
export function SetPasswordForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Your session has expired. Please sign in again.");

      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      const { error: clearError } = await supabase
        .from("profiles")
        .update({ must_change_password: false })
        .eq("id", user.id);
      if (clearError) throw clearError;

      /* Belt-and-braces: hard-consume every setup link to this account (consumed_at), so the
         /welcome link dies even if the flag is ever re-set. Best-effort — never blocks. */
      try {
        await supabase.rpc("consume_own_setup_tokens");
      } catch {
        /* Hardening only; the flag clear above remains the primary gate. */
      }

      /* Stay loading through the push — see login-form. */
      router.push("/dashboard");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    const supabase = createClient();
    setIsSigningOut(true);
    try {
      await supabase.auth.signOut();
      /* Stay loading through the push — see login-form. */
      router.push("/auth/login");
    } catch {
      setIsSigningOut(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Welcome to VOETutor</CardTitle>
          <CardDescription>
            Your account was set up by your educator with a temporary password. Choose your own
            password to continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="New password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {password.length > 0 && <PasswordRequirements value={password} className="mt-1" />}
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" loading={isLoading} loadingText="Saving…">
                Set password and continue
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Wrong account?{" "}
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={isSigningOut || isLoading}
                  className="relative underline underline-offset-4 outline-none after:absolute after:-inset-3 after:content-[''] hover:text-foreground"
                >
                  Sign out
                </button>
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
