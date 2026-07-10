"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Info,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";
import { getDisplayName } from "@/lib/utils/format";
import {
  addStudentByEmailAction,
  moveStudentAction,
  removeStudentAction,
} from "@/app/actions/class-roster";

interface RosterStudentVM {
  id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

interface OtherClass {
  id: string;
  title: string;
  code: string;
}

type Tone = "success" | "info" | "error";

const TONE_CLASS: Record<Tone, string> = {
  success: "border-primary/30 bg-primary/5 text-foreground",
  info: "bg-muted text-muted-foreground",
  error: "border-destructive/20 bg-destructive/10 text-destructive",
};

function ToneIcon({ tone }: { tone: Tone }) {
  if (tone === "success") return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />;
  if (tone === "error") return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />;
  return <Info className="mt-0.5 h-4 w-4 shrink-0" />;
}

/**
 * Educator/admin roster manager for the class settings "Students" tab: add a student by email, move a
 * student to another of the educator's own classes, and kick a student. Removing/moving does NOT delete
 * user_video_progress (keyed by user+video, not enrollment), so a re-added student keeps their prior
 * progress — no data-loss copy is shown. The roster re-renders from the server on router.refresh().
 */
export function ManageStudents({
  classId,
  roster,
  otherClasses,
}: {
  classId: string;
  roster: RosterStudentVM[];
  otherClasses: OtherClass[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  /* Which specific action is in flight ("add" | `move:${id}` | `remove:${id}`), so only the clicked
     button shows a spinner while isPending disables the whole roster against concurrent edits. */
  const [busy, setBusy] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [addResult, setAddResult] = useState<{ tone: Tone; text: string } | null>(null);

  const [rosterError, setRosterError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);
  const [pendingMoveTarget, setPendingMoveTarget] = useState<Record<string, string>>({});
  const removeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRemoveTimer = () => {
    if (removeTimer.current) {
      clearTimeout(removeTimer.current);
      removeTimer.current = null;
    }
  };

  /** First click arms the Remove button (turns red); a second click within 4s confirms, else it disarms. */
  const armRemove = (studentId: string) => {
    setRosterError(null);
    setConfirmingRemove(studentId);
    clearRemoveTimer();
    removeTimer.current = setTimeout(() => setConfirmingRemove(null), 4000);
  };

  useEffect(() => {
    return () => {
      if (removeTimer.current) clearTimeout(removeTimer.current);
    };
  }, []);

  const trimmedEmail = email.trim();

  const submitAdd = () => {
    if (!trimmedEmail || isPending) return;
    setBusy("add");
    startTransition(async () => {
      try {
        setAddResult(null);
        const res = await addStudentByEmailAction(classId, trimmedEmail);
        if (res.error) {
          setAddResult({ tone: "error", text: res.error });
          return;
        }
        if (res.status === "enrolled") {
          setAddResult({ tone: "success", text: `Added ${res.studentName ?? "student"}.` });
          setEmail("");
          router.refresh();
        } else if (res.status === "already_enrolled") {
          setAddResult({
            tone: "info",
            text: `${res.studentName ?? "That student"} is already in this class.`,
          });
        } else {
          setAddResult({ tone: "info", text: "No student account found for this email." });
        }
      } finally {
        setBusy(null);
      }
    });
  };

  const remove = (studentId: string) => {
    setBusy(`remove:${studentId}`);
    startTransition(async () => {
      try {
        setRosterError(null);
        const res = await removeStudentAction(classId, studentId);
        if (res.error) {
          setRosterError(res.error);
          return;
        }
        clearRemoveTimer();
        setConfirmingRemove(null);
        router.refresh();
      } finally {
        setBusy(null);
      }
    });
  };

  const move = (studentId: string, toClassId: string) => {
    setBusy(`move:${studentId}`);
    startTransition(async () => {
      try {
        setRosterError(null);
        const res = await moveStudentAction(studentId, classId, toClassId);
        if (res.error) {
          setRosterError(res.error);
          return;
        }
        setPendingMoveTarget((prev) => {
          const next = { ...prev };
          delete next[studentId];
          return next;
        });
        router.refresh();
      } finally {
        setBusy(null);
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4 border-border p-5 shadow-sm">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <UserPlus className="h-4 w-4 text-primary" />
            Add a student by email
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The student must already have a VOETutor account. They are enrolled immediately — no invite
            link needed.
          </p>
        </div>

        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            submitAdd();
          }}
        >
          <div className="grid flex-1 gap-1.5">
            <Label htmlFor="roster-email">Student email</Label>
            <Input
              id="roster-email"
              type="email"
              value={email}
              maxLength={255}
              disabled={isPending}
              placeholder="student@example.com"
              onChange={(e) => {
                setEmail(e.target.value);
                setAddResult(null);
              }}
            />
          </div>
          <Button
            type="submit"
            loading={busy === "add"}
            disabled={isPending || !trimmedEmail}
            loadingText="Adding student…"
            className="gap-2"
          >
            <UserPlus className="h-4 w-4" />
            Add student
          </Button>
        </form>

        {addResult ? (
          <div
            className={cn(
              "flex items-start gap-2 rounded-md border border-transparent px-3 py-2 text-sm",
              TONE_CLASS[addResult.tone],
            )}
          >
            <ToneIcon tone={addResult.tone} />
            <span>{addResult.text}</span>
          </div>
        ) : null}
      </Card>

      {rosterError ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{rosterError}</span>
        </div>
      ) : null}

      {roster.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 border-dashed border-border p-10 text-center">
          <Users className="h-9 w-9 text-muted-foreground" />
          <h3 className="text-base font-bold text-foreground">No students yet</h3>
          <p className="text-sm text-muted-foreground">
            Add a student by email above, or send them an invite link.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {roster.map((student) => {
            const name = getDisplayName(student.first_name, student.last_name, student.display_name);
            const confirming = confirmingRemove === student.id;
            const moveTarget = pendingMoveTarget[student.id];

            return (
              <Card
                key={student.id}
                className="flex flex-col gap-3 border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <UserAvatar
                    avatarUrl={student.avatar_url}
                    firstName={student.first_name}
                    lastName={student.last_name}
                    displayName={student.display_name}
                    size={36}
                  />
                  <span className="truncate font-semibold text-foreground">{name}</span>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {otherClasses.length === 0 ? (
                    <span className="text-xs text-muted-foreground">No other classes</span>
                  ) : moveTarget ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">
                        Move to{" "}
                        <span className="font-semibold text-foreground">
                          {otherClasses.find((c) => c.id === moveTarget)?.title ?? "class"}
                        </span>
                        ?
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isPending}
                        onClick={() =>
                          setPendingMoveTarget((prev) => {
                            const next = { ...prev };
                            delete next[student.id];
                            return next;
                          })
                        }
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        loading={busy === `move:${student.id}`}
                        disabled={isPending}
                        loadingText="Moving…"
                        className="gap-1.5"
                        onClick={() => move(student.id, moveTarget)}
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                        Move
                      </Button>
                    </div>
                  ) : (
                    <Select
                      value=""
                      disabled={isPending}
                      onValueChange={(value) =>
                        setPendingMoveTarget((prev) => ({ ...prev, [student.id]: value }))
                      }
                    >
                      <SelectTrigger size="sm" className="w-[11rem]">
                        <SelectValue placeholder="Move to…" />
                      </SelectTrigger>
                      <SelectContent>
                        {otherClasses.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            <span className="flex w-full items-center justify-between gap-3">
                              <span className="truncate">{c.title}</span>
                              <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                                {c.code}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  <Button
                    variant={confirming ? "destructive" : "ghost"}
                    size="sm"
                    className={cn(
                      "gap-1.5",
                      !confirming && "text-muted-foreground hover:text-destructive",
                    )}
                    loading={busy === `remove:${student.id}`}
                    disabled={isPending}
                    loadingText="Removing…"
                    onClick={() => (confirming ? remove(student.id) : armRemove(student.id))}
                  >
                    <UserMinus className="h-3.5 w-3.5" />
                    {confirming ? "Confirm remove" : "Remove"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
