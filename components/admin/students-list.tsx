"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Inbox, Search, UserCog } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeleteAccountButton } from "@/components/admin/delete-account-button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { deleteStudentAccountAction } from "@/app/actions/educators";
import type { StudentAccount } from "@/lib/queries/educator-approvals";
import { getDisplayName } from "@/lib/utils/format";

interface StudentsListProps {
  students: StudentAccount[];
  currentUserId: string;
}

/** Fixed locale + UTC so server and client render the same string (no hydration mismatch). */
const JOIN_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatJoinDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : JOIN_DATE.format(date);
}

export function StudentsList({ students, currentUserId }: StudentsListProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter((student) => {
      const haystack = [student.first_name, student.last_name, student.display_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [query, students]);

  if (students.length === 0) {
    return (
      <Card className="border border-dashed border-border bg-card/50 p-10 text-center">
        <Inbox className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <h3 className="mb-1 text-lg font-bold">No students yet</h3>
        <p className="text-sm text-muted-foreground">
          Student accounts appear here once people sign up.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative w-full">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search students by name…"
          aria-label="Search students"
          inputMode="search"
          enterKeyHint="search"
          className="h-11 w-full rounded-full border border-input bg-background pl-10 pr-4 text-base outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-sm"
        />
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {query.trim()
          ? filtered.length === 0
            ? `No students match ${query.trim()}.`
            : `${filtered.length} of ${students.length} ${students.length === 1 ? "student" : "students"} shown.`
          : ""}
      </p>

      {query.trim() && (
        <p className="text-xs text-muted-foreground">
          {filtered.length} of {students.length} {students.length === 1 ? "student" : "students"}
        </p>
      )}

      {filtered.length === 0 ? (
        <Card className="border border-dashed border-border bg-card/50 p-10 text-center">
          <Search className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h3 className="mb-1 text-lg font-bold">No matches</h3>
          <p className="text-sm text-muted-foreground">
            No student matches &ldquo;{query.trim()}&rdquo;. Try a different name.
          </p>
        </Card>
      ) : (
        filtered.map((student) => {
          const name = getDisplayName(student.first_name, student.last_name, student.display_name);
          const joined = formatJoinDate(student.created_at);

          return (
            <Card
              key={student.id}
              className="flex flex-row items-center gap-4 border-border bg-card p-4 shadow-sm"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <UserAvatar
                  avatarUrl={student.avatar_url}
                  firstName={student.first_name}
                  lastName={student.last_name}
                  displayName={student.display_name}
                  size="md"
                />
                <div className="min-w-0">
                  <span className="block truncate font-semibold">{name}</span>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {student.enrolledCount} {student.enrolledCount === 1 ? "class" : "classes"}
                    {joined ? ` · joined ${joined}` : null}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <Link href={`/admin/students/${student.id}`}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-w-11 gap-1.5 sm:min-w-0"
                    aria-label="Manage student"
                  >
                    <UserCog className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Manage</span>
                  </Button>
                </Link>
                {student.id !== currentUserId ? (
                  <DeleteAccountButton
                    accountId={student.id}
                    accountName={name}
                    action={deleteStudentAccountAction}
                    description={
                      <>
                        removes their login, every class enrolment and all lesson progress, their forum
                        posts and replies, upvotes, announcement read receipts, and any class reports they
                        filed. This cannot be undone.
                      </>
                    }
                  />
                ) : null}
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
