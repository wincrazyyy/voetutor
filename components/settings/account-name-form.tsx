"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateAccountNameAction } from "@/app/actions/account";

interface AccountNameFormProps {
  firstName: string;
  lastName: string;
}

/**
 * Settings form letting any user — student, educator, or admin — edit their own account name
 * (profiles first/last name). The single name editor, rendered in the Account card's "Your name"
 * section for every role.
 */
export function AccountNameForm(initial: AccountNameFormProps) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(initial.firstName);
  const [lastName, setLastName] = useState(initial.lastName);
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
      const result = await updateAccountNameAction({ firstName, lastName });
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
          <Label htmlFor="an-first">First name</Label>
          <Input
            id="an-first"
            required
            maxLength={100}
            autoComplete="given-name"
            value={firstName}
            onChange={edit(setFirstName)}
            disabled={pending}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="an-last">Last name</Label>
          <Input
            id="an-last"
            required
            maxLength={100}
            autoComplete="family-name"
            value={lastName}
            onChange={edit(setLastName)}
            disabled={pending}
          />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending} loadingText="Saving…">
          Save name
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
