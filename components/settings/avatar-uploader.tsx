"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";

import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDeleteButton } from "@/components/shared/buttons/confirm-delete-button";
import { ImageCropModal } from "@/components/media/image-crop-modal";
import { uploadUserAvatar } from "@/lib/avatar/upload-avatar";
import { updateAvatarAction } from "@/app/actions/avatar";

const ALLOWED = ["image/png", "image/jpeg", "image/webp"];

interface AvatarUploaderProps {
  userId: string;
  /** The avatar shown today (account avatar, falling back to the educator masthead) — for display. */
  avatarUrl: string | null;
  /** Whether an account-level avatar is set (profiles.avatar_url) — gates the Remove button. */
  hasCustomAvatar: boolean;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
}

export function AvatarUploader({
  userId,
  avatarUrl,
  hasCustomAvatar,
  firstName,
  lastName,
  displayName,
}: AvatarUploaderProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    if (!ALLOWED.includes(file.type)) {
      setError("Use a PNG, JPG, or WEBP image.");
      return;
    }
    setPendingFile(file);
  };

  const handleCropped = async (cropped: File) => {
    setPendingFile(null);
    setError(null);
    setBusy(true);
    const uploaded = await uploadUserAvatar(cropped, userId);
    if (uploaded.error || !uploaded.url) {
      setBusy(false);
      setError(uploaded.error ?? "Upload failed. Please try again.");
      return;
    }
    const saved = await updateAvatarAction(uploaded.url);
    setBusy(false);
    if (saved.error) {
      setError(saved.error);
      return;
    }
    router.refresh();
  };

  const onRemove = async () => {
    setError(null);
    setRemoving(true);
    setBusy(true);
    const saved = await updateAvatarAction(null);
    setBusy(false);
    setRemoving(false);
    if (saved.error) {
      setError(saved.error);
      return;
    }
    router.refresh();
  };

  return (
    <div className="flex flex-col items-start gap-4 sm:flex-row sm:flex-nowrap sm:items-center sm:gap-5">
      <div className="relative shrink-0">
        <UserAvatar
          avatarUrl={avatarUrl}
          firstName={firstName}
          lastName={lastName}
          displayName={displayName}
          size={72}
        />
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/60">
            <Spinner className="h-5 w-5 text-primary" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={busy}>
            <Camera className="h-4 w-4" />
            {avatarUrl ? "Change photo" : "Upload photo"}
          </Button>
          {hasCustomAvatar && (
            <ConfirmDeleteButton
              label="Remove photo"
              confirmLabel="Confirm remove photo"
              pending={removing}
              disabled={busy && !removing}
              onConfirm={onRemove}
            />
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          PNG, JPG, or WEBP — large images are compressed automatically. Shown next to your name across VOETutor.
        </p>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={onFile}
      />

      {pendingFile && (
        <ImageCropModal
          file={pendingFile}
          shape="circle"
          title="Adjust your avatar"
          onCancel={() => setPendingFile(null)}
          onCropped={handleCropped}
        />
      )}
    </div>
  );
}
