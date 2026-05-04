import { CheckCircle2, Star, TrendingUp, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export function Pricing() {
  return (
    <section className="w-full py-24 bg-muted/30 flex flex-col items-center border-t">
      <div className="max-w-6xl mx-auto px-5 w-full">
        
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
          <div className="flex flex-col gap-6 max-w-xl">
            <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight text-foreground leading-tight">
              The only resource you need for a Level 7.
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Stop guessing what to study. Our IBDP Math Mastery System provides a complete, A-to-Z roadmap. We've stripped away the fluff so you can focus entirely on what actually appears on the exams.
            </p>
            
            <div className="flex flex-col gap-5 mt-4">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-primary/10 rounded-lg text-primary shrink-0">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-semibold text-foreground text-lg">Measurable Progress</h4>
                  <p className="text-muted-foreground">Weekly assessments ensure you are constantly moving toward your target grade.</p>
                </div>
              </div>
              
              <div className="flex items-start gap-4">
                <div className="p-2 bg-primary/10 rounded-lg text-primary shrink-0">
                  <Star className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-semibold text-foreground text-lg">Exam-First Strategy</h4>
                  <p className="text-muted-foreground">Every lesson is directly tied to historical past-paper trends from 2008 to 2025.</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="p-2 bg-primary/10 rounded-lg text-primary shrink-0">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-semibold text-foreground text-lg">Direct Educator Support</h4>
                  <p className="text-muted-foreground">Never get stuck. Access bridging support for pre-DP concepts whenever you need it.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="w-full max-w-md mx-auto lg:ml-auto">
            <div className="flex flex-col p-8 bg-card text-card-foreground rounded-3xl border border-border shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500"></div>

              <div className="inline-block bg-primary/10 text-primary text-sm font-bold px-4 py-1.5 rounded-full w-fit mb-6 mt-2">
                High-value Structured Package
              </div>

              <h3 className="text-2xl font-extrabold mb-2">IBDP Math Mastery System</h3>
              <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
                A structured, exam-first programme designed primarily for IBDP students, with bridging support.
              </p>

              <div className="mb-8 p-5 bg-muted/50 rounded-2xl border border-border/50">
                <div className="flex items-center gap-2 mb-2 text-xs font-medium flex-wrap">
                  <span className="line-through text-muted-foreground">HKD 60,000</span>
                  <span className="text-emerald-700 bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-400 px-2 py-0.5 rounded-md font-bold tracking-wide">
                    SAVE 67%
                  </span>
                  <span className="text-muted-foreground whitespace-nowrap">• Save HKD 40,200</span>
                </div>
                
                <div className="flex flex-col gap-1">
                  <span className="text-4xl font-black text-foreground tracking-tight">HKD 19,800</span>
                  <span className="text-muted-foreground text-sm font-medium">
                    Full programme <span className="opacity-75">(~HKD 600 / lesson)</span>
                  </span>
                </div>
              </div>
              <ul className="flex flex-col gap-4 mb-8 flex-1 text-sm">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="font-medium leading-relaxed">
                    Approx. 32+ high-quality live Zoom lessons with replays available.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="font-medium leading-relaxed">
                    Topic-by-topic notes + curated past-paper practice (2008–2025).
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="font-medium leading-relaxed">
                    Built for motivated students who want a full structure and routines.
                  </span>
                </li>
              </ul>
              <Link href="/register?plan=mastery" className="w-full mt-auto">
                <Button className="w-full rounded-full text-lg font-bold h-12 shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5">
                  Enroll Now
                </Button>
              </Link>
              
              <p className="text-center text-xs text-muted-foreground mt-4">
                Secure checkout via Stripe.
              </p>

            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
