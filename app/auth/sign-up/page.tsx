import { Suspense } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/auth/sign-up-form";

export default function Page() {
  return (
    <AuthShell
      variant="sign-up"
      title="Create your account"
      description="Pick a role, fill in a few details, and you&apos;re in. Educators go through a quick approval step."
    >
      <Suspense>
        <SignUpForm />
      </Suspense>
    </AuthShell>
  );
}
