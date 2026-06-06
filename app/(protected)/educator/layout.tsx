import type { ReactNode } from "react";

import { UploadManagerProvider } from "@/components/educator/upload-manager";

export default function EducatorLayout({ children }: { children: ReactNode }) {
  return <UploadManagerProvider>{children}</UploadManagerProvider>;
}
