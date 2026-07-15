"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Star,
  Plus,
  Save,
  Trash2,
  Pencil,
  X,
  AlertTriangle,
  Eye,
  EyeOff,
  MessageSquareQuote,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/utils/format";
import { REVIEW_LIMITS } from "@/lib/profile/review-limits";
import type { EducatorReview } from "@/lib/types/database";
import {
  addImportedReviewAction,
  updateImportedReviewAction,
  deleteReviewAction,
  setReviewVisibilityAction,
} from "@/app/actions/educator-reviews";

const TEXTAREA_CLASS =
  "w-full min-h-[5.5rem] rounded-md border border-input bg-transparent px-3 py-2 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 md:text-sm";

interface ReviewFormState {
  rating: number;
  firstName: string;
  lastName: string;
  school: string;
  comment: string;
}

const EMPTY_FORM: ReviewFormState = { rating: 5, firstName: "", lastName: "", school: "", comment: "" };

function RatingInput({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Star rating">
      {Array.from({ length: 5 }, (_, i) => {
        const star = i + 1;
        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} star${star === 1 ? "" : "s"}`}
            disabled={disabled}
            onClick={() => onChange(star)}
            className="rounded p-2 ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed sm:p-0.5"
          >
            <Star
              className={cn(
                "h-6 w-6",
                star <= value ? "fill-primary text-primary" : "fill-none text-muted-foreground/40",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

function ReviewFields({
  form,
  setForm,
  disabled,
}: {
  form: ReviewFormState;
  setForm: (f: ReviewFormState) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-1.5">
        <Label>Rating</Label>
        <RatingInput value={form.rating} onChange={(rating) => setForm({ ...form, rating })} disabled={disabled} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="rv-first">Reviewer first name</Label>
          <Input
            id="rv-first"
            value={form.firstName}
            maxLength={REVIEW_LIMITS.nameMax}
            disabled={disabled}
            placeholder="e.g. Lawrence"
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="rv-last">Reviewer last name</Label>
          <Input
            id="rv-last"
            value={form.lastName}
            maxLength={REVIEW_LIMITS.nameMax}
            disabled={disabled}
            placeholder="e.g. Fung"
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="rv-school">School (optional)</Label>
        <Input
          id="rv-school"
          value={form.school}
          maxLength={REVIEW_LIMITS.schoolMax}
          disabled={disabled}
          placeholder="e.g. ISF Academy"
          onChange={(e) => setForm({ ...form, school: e.target.value })}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="rv-comment">Review</Label>
        <textarea
          id="rv-comment"
          value={form.comment}
          maxLength={REVIEW_LIMITS.commentMax}
          disabled={disabled}
          placeholder="What did this student say about working with you?"
          className={TEXTAREA_CLASS}
          onChange={(e) => setForm({ ...form, comment: e.target.value })}
        />
        <p className="text-right text-xs text-muted-foreground">
          {form.comment.length}/{REVIEW_LIMITS.commentMax}
        </p>
      </div>
    </div>
  );
}

interface ReviewsManagerProps {
  reviews: EducatorReview[];
  educatorId: string;
  maxReviews: number;
  /** True on the admin moderation route — surfaces the Hide/Show control and edits another educator. */
  adminEdit?: boolean;
}

export function ReviewsManager({ reviews, educatorId, maxReviews, adminEdit = false }: ReviewsManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState<ReviewFormState>(EMPTY_FORM);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ReviewFormState>(EMPTY_FORM);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const atMax = reviews.length >= maxReviews;

  const run = (fn: () => Promise<{ error?: string }>, onOk?: () => void) =>
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (res.error) {
        setError(res.error);
        return;
      }
      onOk?.();
      router.refresh();
    });

  const submitAdd = () =>
    run(
      () => addImportedReviewAction({ educatorId, ...addForm }),
      () => {
        setAddForm(EMPTY_FORM);
        setAdding(false);
      },
    );

  const startEdit = (r: EducatorReview) => {
    setConfirmingDelete(null);
    setEditingId(r.id);
    setEditForm({
      rating: r.rating,
      firstName: r.reviewer_first_name ?? "",
      lastName: r.reviewer_last_name ?? "",
      school: r.reviewer_school ?? "",
      comment: r.comment,
    });
  };

  const submitEdit = (reviewId: string) =>
    run(
      () => updateImportedReviewAction({ educatorId, reviewId, ...editForm }),
      () => setEditingId(null),
    );

  const remove = (reviewId: string) =>
    run(
      () => deleteReviewAction({ educatorId, reviewId }),
      () => setConfirmingDelete(null),
    );

  const toggleVisibility = (r: EducatorReview) =>
    run(() => setReviewVisibilityAction({ educatorId, reviewId: r.id, visible: !r.is_visible }));

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="rounded-md border border-primary/15 bg-primary/5 px-3 py-2.5 text-sm text-foreground">
        <strong className="text-primary">Imported reviews</strong> are testimonials you bring in from
        students you taught elsewhere. They show a small <span className="font-medium">“Imported”</span> label
        so visitors know they aren&apos;t verified platform reviews. Be honest — only add real quotes.
      </div>

      {adding ? (
        <Card className="flex flex-col gap-4 border-border p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">Add an imported review</h2>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setAddForm(EMPTY_FORM);
              }}
              aria-label="Cancel"
              className="relative rounded p-0.5 text-muted-foreground after:absolute after:-inset-3 after:content-[''] hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <ReviewFields form={addForm} setForm={setAddForm} disabled={isPending} />
          <div className="flex items-center gap-2">
            <Button size="sm" loading={isPending} loadingText="Saving…" onClick={submitAdd}>
              <Save className="h-3.5 w-3.5" />
              Save review
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAdding(false);
                setAddForm(EMPTY_FORM);
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        </Card>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            {reviews.length} {reviews.length === 1 ? "review" : "reviews"} · {maxReviews} max
          </span>
          <Button size="sm" onClick={() => setAdding(true)} disabled={atMax}>
            <Plus className="h-3.5 w-3.5" />
            Add review
          </Button>
        </div>
      )}

      {atMax && !adding ? (
        <p className="text-xs text-muted-foreground">You&apos;ve reached the maximum of {maxReviews} reviews.</p>
      ) : null}

      {reviews.length === 0 && !adding ? (
        <Card className="flex flex-col items-center gap-2 border-dashed border-border p-10 text-center">
          <MessageSquareQuote className="h-9 w-9 text-muted-foreground" />
          <h3 className="text-base font-bold text-foreground">No reviews yet</h3>
          <p className="text-sm text-muted-foreground">
            Add a testimonial from a past student to build trust on your public profile.
          </p>
        </Card>
      ) : null}

      <div className="flex flex-col gap-3">
        {reviews.map((r) => {
          const editing = editingId === r.id;
          const confirming = confirmingDelete === r.id;
          const name = [r.reviewer_first_name, r.reviewer_last_name].filter(Boolean).join(" ") || "Anonymous";

          return (
            <Card key={r.id} className={cn("flex flex-col gap-3 border-border p-4 sm:p-5", !r.is_visible && "opacity-70")}>
              {editing ? (
                <>
                  <ReviewFields form={editForm} setForm={setEditForm} disabled={isPending} />
                  <div className="flex items-center gap-2">
                    <Button size="sm" loading={isPending} loadingText="Saving…" onClick={() => submitEdit(r.id)}>
                      <Save className="h-3.5 w-3.5" />
                      Save
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditingId(null)} disabled={isPending}>
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold text-foreground">{name}</span>
                        {r.reviewer_school ? (
                          <span className="min-w-0 truncate text-sm text-muted-foreground">· {r.reviewer_school}</span>
                        ) : null}
                        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {r.source === "imported" ? "Imported" : "Verified"}
                        </span>
                        {!r.is_visible ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                            <EyeOff className="h-3 w-3" />
                            Hidden
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex items-center gap-1">
                        {Array.from({ length: 5 }, (_, i) => (
                          <Star
                            key={i}
                            className={cn(
                              "h-4 w-4",
                              i < r.rating ? "fill-primary text-primary" : "fill-none text-muted-foreground/30",
                            )}
                          />
                        ))}
                        <span className="ml-1 text-xs text-muted-foreground">{relativeTime(r.created_at)}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {adminEdit ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleVisibility(r)}
                          disabled={isPending}
                          title={r.is_visible ? "Hide from public profile" : "Show on public profile"}
                        >
                          {r.is_visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          <span className="hidden sm:inline">{r.is_visible ? "Hide" : "Show"}</span>
                        </Button>
                      ) : null}
                      <Button variant="ghost" size="sm" onClick={() => startEdit(r)} disabled={isPending}>
                        <Pencil className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Edit</span>
                      </Button>
                    </div>
                  </div>

                  <p className="whitespace-pre-line break-words text-sm leading-relaxed text-foreground/85">{r.comment}</p>

                  <div className="flex items-center justify-end">
                    {confirming ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">Delete this review?</span>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(null)} disabled={isPending}>
                          Cancel
                        </Button>
                        <Button variant="destructive" size="sm" loading={isPending} loadingText="Deleting…" onClick={() => remove(r.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setConfirmingDelete(r.id)}
                        disabled={isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Delete</span>
                      </Button>
                    )}
                  </div>
                </>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
