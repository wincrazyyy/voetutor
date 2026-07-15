"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClassAction, updateClassAction } from "@/app/actions/classes";
import type { Class } from "@/lib/types/database";

interface ClassFormProps {
  initial?: Class | null;
  mode: "create" | "edit";
}

export function ClassForm({ initial, mode }: ClassFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const initialPriceDollars =
    initial && initial.price_cents > 0 ? String(Math.round(initial.price_cents / 100)) : "0";

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result =
        mode === "create"
          ? await createClassAction(formData)
          : await updateClassAction(initial!.id, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  };

  return (
    <Card className="p-6 border-border shadow-sm bg-card">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="grid gap-2">
          <Label htmlFor="cls-title">Title</Label>
          <Input
            id="cls-title"
            name="title"
            defaultValue={initial?.title ?? ""}
            required
            maxLength={255}
            placeholder="IB Physics HL — Full Course"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="cls-description">Description</Label>
          <textarea
            id="cls-description"
            name="description"
            defaultValue={initial?.description ?? ""}
            rows={5}
            className="rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
            placeholder="What students will learn, who it's for, and how the class is structured."
          />
          <p className="text-xs text-muted-foreground">Shown on the marketplace card.</p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="cls-price">Price (HKD)</Label>
          <Input
            id="cls-price"
            name="price"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            defaultValue={initialPriceDollars}
            required
            placeholder="0"
            onKeyDown={(e) => {
              if (
                e.key.length === 1 &&
                !/[0-9]/.test(e.key) &&
                !e.ctrlKey &&
                !e.metaKey
              ) {
                e.preventDefault();
              }
            }}
          />
          <p className="text-xs text-muted-foreground">Whole HKD only. Set 0 for a free class.</p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {saved && !error && <p className="text-sm text-primary">Saved.</p>}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => router.back()} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={pending}
            loadingText={mode === "create" ? "Creating..." : "Saving..."}
          >
            {mode === "create" ? "Create Class" : "Save Changes"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
