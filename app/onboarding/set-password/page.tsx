import { redirect } from "next/navigation";

import { getCurrentProfile } from "@/lib/queries/profile";
import { SetPasswordForm } from "@/components/auth/set-password-form";

/**
 * Forced first-sign-in password change for accounts an educator/admin provisioned with a temporary
 * password. Deliberately OUTSIDE the (protected) layout so there is no sidebar chrome — a focused,
 * auth-page-style screen. The proxy confines flagged users here; visiting without the flag bounces.
 */
export default async function SetPasswordPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");
  if (profile.must_change_password !== true) redirect("/dashboard");

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <SetPasswordForm />
      </div>
    </div>
  );
}
