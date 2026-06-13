"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RoleSelector, type SignUpRole } from "@/components/auth/role-selector";
import { PasswordRequirements } from "@/components/auth/password-requirements";
import { validatePassword } from "@/lib/utils/password";

export function SignUpForm({ className, ...props }: React.ComponentPropsWithoutRef<"form">) {
  const [role, setRole] = useState<SignUpRole>("student");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== repeatPassword) {
      setError("Passwords do not match.");
      return;
    }
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setIsLoading(true);
    try {
      const supabase = createClient();
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
            display_name: `${firstName} ${lastName}`.trim(),
            intended_role: role,
          },
        },
      });
      if (signUpError) throw signUpError;
      router.push(`/auth/verify?email=${encodeURIComponent(email)}&intent=${role}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong while creating your account.");
    } finally {
      setIsLoading(false);
    }
  };

  const isEducator = role === "educator";
  const submitLabel = "Create account";

  return (
    <form onSubmit={handleSignUp} className={cn("flex flex-col gap-6", className)} {...props}>
      <fieldset className="space-y-3" disabled={isLoading}>
        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">I am signing up as</Label>
        <RoleSelector value={role} onChange={setRole} disabled={isLoading} />
        {isEducator && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            After verifying your email, your account will sit in a pending state until an administrator approves it. You&apos;ll see a short notice page in the meantime.
          </p>
        )}
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="first-name">First name</Label>
          <Input
            id="first-name"
            type="text"
            placeholder="Ada"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            disabled={isLoading}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="last-name">Last name</Label>
          <Input
            id="last-name"
            type="text"
            placeholder="Lovelace"
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            disabled={isLoading}
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="ada@example.com"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isLoading}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="repeat-password">Confirm password</Label>
          <Input
            id="repeat-password"
            type="password"
            required
            minLength={8}
            value={repeatPassword}
            onChange={(e) => setRepeatPassword(e.target.value)}
            disabled={isLoading}
          />
        </div>
      </div>

      {password.length > 0 && <PasswordRequirements value={password} />}

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full gap-2" disabled={isLoading}>
        {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
        {isLoading ? "Creating your account..." : submitLabel}
      </Button>

      <p className="text-xs text-muted-foreground text-center leading-relaxed">
        By creating an account you agree to use WSPortal in line with the platform terms. We&apos;ll never share your details.
      </p>

      <div className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/auth/login" className="text-primary font-semibold hover:underline">
          Log in
        </Link>
      </div>
    </form>
  );
}
