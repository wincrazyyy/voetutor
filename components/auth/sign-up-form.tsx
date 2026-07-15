"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/auth/safe-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RoleSelector, type SignUpRole } from "@/components/auth/role-selector";
import { PasswordRequirements } from "@/components/auth/password-requirements";
import { validatePassword } from "@/lib/utils/password";

export function SignUpForm({ className, ...props }: React.ComponentPropsWithoutRef<"form">) {
  const searchParams = useSearchParams();
  /** Same-origin-guarded return path (e.g. an invite link); empty when absent or unsafe. */
  const next = safeNext(searchParams.get("next"), "");
  /** Invite signups are always students — the role selector is hidden and the role forced. */
  const isInviteFlow = next.startsWith("/invite/");

  const [role, setRole] = useState<SignUpRole>("student");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [school, setSchool] = useState("");
  const [schoolYear, setSchoolYear] = useState("");
  const [targetGrade, setTargetGrade] = useState("");
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
      const effectiveRole: SignUpRole = isInviteFlow ? "student" : role;
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: next
            ? `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}`
            : undefined,
          data: {
            first_name: firstName,
            last_name: lastName,
            display_name: `${firstName} ${lastName}`.trim(),
            intended_role: effectiveRole,
            ...(effectiveRole === "student"
              ? {
                  whatsapp_number: whatsapp,
                  school,
                  school_year: schoolYear,
                  target_grade: targetGrade,
                }
              : {}),
          },
        },
      });
      if (signUpError) throw signUpError;
      const verifyParams = new URLSearchParams({ email, intent: effectiveRole });
      if (next) verifyParams.set("next", next);
      router.push(`/auth/verify?${verifyParams.toString()}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong while creating your account.");
    } finally {
      setIsLoading(false);
    }
  };

  const isEducator = role === "educator";
  /** Students (incl. the forced-student invite flow) provide enrolment details at sign-up. */
  const isStudent = isInviteFlow || role === "student";
  const submitLabel = "Create account";

  return (
    <form onSubmit={handleSignUp} className={cn("flex flex-col gap-6", className)} {...props}>
      {!isInviteFlow && (
        <fieldset className="space-y-3" disabled={isLoading}>
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">I am signing up as</Label>
          <RoleSelector value={role} onChange={setRole} disabled={isLoading} />
          {isEducator && (
            <p className="text-xs text-muted-foreground leading-relaxed">
              After verifying your email, your account will sit in a pending state until an administrator approves it. You&apos;ll see a short notice page in the meantime.
            </p>
          )}
        </fieldset>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="first-name">First name</Label>
          <Input
            id="first-name"
            type="text"
            autoComplete="given-name"
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
            autoComplete="family-name"
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
          inputMode="email"
          autoComplete="email"
          placeholder="ada@example.com"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isLoading}
        />
      </div>

      {isStudent && (
        <fieldset className="space-y-4 rounded-lg border border-border/70 bg-muted/20 p-4" disabled={isLoading}>
          <legend className="px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Student details
          </legend>
          <div className="grid gap-1.5">
            <Label htmlFor="whatsapp">WhatsApp number</Label>
            <Input
              id="whatsapp"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+852 1234 5678"
              required
              maxLength={50}
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              disabled={isLoading}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="school">Name of school</Label>
              <Input
                id="school"
                type="text"
                autoComplete="organization"
                placeholder="e.g. Island School"
                required
                maxLength={200}
                value={school}
                onChange={(e) => setSchool(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="school-year">School year</Label>
              <Input
                id="school-year"
                type="text"
                placeholder="e.g. Year 12 / DP1"
                required
                maxLength={60}
                value={schoolYear}
                onChange={(e) => setSchoolYear(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="target-grade">Target grade</Label>
            <Input
              id="target-grade"
              type="text"
              placeholder="e.g. 7 or 40/45"
              required
              maxLength={100}
              value={targetGrade}
              onChange={(e) => setTargetGrade(e.target.value)}
              disabled={isLoading}
            />
          </div>
        </fieldset>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
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
            autoComplete="new-password"
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

      <Button type="submit" size="lg" className="w-full gap-2" loading={isLoading} loadingText="Creating your account...">
        {submitLabel}
      </Button>

      <p className="text-xs text-muted-foreground text-center leading-relaxed">
        By creating an account you agree to use VOETutor in line with the platform terms. We&apos;ll never share your details.
      </p>

      <div className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href={next ? `/auth/login?next=${encodeURIComponent(next)}` : "/auth/login"}
          className="text-primary font-semibold hover:underline"
        >
          Log in
        </Link>
      </div>
    </form>
  );
}
