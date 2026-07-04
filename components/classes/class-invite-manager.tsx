"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Ban,
  Check,
  Copy,
  Link2,
  Loader2,
  Mail,
  MailQuestion,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";
import { getDisplayName, relativeTime } from "@/lib/utils/format";
import type { ClassInviteRow, ClassInviteStatus } from "@/lib/queries/class-invites";
import {
  createClassInviteAction,
  revokeClassInviteAction,
  deleteClassInviteAction,
} from "@/app/actions/class-invites";

const STATUS_BADGE: Record<ClassInviteStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-primary/10 text-primary" },
  redeemed: { label: "Redeemed", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  expired: { label: "Expired", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  revoked: { label: "Revoked", className: "bg-destructive/10 text-destructive" },
};

/** Deterministic UTC string for SSR + first client render (avoids a hydration mismatch); localized post-mount. */
function utcFallback(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function LocalDateTime({ at }: { at: string }) {
  const [display, setDisplay] = useState(() => utcFallback(at));

  useEffect(() => {
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) return;
    setDisplay(
      d.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
    );
  }, [at]);

  return <>{display}</>;
}

interface InviteFormState {
  email: string;
  note: string;
  expiresAt: string;
}

const EMPTY_FORM: InviteFormState = { email: "", note: "", expiresAt: "" };

export function ClassInviteManager({
  classId,
  invites,
}: {
  classId: string;
  invites: ClassInviteRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<InviteFormState>(EMPTY_FORM);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copy = (key: string, text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
    });
  };

  const inviteUrl = (token: string) => `${window.location.origin}/invite/${token}`;

  const generate = () =>
    startTransition(async () => {
      setError(null);
      const res = await createClassInviteAction(classId, {
        email: form.email.trim() || undefined,
        note: form.note.trim() || undefined,
        expiresAt: form.expiresAt || undefined,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setGeneratedUrl(res.url ?? null);
      setForm(EMPTY_FORM);
      router.refresh();
    });

  const revoke = (inviteId: string) =>
    startTransition(async () => {
      setError(null);
      const res = await revokeClassInviteAction(inviteId, classId);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });

  const remove = (inviteId: string) =>
    startTransition(async () => {
      setError(null);
      const res = await deleteClassInviteAction(inviteId, classId);
      if (res.error) {
        setError(res.error);
        return;
      }
      setConfirmingDelete(null);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <Card className="flex flex-col gap-4 border-border p-5 shadow-sm">
        <div>
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            Generate invite link
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Each link enrols exactly one student. Send it to the student yourself — by email or
            WhatsApp — after receiving their payment.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="inv-email">Restrict to email (optional)</Label>
            <Input
              id="inv-email"
              type="email"
              value={form.email}
              maxLength={255}
              disabled={isPending}
              placeholder="student@example.com"
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to let anyone holding the link redeem it.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="inv-expiry">Expires (optional)</Label>
            <Input
              id="inv-expiry"
              type="datetime-local"
              value={form.expiresAt}
              disabled={isPending}
              onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">Leave blank for a link that never expires.</p>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="inv-note">Note (optional, only you see it)</Label>
          <Input
            id="inv-note"
            value={form.note}
            maxLength={200}
            disabled={isPending}
            placeholder="e.g. Paid by bank transfer on 2 Jul"
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </div>

        <div>
          <Button onClick={generate} disabled={isPending} className="gap-2">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            Generate link
          </Button>
        </div>

        {generatedUrl ? (
          <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
            <code className="min-w-0 flex-1 truncate text-xs text-foreground">{generatedUrl}</code>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={() => copy("generated", generatedUrl)}
            >
              {copiedKey === "generated" ? (
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
        ) : null}
      </Card>

      {invites.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 border-dashed border-border p-10 text-center">
          <MailQuestion className="h-9 w-9 text-muted-foreground" />
          <h3 className="text-base font-bold text-foreground">No invites yet</h3>
          <p className="text-sm text-muted-foreground">
            Generate a link above to invite your first student to this class.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {invites.map((invite) => {
            const badge = STATUS_BADGE[invite.status];
            const confirming = confirmingDelete === invite.id;

            return (
              <Card
                key={invite.id}
                className={cn(
                  "flex flex-col gap-3 border-border p-4 sm:p-5",
                  invite.status === "revoked" && "opacity-70",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
                          badge.className,
                        )}
                      >
                        {badge.label}
                      </span>
                      {invite.email ? (
                        <span className="inline-flex min-w-0 items-center gap-1 text-sm text-foreground">
                          <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate">{invite.email}</span>
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Anyone with the link</span>
                      )}
                    </div>
                    {invite.note ? (
                      <p className="mt-1 text-sm text-muted-foreground">{invite.note}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      Created {relativeTime(invite.created_at)}
                      {invite.status === "pending" && invite.expires_at ? (
                        <>
                          {" "}
                          · expires <LocalDateTime at={invite.expires_at} />
                        </>
                      ) : null}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {invite.status === "pending" ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copy(invite.id, inviteUrl(invite.token))}
                          disabled={isPending}
                        >
                          {copiedKey === invite.id ? (
                            <Check className="h-3.5 w-3.5 text-primary" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                          <span className="hidden sm:inline">
                            {copiedKey === invite.id ? "Copied" : "Copy link"}
                          </span>
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => revoke(invite.id)} disabled={isPending}>
                          <Ban className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Revoke</span>
                        </Button>
                      </>
                    ) : null}
                    {confirming ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">Delete?</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmingDelete(null)}
                          disabled={isPending}
                        >
                          Cancel
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => remove(invite.id)} disabled={isPending}>
                          {isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          Delete
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setConfirmingDelete(invite.id)}
                        disabled={isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Delete</span>
                      </Button>
                    )}
                  </div>
                </div>

                {invite.status === "redeemed" && invite.redeemed_at ? (
                  <div className="flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2">
                    {invite.redeemer ? (
                      <>
                        <UserAvatar
                          avatarUrl={invite.redeemer.avatar_url}
                          firstName={invite.redeemer.first_name}
                          lastName={invite.redeemer.last_name}
                          displayName={invite.redeemer.display_name}
                          size={28}
                        />
                        <span className="text-sm text-foreground">
                          Redeemed by{" "}
                          <span className="font-semibold">
                            {getDisplayName(
                              invite.redeemer.first_name,
                              invite.redeemer.last_name,
                              invite.redeemer.display_name,
                            )}
                          </span>{" "}
                          <span className="text-muted-foreground">{relativeTime(invite.redeemed_at)}</span>
                        </span>
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        Redeemed {relativeTime(invite.redeemed_at)}
                      </span>
                    )}
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
