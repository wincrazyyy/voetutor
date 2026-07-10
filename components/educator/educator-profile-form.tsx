"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Save, AlertTriangle, ChevronDown, CheckCircle2, Pencil } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EducatorProfile } from "@/lib/types/database";

interface EducatorProfileFormProps {
  educatorId: string;
  initial: EducatorProfile | null;
  /** "application" (the /pending approval form) vs "settings" (an approved educator editing later).
   *  Only changes the framing copy — the fields and save path are identical. */
  context?: "application" | "settings";
}

const CURRENT_YEAR = new Date().getFullYear();

function splitWhatsapp(raw: string | null | undefined): { code: string; number: string } {
  if (!raw) return { code: "", number: "" };
  const trimmed = raw.trim().replace(/^\+/, "");
  const match = trimmed.match(/^(\d{1,4})[\s-]+(.*)$/);
  if (match) return { code: match[1], number: match[2].trim() };
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length > 7) return { code: digits.slice(0, digits.length - 8), number: digits.slice(digits.length - 8) };
  return { code: "", number: trimmed };
}

export function EducatorProfileForm({ educatorId, initial, context = "application" }: EducatorProfileFormProps) {
  const router = useRouter();
  const [gender, setGender] = useState(initial?.gender ?? "");
  const initialWhatsapp = splitWhatsapp(initial?.whatsapp_number);
  const [whatsappCode, setWhatsappCode] = useState(initialWhatsapp.code);
  const [whatsappNumber, setWhatsappNumber] = useState(initialWhatsapp.number);
  const whatsappNumberRef = useRef<HTMLInputElement>(null);
  const whatsappCodeRef = useRef<HTMLInputElement>(null);
  const [education, setEducation] = useState(initial?.education ?? "");
  const [educationDegree, setEducationDegree] = useState(initial?.education_degree ?? "");
  const [educationMajor, setEducationMajor] = useState(initial?.education_major ?? "");
  const [graduationYear, setGraduationYear] = useState<string>(
    initial?.graduation_year != null ? String(initial.graduation_year) : "",
  );
  const [teachingExperience, setTeachingExperience] = useState(initial?.teaching_experience ?? "");
  const [teachingSubjects, setTeachingSubjects] = useState(initial?.teaching_subjects ?? "");
  const [selfIntroduction, setSelfIntroduction] = useState(initial?.self_introduction ?? "");

  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const hasInitialData = Boolean(
    initial?.gender ||
      initial?.whatsapp_number ||
      initial?.education ||
      initial?.education_degree ||
      initial?.education_major ||
      initial?.graduation_year ||
      initial?.teaching_experience ||
      initial?.teaching_subjects ||
      initial?.self_introduction,
  );
  const [expanded, setExpanded] = useState(!hasInitialData);

  const isSettings = context === "settings";
  const heading = isSettings ? "Educator details" : "Application details";
  const expandedIntro = isSettings
    ? "Your contact and teaching background. These are private — visible only to you and platform admins. Your public profile page is edited separately."
    : "Optional — but the more you fill in, the easier it is for an admin to approve your account.";
  const savedMessage = isSettings
    ? "Saved."
    : "Saved. An administrator will see your updated details on the next review.";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);

    let yearValue: number | null = null;
    if (graduationYear.trim()) {
      const parsed = Number.parseInt(graduationYear, 10);
      if (!Number.isFinite(parsed) || parsed < 1900 || parsed > 2100) {
        setError("Graduation year must be a four-digit year between 1900 and 2100.");
        return;
      }
      yearValue = parsed;
    }

    const codeDigits = whatsappCode.replace(/\D/g, "");
    const numberDigits = whatsappNumber.replace(/\D/g, "");
    let combinedWhatsapp: string | null = null;
    if (codeDigits || numberDigits) {
      if (!codeDigits || !numberDigits) {
        setError("Please provide both a country code and a phone number, or leave both empty.");
        return;
      }
      combinedWhatsapp = `+${codeDigits} ${whatsappNumber.trim()}`;
    }

    setIsSaving(true);
    const supabase = createClient();
    const { error: upsertError } = await supabase.from("educator_profiles").upsert(
      {
        educator_id: educatorId,
        gender: gender.trim() || null,
        whatsapp_number: combinedWhatsapp,
        education: education.trim() || null,
        education_degree: educationDegree.trim() || null,
        education_major: educationMajor.trim() || null,
        graduation_year: yearValue,
        teaching_experience: teachingExperience.trim() || null,
        teaching_subjects: teachingSubjects.trim() || null,
        self_introduction: selfIntroduction.trim() || null,
      },
      { onConflict: "educator_id" },
    );
    setIsSaving(false);

    if (upsertError) {
      setError(upsertError.message);
      return;
    }

    setSaved(true);
    setExpanded(false);
    router.refresh();
  };

  return (
    <Card className="p-6 border-border shadow-sm bg-card">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls="educator-profile-form-body"
        className={`w-full flex items-start justify-between gap-4 text-left ${expanded ? "mb-5" : ""}`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-lg font-bold">{heading}</h2>
            {hasInitialData && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Saved
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {expanded ? expandedIntro : "Your details are on file. Click to edit."}
          </p>
        </div>
        <ChevronDown
          className={`w-5 h-5 text-muted-foreground shrink-0 mt-1 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && !isSettings && (
        <div className="mb-5 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="leading-relaxed">
            Treat the self-introduction seriously — once approved, it may be displayed publicly to promote you to prospective students.
          </span>
        </div>
      )}

      {!expanded && saved && !error && (
        <p className="mt-4 text-sm text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-3 py-2 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span className="flex-1">{savedMessage}</span>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:underline"
          >
            <Pencil className="w-3 h-3" />
            Edit
          </button>
        </p>
      )}

      <form
        id="educator-profile-form-body"
        onSubmit={handleSubmit}
        className={`flex flex-col gap-5 ${expanded ? "" : "hidden"}`}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="ep-gender">Gender</Label>
            <Input
              id="ep-gender"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              placeholder="e.g. Female / Male / Non-binary"
              maxLength={50}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ep-whatsapp-code">WhatsApp phone number</Label>
            <div className="flex items-stretch gap-2">
              <div className="relative w-24 shrink-0">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground"
                >
                  +
                </span>
                <Input
                  ref={whatsappCodeRef}
                  id="ep-whatsapp-code"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-country-code"
                  value={whatsappCode}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
                    setWhatsappCode(digits);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === " " && whatsappCode.length > 0) {
                      e.preventDefault();
                      whatsappNumberRef.current?.focus();
                    }
                  }}
                  placeholder="852"
                  maxLength={4}
                  className="pl-6"
                  aria-label="Country code"
                />
              </div>
              <Input
                ref={whatsappNumberRef}
                id="ep-whatsapp"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Backspace" && whatsappNumber.length === 0 && whatsappCode.length > 0) {
                    e.preventDefault();
                    whatsappCodeRef.current?.focus();
                  }
                }}
                placeholder="9123 4567"
                maxLength={20}
                aria-label="Phone number"
              />
            </div>
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="ep-education">Education / institution</Label>
          <Input
            id="ep-education"
            value={education}
            onChange={(e) => setEducation(e.target.value)}
            placeholder="University of Hong Kong"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="ep-degree">Degree</Label>
            <Input
              id="ep-degree"
              value={educationDegree}
              onChange={(e) => setEducationDegree(e.target.value)}
              placeholder="BSc, MSc, PhD"
              maxLength={255}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ep-major">Major</Label>
            <Input
              id="ep-major"
              value={educationMajor}
              onChange={(e) => setEducationMajor(e.target.value)}
              placeholder="Mathematics"
              maxLength={255}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ep-year">Graduation year</Label>
            <Input
              id="ep-year"
              type="number"
              inputMode="numeric"
              value={graduationYear}
              onChange={(e) => setGraduationYear(e.target.value)}
              placeholder={`${CURRENT_YEAR}`}
              min={1900}
              max={2100}
            />
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="ep-subjects">Teaching subject(s)</Label>
          <Input
            id="ep-subjects"
            value={teachingSubjects}
            onChange={(e) => setTeachingSubjects(e.target.value)}
            placeholder="IB Math AA HL, IB Physics HL"
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="ep-experience">Teaching experience</Label>
          <textarea
            id="ep-experience"
            value={teachingExperience}
            onChange={(e) => setTeachingExperience(e.target.value)}
            rows={4}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
            placeholder="Years teaching, exam boards, schools, notable results..."
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="ep-intro">Self-introduction</Label>
          <textarea
            id="ep-intro"
            value={selfIntroduction}
            onChange={(e) => setSelfIntroduction(e.target.value)}
            rows={6}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
            placeholder="A few paragraphs about your teaching philosophy, style, and what students should expect from you. This may be used publicly — keep it serious."
          />
        </div>

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        {saved && !error && (
          <p className="text-sm text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-3 py-2">
            {savedMessage}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="submit" loading={isSaving} loadingText="Saving…" className="gap-2">
            <Save className="w-4 h-4" />
            Save details
          </Button>
        </div>
      </form>
    </Card>
  );
}
