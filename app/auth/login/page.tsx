import { Suspense } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export default function Page() {
  return (
    <AuthShell
      variant="login"
      title="Sign in to VOETutor"
      description="Enter your credentials to continue. Educators will be routed to their hub once approved."
    >
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
