import { CircleDollarSign, Scale, TrendingUp, Truck } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { getSession } from "@/lib/auth";
import { PERSONAS } from "@/lib/personas";
import { PersonaPicker } from "./picker";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const current = await getSession();
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="mesh relative hidden overflow-hidden border-r border-line lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="flex items-center gap-3">
          <LogoMark size={40} />
          <div>
            <div className="text-[19px] font-semibold tracking-[-0.02em]">Lighthouse</div>
            <div className="text-[12.5px] text-muted">AI Agent Orchestration & Decision Intelligence</div>
          </div>
        </div>
        <div className="max-w-[520px]">
          <h1 className="text-[40px] leading-[1.08] font-semibold tracking-[-0.035em] text-ink">
            Four AI agents.
            <br />
            One auditable decision.
            <br />
            <span className="bg-gradient-to-r from-brand-600 via-violet to-info bg-clip-text text-transparent">A human always decides.</span>
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-ink-2">
            Lighthouse reconciles Finance, Sales, Operations and Legal agents for Walmart U.S. promotion and inventory decisions. It surfaces conflicts instead
            of averaging them away, enforces a legal review gate, and records every step in a tamper-evident audit log.
          </p>
          <div className="mt-8 grid grid-cols-4 gap-3">
            {[
              { n: "Sales", c: "var(--color-sales)", i: <TrendingUp className="size-4" /> },
              { n: "Finance", c: "var(--color-finance)", i: <CircleDollarSign className="size-4" /> },
              { n: "Operations", c: "var(--color-ops)", i: <Truck className="size-4" /> },
              { n: "Legal", c: "var(--color-legal)", i: <Scale className="size-4" /> },
            ].map((a) => (
              <div key={a.n} className="rounded-xl border border-white/60 bg-white/70 p-3 shadow-card backdrop-blur">
                <span className="grid size-7 place-items-center rounded-lg text-white" style={{ background: a.c }}>
                  {a.i}
                </span>
                <div className="mt-2 text-[12.5px] font-semibold text-ink">{a.n}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="text-[12px] text-muted">
          ISTM 6210/4210 Capstone · Fall 2026 · Ajay · Bhavya · Ehson · Jaehoon · Kunal · Wilfred · Advisor: Dr. Soheil Sibdari
          <br />
          Academic prototype; not affiliated with Walmart Inc. Pilot data combines public Kaggle Walmart sales with generated records.
        </div>
      </section>
      <section className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[480px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <LogoMark size={36} />
            <div className="text-[18px] font-semibold">Lighthouse</div>
          </div>
          <h2 className="text-[24px] font-semibold tracking-[-0.025em]">Choose who you are</h2>
          <p className="mt-1.5 text-[14px] text-muted">
            Each role sees what it is allowed to do. Switch roles at any time to walk through the governance flow.
          </p>
          <PersonaPicker personas={PERSONAS} currentId={current?.id} />
        </div>
      </section>
    </div>
  );
}
