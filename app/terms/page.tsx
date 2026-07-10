import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";

export const metadata: Metadata = {
  title: "Terms of Service — VOETutor",
  description:
    "The terms governing your use of VOETutor, our premium video-tutoring platform for IB students and educators.",
};

const LAST_UPDATED = "10 July 2026";

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-3">
      <h2 className="text-xl font-bold text-foreground">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground [&_a]:text-primary [&_a]:font-medium [&_a:hover]:underline">
        {children}
      </div>
    </section>
  );
}

export default function TermsOfService() {
  return (
    <main className="min-h-screen flex flex-col bg-background selection:bg-primary/20">
      <Navbar />

      <article className="w-full max-w-3xl mx-auto px-5 py-12 md:py-16 flex-1">
        <header className="mb-10 space-y-2 border-b border-border pb-8">
          <h1 className="font-serif text-3xl md:text-4xl font-bold tracking-tight text-foreground">Terms of Service</h1>
          <p className="text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
          <p className="text-sm leading-relaxed text-muted-foreground pt-2">
            These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of VOETutor
            (&ldquo;VOETutor&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;), a premium video-tutoring platform for IB
            students and educators operated by WSMath. By creating an account or using the platform, you agree to these
            Terms. If you do not agree, please do not use VOETutor.
          </p>
        </header>

        <div className="space-y-10">
          <Section id="eligibility" title="1. Eligibility and accounts">
            <p>
              To use VOETutor you must be able to form a binding agreement, or use the platform with the involvement
              of a parent or guardian where you are below the age of digital consent in your country. You agree to
              provide accurate information when registering and to keep it up to date.
            </p>
            <p>
              You are responsible for your account and for keeping your password secure. You must not share your
              account, and you must notify us promptly of any unauthorised use. We may suspend or terminate accounts
              that violate these Terms.
            </p>
          </Section>

          <Section id="roles" title="2. Roles on the platform">
            <p>VOETutor has three kinds of account:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong className="text-foreground">Students</strong> enrol in classes, watch lessons, track their
                progress, and take part in class discussions.
              </li>
              <li>
                <strong className="text-foreground">Educators</strong> apply for an account, and — once approved by an
                administrator — create classes, upload videos, publish them to the marketplace, and communicate with
                enrolled students. Educator accounts remain in a pending state until approved.
              </li>
              <li>
                <strong className="text-foreground">Administrators</strong> review educator applications, moderate the
                marketplace, and manage the platform.
              </li>
            </ul>
            <p>
              VOETutor provides the platform that connects students and educators. The educational and tutoring
              services are provided by the educators themselves; VOETutor is not the provider of those services and is
              not a party to the arrangement between a student and an educator.
            </p>
          </Section>

          <Section id="educator-content" title="3. Educator content and conduct">
            <p>
              As an educator, you retain ownership of the videos, PDF notes, descriptions, profile information, images,
              and other content you create. By uploading content, you grant VOETutor a non-exclusive licence to host,
              encode, store, and deliver it to your enrolled students and, where applicable, to display your profile,
              class listings, and any testimonials you add to prospective students.
            </p>
            <p>You represent that you have the rights to everything you upload, and you agree not to publish content that:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>infringes anyone&apos;s intellectual property or other rights;</li>
              <li>is unlawful, misleading, harassing, hateful, or otherwise objectionable;</li>
              <li>misrepresents your qualifications, the contents of a class, or its price.</li>
            </ul>
            <p>
              You are responsible for the accuracy of your class listings, including titles, descriptions, and prices.
              If you add student testimonials to your profile, you confirm they are genuine and that you have the
              person&apos;s permission to display their name, school, and photo.
            </p>
          </Section>

          <Section id="student-conduct" title="4. Student conduct">
            <p>When using VOETutor you agree not to:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>download, copy, redistribute, screen-record, or resell any video, PDF note, or other material without permission;</li>
              <li>share your account or class access with anyone else;</li>
              <li>attempt to bypass access controls, signed video links, or other security measures;</li>
              <li>post unlawful, abusive, or off-topic content in forums and discussions;</li>
              <li>disrupt, overload, or interfere with the platform or other users.</li>
            </ul>
            <p>
              Course materials are provided for your personal learning only. All content remains the property of the
              educator or VOETutor.
            </p>
            <p>
              You keep ownership of what you post in forums and discussions. By posting, you grant VOETutor a
              non-exclusive licence to store and display your contributions to the other members and moderators of the
              relevant class. You are responsible for what you post and must not post anything unlawful, infringing, or
              abusive.
            </p>
          </Section>

          <Section id="enrolment-payment" title="5. Enrolment and payment">
            <p>
              You can enrol in free classes directly. Some classes may be paid, but there is currently no online
              checkout on VOETutor. Where a class is paid for, you and the educator arrange payment directly, outside
              the platform — for example, by bank transfer — and the educator then issues you a single-use invite link
              to enrol.
            </p>
            <p>
              VOETutor is not a party to these off-platform payments, does not process or hold any funds, and is not
              responsible for them. Any questions, disputes, or refunds relating to an off-platform payment are between
              you and the educator. You should only pay an educator you trust, and keep your own record of the
              arrangement.
            </p>
            <p>
              When online checkout is introduced, additional terms covering pricing, payment, refunds, and educator
              payouts will apply and will be published before that feature goes live. Prices, once shown, are in the
              currency stated on the class listing.
            </p>
          </Section>

          <Section id="moderation" title="6. Reporting and moderation">
            <p>
              Students can report classes they believe break these Terms. Administrators review reports and may
              unpublish classes or take other action at their discretion. We may remove content or suspend accounts
              that we reasonably believe violate these Terms, without prior notice where necessary to protect users or
              the platform.
            </p>
          </Section>

          <Section id="availability" title="7. Availability and changes to the service">
            <p>
              We work to keep VOETutor available and reliable, but we provide the platform on an &ldquo;as is&rdquo;
              and &ldquo;as available&rdquo; basis. We may add, change, suspend, or remove features at any time. We are
              not liable for interruptions, data loss, or downtime, though we take reasonable steps to minimise them.
            </p>
          </Section>

          <Section id="ip" title="8. Intellectual property">
            <p>
              The VOETutor name, platform, design, and software are owned by us and protected by intellectual property
              laws. These Terms do not grant you any right to use our branding or software except as needed to use the
              platform as intended. Educator and student content remains owned by its respective creators, subject to
              the licences described above.
            </p>
          </Section>

          <Section id="termination" title="9. Suspension and termination">
            <p>
              You may stop using VOETutor and request deletion of your account at any time. We may suspend or terminate
              your access if you breach these Terms, if required by law, or to protect the platform and its users. On
              termination, your right to access the platform ends; sections of these Terms that by their nature should
              survive will continue to apply.
            </p>
          </Section>

          <Section id="liability" title="10. Disclaimers and limitation of liability">
            <p>
              VOETutor is an educational platform; we do not guarantee any particular academic outcome, exam result, or
              that content is error-free. To the fullest extent permitted by law, VOETutor and its providers are not
              liable for any indirect, incidental, or consequential damages arising from your use of the platform.
            </p>
          </Section>

          <Section id="privacy" title="11. Privacy">
            <p>
              Our <Link href="/privacy">Privacy Policy</Link> explains what data we collect and how we use it. By using
              VOETutor you also agree to that policy.
            </p>
          </Section>

          <Section id="changes" title="12. Changes to these Terms">
            <p>
              We may update these Terms as the platform evolves — for example, when paid checkout launches. We will
              revise the &ldquo;Last updated&rdquo; date above and, for material changes, take reasonable steps to
              notify you. Continued use of VOETutor after changes take effect means you accept the updated Terms.
            </p>
          </Section>

          <Section id="governing-law" title="13. Governing law and disputes">
            <p>
              These Terms are governed by the laws of the Hong Kong Special Administrative Region, without regard to
              its conflict-of-law rules, and subject to any mandatory consumer-protection rights available to you where
              you live. You and we submit to the exclusive jurisdiction of the Hong Kong courts, subject to those
              mandatory rights. If you have a concern, please contact us first — we will try to resolve any dispute
              informally before either of us pursues other options.
            </p>
          </Section>

          <Section id="contact" title="14. Contact us">
            <p>
              Questions about these Terms? Email{" "}
              <a href="mailto:xini@saltancy.com">xini@saltancy.com</a>.
            </p>
          </Section>
        </div>

        <div className="mt-12 border-t border-border pt-6">
          <Link href="/" className="text-sm text-primary font-medium hover:underline">
            ← Back to home
          </Link>
        </div>
      </article>

      <Footer />
    </main>
  );
}
