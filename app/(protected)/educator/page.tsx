import Link from "next/link";
import {
  ArrowRight,
  ClipboardList,
  Film,
  GraduationCap,
  Library,
  Lock,
  MessageSquare,
  PlayCircle,
  Plus,
  Sparkles,
  Star,
  UserCircle,
  Users,
} from "lucide-react";

import { requireEducatorPage } from "@/lib/tiers/gate";
import { getClassesForEducator } from "@/lib/queries/educator";
import { getDisplayName } from "@/lib/utils/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default async function EducatorHubPage() {
  const { profile, isPremium } = await requireEducatorPage();
  const firstName =
    profile.first_name ?? getDisplayName(profile.first_name, profile.last_name, profile.display_name);

  /* Basic tier: public profile + reviews only. Classes / videos / question bank are premium. */
  if (!isPremium) {
    return <BasicHub firstName={firstName} />;
  }

  const classes = await getClassesForEducator(profile.id);
  const totalStudents = classes.reduce((acc, c) => acc + c.student_count, 0);
  const totalVideos = classes.reduce((acc, c) => acc + c.video_count, 0);
  const unansweredPosts = classes.reduce((acc, c) => acc + c.unanswered_post_count, 0);

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Welcome back, {firstName}!</h1>
        <p className="text-muted-foreground">Manage your classes, post announcements, and track student engagement.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="p-6 border-border bg-card shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Total Students</span>
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div className="text-3xl font-black">{totalStudents}</div>
          <p className="text-sm text-muted-foreground mt-1">Across {classes.length} {classes.length === 1 ? "class" : "classes"}</p>
        </Card>

        <Card className="p-6 border-border bg-card shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Lessons Published</span>
            <PlayCircle className="w-5 h-5 text-primary" />
          </div>
          <div className="text-3xl font-black">{totalVideos}</div>
          <p className="text-sm text-muted-foreground mt-1">Videos available to students</p>
        </Card>

        <Card className="p-6 border-border bg-card shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Awaiting Reply</span>
            <MessageSquare className="w-5 h-5 text-primary" />
          </div>
          <div className="text-3xl font-black">{unansweredPosts}</div>
          <p className="text-sm text-muted-foreground mt-1">Open forum threads</p>
        </Card>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-primary" />
            Your Classes
          </h2>
          <Link href="/educator/classes/new">
            <Button className="gap-2 shadow-md">
              <Plus className="w-4 h-4" />
              New Class
            </Button>
          </Link>
        </div>

        {classes.length === 0 ? (
          <Card className="p-10 border border-dashed border-border bg-card/50 text-center">
            <GraduationCap className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <h3 className="text-lg font-bold mb-1">No classes yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Create your first class to start teaching.</p>
            <Link href="/educator/classes/new">
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Create a Class
              </Button>
            </Link>
          </Card>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {classes.map((cls) => (
              <Card
                key={cls.id}
                className="flex flex-col overflow-hidden border border-border shadow-sm hover:shadow-md transition-shadow bg-card relative"
              >
                <div className="absolute top-0 left-0 w-full h-1 bg-primary"></div>
                <div className="p-5 flex-1 mt-2">
                  <div className="flex items-start justify-between mb-3 gap-4">
                    <h3 className="text-lg font-bold leading-tight">{cls.title}</h3>
                    <Badge
                      variant="secondary"
                      className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground bg-muted shrink-0"
                    >
                      {cls.code}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs font-medium text-muted-foreground mt-4">
                    <div className="bg-muted/30 rounded-md p-2 text-center">
                      <div className="text-foreground font-bold text-base">{cls.student_count}</div>
                      <div>Students</div>
                    </div>
                    <div className="bg-muted/30 rounded-md p-2 text-center">
                      <div className="text-foreground font-bold text-base">{cls.video_count}</div>
                      <div>Videos</div>
                    </div>
                    <div className="bg-muted/30 rounded-md p-2 text-center">
                      <div className="text-foreground font-bold text-base">{cls.unanswered_post_count}</div>
                      <div>Open Q&A</div>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-muted/20 border-t border-border">
                  <Link href={`/educator/classes/${cls.id}`} className="w-full">
                    <Button
                      variant="ghost"
                      className="w-full justify-between group hover:bg-primary/5 hover:text-primary text-sm font-semibold h-10"
                    >
                      Manage Class
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Basic-tier hub: the two things a basic educator can do (profile + reviews) plus a premium upsell. */
function BasicHub({ firstName }: { firstName: string }) {
  const open = [
    { name: "Your public profile", desc: "Build the sales page students see on the marketplace.", href: "/educator/profile", icon: UserCircle },
    { name: "Reviews", desc: "Add and manage testimonials shown on your profile.", href: "/educator/reviews", icon: Star },
  ];
  const locked = [
    { name: "Classes", desc: "Create priced courses and manage curriculum.", icon: ClipboardList },
    { name: "Videos", desc: "Upload lessons students watch in your classes.", icon: Film },
    { name: "Question Bank", desc: "Practice questions and past papers by topic.", icon: Library },
  ];

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-5xl mx-auto w-full space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Welcome back, {firstName}!</h1>
        <p className="text-muted-foreground">
          Your account is on the <span className="font-semibold text-foreground">Basic</span> plan — build a great
          public profile and collect reviews.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {open.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="h-full p-6 border-border bg-card shadow-sm transition-colors hover:border-primary hover:bg-primary/5">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <item.icon className="w-5 h-5" />
                </div>
                <h2 className="text-lg font-bold">{item.name}</h2>
                <ArrowRight className="w-4 h-4 ml-auto text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">{item.desc}</p>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="p-6 border border-dashed border-border bg-card/50">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-5 h-5 text-gold" />
          <h2 className="text-lg font-bold">Unlock more with Premium</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          Premium adds teaching tools on top of your profile. Contact the VOETutor team to upgrade.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {locked.map((item) => (
            <div key={item.name} className="rounded-md border border-border bg-muted/20 p-4">
              <div className="flex items-center gap-2 mb-1.5 text-muted-foreground">
                <item.icon className="w-4 h-4" />
                <span className="text-sm font-semibold text-foreground">{item.name}</span>
                <Lock className="w-3.5 h-3.5 ml-auto" />
              </div>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
