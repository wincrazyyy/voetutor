import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, KeyRound, MailX } from "lucide-react";

import { getClassInvitePreview } from "@/lib/queries/class-invites";
import { createClient } from "@/lib/supabase/server";
import { VoeWordmark } from "@/components/brand/vault-mark";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InviteJoinButton } from "@/components/classes/invite-join-button";
import type { ClassInvitePreviewReason } from "@/lib/types/database";

export const metadata: Metadata = {
  title: "Class invite | VOETutor",
  description: "You have been invited to join a class on VOETutor.",
};

const UNREDEEMABLE_COPY: Record<Exclude<ClassInvitePreviewReason, "valid">, string> = {
  revoked: "This invite has been revoked by the educator who issued it.",
  redeemed: "This invite link has already been used. Invite links are single-use.",
  expired: "This invite has expired.",
};

function InviteChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh flex flex-col bg-background">
      <div className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center px-5 py-3 sm:px-8">
          <Link href="/" className="hover:opacity-80 transition-opacity">
            <VoeWordmark />
          </Link>
        </div>
      </div>
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const preview = await getClassInvitePreview(token);

  if (!preview) {
    return (
      <InviteChrome>
        <Card className="flex flex-col items-center gap-3 border-border p-8 text-center shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <MailX className="h-6 w-6 text-muted-foreground" />
          </div>
          <h1 className="font-serif text-2xl font-bold tracking-tight">Invalid invite</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            This invite link is not valid. It may have been deleted, or the address was copied
            incompletely. Ask your educator to send you a fresh link.
          </p>
          <Link href="/" className="mt-2">
            <Button variant="outline" className="gap-2">
              Go to VOETutor
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </Card>
      </InviteChrome>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let alreadyEnrolled = false;
  if (user) {
    const { data: enrollment } = await supabase
      .from("class_enrollments")
      .select("class_id")
      .eq("class_id", preview.class_id)
      .eq("user_id", user.id)
      .maybeSingle();
    alreadyEnrolled = Boolean(enrollment);
  }

  const next = encodeURIComponent(`/invite/${token}`);

  return (
    <InviteChrome>
      <Card className="flex flex-col items-center gap-4 border-border p-8 text-center shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <KeyRound className="h-6 w-6 text-primary" />
        </div>
        <div className="space-y-2">
          <h1 className="font-serif text-2xl font-bold tracking-tight">You&apos;re invited</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You&apos;ve been invited to <strong className="text-foreground">{preview.class_title}</strong> by{" "}
            {preview.educator_name}.
          </p>
        </div>

        {user ? (
          alreadyEnrolled ? (
            <div className="w-full space-y-3">
              <p className="text-sm text-muted-foreground">You&apos;re already enrolled in this class.</p>
              <Link href={`/class/${preview.class_id}`} className="block">
                <Button className="w-full gap-2">
                  Open class
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          ) : preview.redeemable ? (
            <InviteJoinButton token={token} />
          ) : (
            <div className="w-full space-y-3">
              <p className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {UNREDEEMABLE_COPY[preview.reason as Exclude<ClassInvitePreviewReason, "valid">] ??
                  "This invite can no longer be used."}
              </p>
              <Link href="/dashboard" className="block">
                <Button variant="outline" className="w-full gap-2">
                  Go to your dashboard
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          )
        ) : preview.redeemable ? (
          <div className="w-full space-y-3">
            <p className="text-sm text-muted-foreground">
              Create a free account (or sign in) to join the class.
            </p>
            <Link href={`/auth/sign-up?next=${next}`} className="block">
              <Button className="w-full">Create account</Button>
            </Link>
            <Link href={`/auth/login?next=${next}`} className="block">
              <Button variant="outline" className="w-full">
                Sign in
              </Button>
            </Link>
          </div>
        ) : (
          <p className="w-full rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {UNREDEEMABLE_COPY[preview.reason as Exclude<ClassInvitePreviewReason, "valid">] ??
              "This invite can no longer be used."}
          </p>
        )}
      </Card>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        VOETutor · Vault of Excellence
      </p>
    </InviteChrome>
  );
}
