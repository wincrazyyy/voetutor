import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { VaultIntro } from "@/components/home/vault-intro";
import { Hero } from "@/components/home/hero";
import { TrustStrip } from "@/components/home/trust-strip";
import { HowItWorks } from "@/components/home/how-it-works";
import { SubjectLanes } from "@/components/home/subject-lanes";
import { BecomeEducator } from "@/components/home/become-educator";
import { FAQ } from "@/components/home/faq";
import { listPublishedEducators } from "@/lib/queries/educators-directory";

export default async function Home() {
  const featured = await listPublishedEducators({ limit: 5 });

  return (
    <main className="flex min-h-dvh flex-col bg-background selection:bg-primary/20">
      <VaultIntro />
      <Navbar />
      <Hero featured={featured} />
      <TrustStrip />
      <HowItWorks />
      <SubjectLanes />
      <BecomeEducator />
      <FAQ />
      <Footer />
    </main>
  );
}
