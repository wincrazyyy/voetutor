import { Sidebar } from "@/components/layout/sidebar";
import { UploadManagerProvider } from "@/components/educator/upload-manager";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <UploadManagerProvider>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-muted/20">
          {children}
        </main>
      </div>
    </UploadManagerProvider>
  );
}
