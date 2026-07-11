"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Info,
  KeyRound,
  UserPlus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { addStudentByEmailAction } from "@/app/actions/class-roster";
import { createStudentAccountAction } from "@/app/actions/student-accounts";

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

type Mode = "existing" | "new";

interface Credentials {
  email: string;
  tempPassword: string;
  studentName: string;
}

/**
 * The "Add a student" card on the class students page. Two modes behind a segmented control:
 * "Existing account" enrolls a student who already has a VOETutor account by email;
 * "New account" provisions a fresh student account via createStudentAccountAction and shows the
 * generated temporary password exactly ONCE (it lives only in this component's state — a refresh
 * loses it by design).
 */
export function AddStudentCard({ classId }: { classId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  /* Which specific action is in flight ("add" | "create"), so only the clicked button shows a
     spinner while isPending disables the whole card against concurrent edits. */
  const [busy, setBusy] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("existing");

  const [email, setEmail] = useState("");
  const [addResult, setAddResult] = useState<{ tone: Tone; text: string } | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [emailExists, setEmailExists] = useState(false);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [showDetails, setShowDetails] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [school, setSchool] = useState("");
  const [schoolYear, setSchoolYear] = useState("");
  const [courses, setCourses] = useState("");
  const [targetGrade, setTargetGrade] = useState("");

  const copy = (key: string, text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
    });
  };

  const trimmedEmail = email.trim();
  const canCreate = !!firstName.trim() && !!lastName.trim() && !!newEmail.trim();

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

  const submitCreate = () => {
    if (!canCreate || isPending) return;
    setBusy("create");
    startTransition(async () => {
      try {
        setCreateError(null);
        setEmailExists(false);
        const res = await createStudentAccountAction(classId, {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: newEmail.trim(),
          whatsappNumber: whatsappNumber.trim() || undefined,
          school: school.trim() || undefined,
          schoolYear: schoolYear.trim() || undefined,
          courses: courses.trim() || undefined,
          targetGrade: targetGrade.trim() || undefined,
        });
        if (res.error) {
          setCreateError(res.error);
          setEmailExists(res.emailExists === true);
          return;
        }
        if (res.credentials) {
          setCredentials(res.credentials);
          router.refresh();
        }
      } finally {
        setBusy(null);
      }
    });
  };

  const switchToExisting = () => {
    setMode("existing");
    setEmail(newEmail.trim());
    setAddResult(null);
    setCreateError(null);
    setEmailExists(false);
  };

  const finishCredentials = () => {
    setCredentials(null);
    setFirstName("");
    setLastName("");
    setNewEmail("");
    setWhatsappNumber("");
    setSchool("");
    setSchoolYear("");
    setCourses("");
    setTargetGrade("");
    setShowDetails(false);
    setCreateError(null);
    setEmailExists(false);
    setCopiedKey(null);
    router.refresh();
  };

  return (
    <Card className="flex flex-col gap-4 border-border p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <UserPlus className="h-4 w-4 text-primary" />
            Add a student
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "existing"
              ? "The student must already have a VOETutor account. They are enrolled immediately — no invite link needed."
              : "Create a VOETutor account for a student who doesn't have one. You'll get a temporary password to hand to them — they'll be asked to set their own the first time they sign in."}
          </p>
        </div>
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)} className="shrink-0">
          <TabsList>
            <TabsTrigger value="existing">Existing account</TabsTrigger>
            <TabsTrigger value="new">New account</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {mode === "existing" ? (
        <>
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
        </>
      ) : credentials ? (
        <div className="flex flex-col gap-3 rounded-md border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
            <span className="text-sm font-semibold text-foreground">
              Account created for {credentials.studentName}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
              <span className="w-36 shrink-0 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Email
              </span>
              <code className="min-w-0 flex-1 truncate text-xs text-foreground">
                {credentials.email}
              </code>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={() => copy("email", credentials.email)}
              >
                {copiedKey === "email" ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-primary" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </>
                )}
              </Button>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
              <span className="w-36 shrink-0 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Temporary password
              </span>
              <code className="min-w-0 flex-1 truncate text-xs text-foreground">
                {credentials.tempPassword}
              </code>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={() => copy("password", credentials.tempPassword)}
              >
                {copiedKey === "password" ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-primary" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              This password is shown once. Copy it now and hand it to the student — the educator
              cannot recover it later, only the student can change it.
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={() =>
                copy("both", `Email: ${credentials.email}\nTemporary password: ${credentials.tempPassword}`)
              }
            >
              {copiedKey === "both" ? (
                <>
                  <Check className="h-4 w-4 text-primary" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy both
                </>
              )}
            </Button>
            <Button onClick={finishCredentials}>Done</Button>
          </div>
        </div>
      ) : (
        <>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              submitCreate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="new-first-name">First name</Label>
                <Input
                  id="new-first-name"
                  value={firstName}
                  maxLength={100}
                  disabled={isPending}
                  placeholder="Alex"
                  onChange={(e) => {
                    setFirstName(e.target.value);
                    setCreateError(null);
                    setEmailExists(false);
                  }}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="new-last-name">Last name</Label>
                <Input
                  id="new-last-name"
                  value={lastName}
                  maxLength={100}
                  disabled={isPending}
                  placeholder="Chan"
                  onChange={(e) => {
                    setLastName(e.target.value);
                    setCreateError(null);
                    setEmailExists(false);
                  }}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="new-email">Email</Label>
              <Input
                id="new-email"
                type="email"
                value={newEmail}
                maxLength={255}
                disabled={isPending}
                placeholder="student@example.com"
                onChange={(e) => {
                  setNewEmail(e.target.value);
                  setCreateError(null);
                  setEmailExists(false);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Use the student&apos;s real email — it&apos;s their sign-in and the only way they can
                reset a forgotten password.
              </p>
            </div>

            <div className="grid gap-3 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setShowDetails((v) => !v)}
                className="flex items-center gap-1.5 self-start text-sm font-medium text-muted-foreground outline-none hover:text-foreground"
              >
                {showDetails ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                Student details (optional)
              </button>
              {showDetails ? (
                <div className="grid gap-4">
                  <p className="text-xs text-muted-foreground">
                    Pre-fill anything you already have — for example when migrating a student from
                    another platform. Leave blank otherwise; the student can add these later from their
                    Settings.
                  </p>
                  <div className="grid gap-1.5">
                    <Label htmlFor="new-whatsapp">WhatsApp number</Label>
                    <Input
                      id="new-whatsapp"
                      type="tel"
                      maxLength={50}
                      placeholder="+852 1234 5678"
                      value={whatsappNumber}
                      disabled={isPending}
                      onChange={(e) => setWhatsappNumber(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                      <Label htmlFor="new-school">Name of school</Label>
                      <Input
                        id="new-school"
                        maxLength={200}
                        value={school}
                        disabled={isPending}
                        onChange={(e) => setSchool(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="new-school-year">School year</Label>
                      <Input
                        id="new-school-year"
                        maxLength={60}
                        placeholder="e.g. Year 12 / DP1"
                        value={schoolYear}
                        disabled={isPending}
                        onChange={(e) => setSchoolYear(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="new-courses">Enrolled courses</Label>
                    <Input
                      id="new-courses"
                      maxLength={1000}
                      placeholder="e.g. Math AA HL, Physics HL, Economics SL"
                      value={courses}
                      disabled={isPending}
                      onChange={(e) => setCourses(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="new-target">Target grade</Label>
                    <Input
                      id="new-target"
                      maxLength={100}
                      placeholder="e.g. 7 or 40/45"
                      value={targetGrade}
                      disabled={isPending}
                      onChange={(e) => setTargetGrade(e.target.value)}
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div>
              <Button
                type="submit"
                loading={busy === "create"}
                disabled={isPending || !canCreate}
                loadingText="Creating account…"
                className="gap-2"
              >
                <KeyRound className="h-4 w-4" />
                Create account
              </Button>
            </div>
          </form>

          {createError ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {createError}
                {emailExists ? (
                  <>
                    {" "}
                    <button
                      type="button"
                      className="font-semibold underline underline-offset-2 outline-none hover:text-foreground"
                      onClick={switchToExisting}
                    >
                      Switch to Existing account
                    </button>
                  </>
                ) : null}
              </span>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}
