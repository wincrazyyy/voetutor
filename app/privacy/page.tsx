import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { SUPPORT_EMAIL } from "@/lib/config/contact";

export const metadata: Metadata = {
  title: "Privacy Policy — VOETutor",
  description:
    "How VOETutor collects, uses, stores, and shares your personal data across our video-tutoring platform.",
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

function DataTable({ rows }: { rows: { what: string; why: string }[] }) {
  return (
    <div className="w-full overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[32rem] text-sm">
        <thead className="bg-muted/50">
          <tr className="text-left">
            <th className="px-4 py-2.5 font-semibold text-foreground">Data</th>
            <th className="px-4 py-2.5 font-semibold text-foreground">Why we hold it</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.what} className="border-t border-border align-top">
              <td className="px-4 py-2.5 font-medium text-foreground">{row.what}</td>
              <td className="px-4 py-2.5 text-muted-foreground">{row.why}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PrivacyPolicy() {
  return (
    <main className="min-h-dvh flex flex-col bg-background selection:bg-primary/20">
      <Navbar />

      <article className="w-full max-w-3xl mx-auto px-5 py-12 md:py-16 flex-1">
        <header className="mb-10 space-y-2 border-b border-border pb-8">
          <h1 className="font-serif text-3xl md:text-4xl font-bold tracking-tight text-foreground">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
          <p className="text-sm leading-relaxed text-muted-foreground pt-2">
            VOETutor, operated by WSMath (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;the platform&rdquo;), is a premium
            video-tutoring platform for IB students and educators, based in Hong Kong. This policy explains what
            personal data we collect, why we collect it, who we share it with, and the rights you have over it. It
            applies to everyone who creates an account or browses the platform.
          </p>
        </header>

        <div className="space-y-10">
          <Section id="data-you-provide" title="1. Information you give us">
            <p>When you sign up and use VOETutor, you provide:</p>
            <DataTable
              rows={[
                {
                  what: "Account details — first name, last name, display name, email address, password, and an optional profile photo (avatar) you choose to upload.",
                  why: "To create and secure your account, sign you in, and identify you by name and picture across the platform. Passwords are stored only as salted hashes by our authentication provider; we never see your plaintext password.",
                },
                {
                  what: "Your role — whether you sign up as a student or educator.",
                  why: "To determine what you can see and do on the platform.",
                },
                {
                  what: "Educator application details (educators only) — gender, WhatsApp number, education and institution, degree, major, graduation year, teaching experience, teaching subjects, and a self-introduction.",
                  why: "So an administrator can review and approve your educator account. Your self-introduction and professional background may be displayed publicly on your educator profile; your WhatsApp number and gender are used for review and are not published.",
                },
                {
                  what: "Educator public profile and media (educators only) — a profile/masthead photo, gallery images, a headline and role label, subject tags, an hourly rate, exam results, and the structured content of your public profile.",
                  why: "To build and display your public educator profile so prospective students can find and evaluate you. This information is published to promote your classes.",
                },
                {
                  what: "Content you create — forum posts, replies, and upvotes; class announcements, videos, and PDF notes you upload (educators), together with their titles and descriptions; and reports you file against a class.",
                  why: "To operate the discussion, curriculum, moderation, and content features you use.",
                },
                {
                  what: "Testimonials you add (educators only) — student testimonials that may include the reviewer's name, school, and photo.",
                  why: "To display reviews on your public profile. If you add these, you confirm you have the person's permission to publish their details; you can remove them at any time.",
                },
                {
                  what: "Invite recipients (educators only) — a prospective student's email address you optionally attach to a single-use invite link.",
                  why: "To bind an invite to a specific person and help you share it. The platform does not send the invite for you.",
                },
              ]}
            />
          </Section>

          <Section id="data-collected-automatically" title="2. Information we collect automatically">
            <DataTable
              rows={[
                {
                  what: "Learning activity — the classes you enrol in, your video playback progress (resume position, total watch time, and whether you completed each lesson), and which class announcements you have read.",
                  why: "To resume videos where you left off, show your progress and unread updates, and give educators aggregate insight into how their lessons are watched.",
                },
                {
                  what: "Lesson analytics — aggregate minutes watched and completion counts per video, derived from the playback progress above.",
                  why: "To show educators how their lessons are performing. These figures come from our own playback tracking, not from our video provider's separate delivery analytics.",
                },
                {
                  what: "Technical and log data — IP address, browser and device information, and access timestamps, recorded by our hosting provider.",
                  why: "To keep the service secure, diagnose problems, and prevent abuse.",
                },
                {
                  what: "Cookies and local storage — an authentication session cookie and your theme preference.",
                  why: "See the Cookies section below.",
                },
              ]}
            />
          </Section>

          <Section id="cookies" title="3. Cookies and local storage">
            <p>
              We use a small number of strictly functional cookies and browser-storage items. We do not use
              advertising or cross-site tracking cookies.
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong className="text-foreground">Authentication cookies</strong> — set by our authentication
                provider to keep you signed in. Without them you cannot log in.
              </li>
              <li>
                <strong className="text-foreground">Theme preference</strong> — stored in your browser to remember
                light/dark mode.
              </li>
            </ul>
          </Section>

          <Section id="how-we-use" title="4. How we use your data">
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Provide, maintain, and secure the platform and your account.</li>
              <li>Authenticate you and keep you signed in.</li>
              <li>Review and approve educator applications.</li>
              <li>Track and resume your learning progress, and surface analytics to educators.</li>
              <li>Operate the marketplace, forums, announcements, and moderation tools.</li>
              <li>Communicate with you about your account, including email verification and password resets.</li>
              <li>Detect, prevent, and respond to fraud, abuse, and security issues.</li>
            </ul>
          </Section>

          <Section id="sharing" title="5. Who we share your data with">
            <p>
              We do not sell your personal data. We share it only with the service providers that run the platform
              on our behalf, each acting as a data processor under contract:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong className="text-foreground">Supabase</strong> — hosts our database and handles authentication
                (your account, profile, learning activity, and content), and logs technical data such as IP addresses
                and sign-in times as part of authentication.
              </li>
              <li>
                <strong className="text-foreground">Cloudflare Stream</strong> — stores, encodes, and delivers
                uploaded videos.
              </li>
              <li>
                <strong className="text-foreground">Cloudflare R2</strong> — stores the PDF notes that educators
                upload.
              </li>
              <li>
                <strong className="text-foreground">Resend</strong> — delivers account emails such as sign-up
                verification and password-reset messages.
              </li>
              <li>
                <strong className="text-foreground">Vercel</strong> — hosts and serves the application, and processes
                technical and log data.
              </li>
            </ul>
            <p>
              We may also disclose data if required by law, or to protect the rights, safety, and security of
              VOETutor and its users.
            </p>
            <p>
              <strong className="text-foreground">Payments:</strong> online paid checkout is not yet available. Where a
              class is paid for today, payment is arranged directly between you and the educator outside the platform
              (for example, by bank transfer), and access is granted through a single-use invite link — VOETutor does
              not process, receive, or store those payments or any payment-card details. When online checkout launches,
              a third-party payment provider will handle payment details and this policy will be updated before that
              feature goes live.
            </p>
          </Section>

          <Section id="public-info" title="6. Information visible to others">
            <p>
              Some information is public by design. Approved educators have a public profile — visible to anyone,
              including visitors who are not signed in, through our educator directory and homepage — that may display
              their name, photo, professional background, subjects, hourly rate, exam results, and any testimonials
              they add (which can include a reviewer&apos;s name, school, and photo).
            </p>
            <p>
              Within a class, your display name and profile photo appear next to your forum posts, replies, and
              Q&amp;A to the other members of that class. Photos you upload as an avatar, and images you embed in
              posts, are stored at public web addresses, so anyone with the direct link may be able to view them.
              Please keep this in mind when deciding what to share.
            </p>
          </Section>

          <Section id="retention" title="7. Data retention">
            <p>
              We keep your personal data for as long as your account is active. When your account is deleted (at your
              request), we delete your profile and associated content; some records may be retained where we are
              legally required to, or
              where needed to resolve disputes and enforce our agreements. Server and security logs are retained for a
              limited period by our hosting provider.
            </p>
          </Section>

          <Section id="security" title="8. How we protect your data">
            <p>
              Access to your data is restricted at the database level by row-level security, so users can only read
              and write the records they are authorised to. Passwords are stored as salted hashes, traffic is
              encrypted in transit, and uploaded videos and note files are served only through short-lived,
              access-checked links. No system is perfectly secure, but we take reasonable technical and organisational
              measures to protect your information.
            </p>
          </Section>

          <Section id="your-rights" title="9. Your rights">
            <p>
              Depending on where you live, you may have the right to access, correct, export, or delete your personal
              data, to object to or restrict certain processing, and to withdraw consent. You can update much of your
              profile directly in the app. For any other request, contact us using the details below and we will
              respond within a reasonable time.
            </p>
          </Section>

          <Section id="children" title="10. Children and younger students">
            <p>
              VOETutor serves IB students, some of whom are under 18. We collect only the data needed to provide the
              service. If you are below the age of digital consent in your country, please use VOETutor with the
              involvement of a parent or guardian. If you believe a child has provided us data without appropriate
              consent, contact us and we will remove it.
            </p>
          </Section>

          <Section id="international" title="11. International data transfers">
            <p>
              Our service providers may process and store data in countries other than your own. Where data is
              transferred internationally, we rely on those providers&apos; safeguards to keep it protected to the
              standard described in this policy.
            </p>
          </Section>

          <Section id="changes" title="12. Changes to this policy">
            <p>
              We may update this policy as the platform evolves — for example, when paid checkout launches. We will
              revise the &ldquo;Last updated&rdquo; date above and, for material changes, take reasonable steps to
              notify you.
            </p>
          </Section>

          <Section id="contact" title="13. Contact us">
            <p>
              Questions about this policy or your data? Email{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
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
