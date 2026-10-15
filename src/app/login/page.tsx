import { LogoMark, Wordmark } from "@/components/logo";
import { getSession } from "@/lib/auth";
import { PERSONAS } from "@/lib/personas";
import { PersonaPicker } from "./picker";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const current = await getSession();
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="night relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-14">
        <Wordmark light />
        <div className="relative">
          <div className="pointer-events-none absolute -top-40 -left-10 h-[520px] w-[520px] opacity-80">
            <div className="beam" />
          </div>
          <LogoMark size={64} light className="relative mb-10 opacity-90" />
          <h1 className="font-display relative max-w-[520px] text-[56px] leading-[1.02] text-[#F4F1EA]">
            Four agents.
            <br />
            One decision.
            <br />
            <span className="text-[#D9B97A]">A human decides.</span>
          </h1>
        </div>
        <div className="text-[12px] leading-relaxed text-[#9FA9B7]">
          ISTM 6210 Capstone · George Washington University · Fall 2026
          <br />
          Academic prototype. Not affiliated with Walmart Inc.
        </div>
      </section>
      <section className="flex items-center justify-center px-6 py-12 sm:px-12">
        <div className="w-full max-w-[420px]">
          <div className="mb-10 lg:hidden">
            <Wordmark />
          </div>
          <div className="text-[11.5px] tracking-[0.14em] text-brass-dark uppercase">Sign in</div>
          <h2 className="font-display mt-2 text-[40px] leading-none text-ink">Who are you today?</h2>
          <PersonaPicker personas={PERSONAS} currentId={current?.id} />
        </div>
      </section>
    </div>
  );
}
