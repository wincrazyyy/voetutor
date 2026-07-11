"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateStudentProfileAction } from "@/app/actions/student-profile";

interface StudentProfileFormProps {
  firstName: string;
  lastName: string;
  whatsappNumber: string;
  school: string;
  schoolYear: string;
  targetGrade: string;
}

/** Settings form letting a student edit their name + enrolment details (student_profiles sidecar). */
export function StudentProfileForm(initial: StudentProfileFormProps) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(initial.firstName);
  const [lastName, setLastName] = useState(initial.lastName);
  const [whatsappNumber, setWhatsappNumber] = useState(initial.whatsappNumber);
  const [school, setSchool] = useState(initial.school);
  const [schoolYear, setSchoolYear] = useState(initial.schoolYear);
  const [targetGrade, setTargetGrade] = useState(initial.targetGrade);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  /** Wrap a setter so any edit clears the "Saved" confirmation. */
  const edit = (setter: (v: string) => void) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setter(event.target.value);
    setSaved(false);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateStudentProfileAction({
        firstName,
        lastName,
        whatsappNumber,
        school,
        schoolYear,
        targetGrade,
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="s-first">First name</Label>
          <Input id="s-first" required maxLength={100} value={firstName} onChange={edit(setFirstName)} disabled={pending} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="s-last">Last name</Label>
          <Input id="s-last" required maxLength={100} value={lastName} onChange={edit(setLastName)} disabled={pending} />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="s-whatsapp">WhatsApp number</Label>
        <Input
          id="s-whatsapp"
          type="tel"
          maxLength={50}
          placeholder="+852 1234 5678"
          value={whatsappNumber}
          onChange={edit(setWhatsappNumber)}
          disabled={pending}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="s-school">Name of school</Label>
          <Input id="s-school" maxLength={200} value={school} onChange={edit(setSchool)} disabled={pending} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="s-year">School year</Label>
          <Input id="s-year" maxLength={60} placeholder="e.g. Year 12 / DP1" value={schoolYear} onChange={edit(setSchoolYear)} disabled={pending} />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="s-target">Target grade</Label>
        <Input id="s-target" maxLength={100} placeholder="e.g. 7 or 40/45" value={targetGrade} onChange={edit(setTargetGrade)} disabled={pending} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending} loadingText="Saving…">
          Save changes
        </Button>
        {saved && !pending && (
          <span className="flex items-center gap-1.5 text-sm text-primary">
            <CheckCircle2 className="size-4" /> Saved
          </span>
        )}
      </div>
    </form>
  );
}
