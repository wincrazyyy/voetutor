import type { ReactNode } from "react";

import { UploadManagerProvider } from "@/components/educator/upload-manager";
import { UploadTray } from "@/components/educator/upload-tray";

export default function EducatorLayout({ children }: { children: ReactNode }) {
  return (
    <UploadManagerProvider>
      {children}
      <UploadTray />
    </UploadManagerProvider>
  );
}
