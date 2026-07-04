import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, UserPlus } from "lucide-react";

import { getCurrentProfile } from "@/lib/queries/profile";
import { getClassById } from "@/lib/queries/classes";
import { getClassInvites } from "@/lib/queries/class-invites";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClassInviteManager } from "@/components/classes/class-invite-manager";

export default async function ClassInvitePage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");
  if (profile.role === "educator" && !profile.is_approved) redirect("/pending");
  if (profile.role !== "educator" && profile.role !== "admin") redirect("/dashboard");

  const cls = await getClassById(classId);
  if (!cls) notFound();
  if (profile.role === "educator" && cls.educator_id !== profile.id) redirect("/dashboard");

  const invites = await getClassInvites(classId);

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-3xl mx-auto w-full space-y-6">
      <div>
        <Link href={`/class/${classId}`}>
          <Button variant="ghost" size="sm" className="mb-6 gap-2 text-muted-foreground hover:text-foreground -ml-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Class
          </Button>
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <UserPlus className="w-7 h-7 text-primary" />
            Invite Students
          </h1>
          <Badge variant="outline" className="text-primary border-primary/30 bg-primary/5 uppercase tracking-wider font-bold">
            {cls.code}
          </Badge>
        </div>
        <p className="text-muted-foreground">
          Generate single-use invite links for <span className="font-medium text-foreground">{cls.title}</span>.
          A student who opens their link signs up (or signs in) and is enrolled automatically.
        </p>
      </div>

      <ClassInviteManager classId={classId} invites={invites} />
    </div>
  );
}
