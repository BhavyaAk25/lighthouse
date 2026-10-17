import { Wordmark } from "@/components/logo";
import { getSession } from "@/lib/auth";
import { PERSONAS } from "@/lib/personas";
import { Harbor } from "./harbor";
import { PersonaPicker } from "./picker";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const current = await getSession();
  return (
    <div className="grid min-h-screen lg:h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="night relative hidden overflow-hidden lg:block">
        <Harbor />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[#06111f]/85 via-[#06111f]/35 to-transparent" />
        {/* text sits over the sky; the scene keeps receiving clicks everywhere else */}
        <div className="pointer-events-none relative z-10 flex h-full flex-col justify-between p-14">
          <div className="pointer-events-auto w-fit">
            <Wordmark light />
          </div>
          <div className="flex-1 pt-[9vh]">
            <h1 className="font-display max-w-[520px] text-[46px] leading-[1.02] text-[#F4F1EA] [text-shadow:0_2px_24px_rgba(5,15,28,0.6)]">
              Four agents.
              <br />
              Four owners.
              <br />
              <span className="text-[#D9B97A]">One decision.</span>
            </h1>
          </div>
          <div className="text-[12px] leading-relaxed text-[#9FA9B7] [text-shadow:0_1px_8px_rgba(5,15,28,0.8)]">
            ISTM 6210 Capstone · George Washington University · Fall 2026
            <br />
            Academic prototype. Not affiliated with Walmart Inc.
          </div>
        </div>
      </section>
      <section className="flex items-center justify-center px-6 py-12 sm:px-12 lg:overflow-y-auto">
        <div className="w-full max-w-[420px]">
          <div className="mb-10 lg:hidden">
            <Wordmark />
          </div>
          <div className="text-[11.5px] tracking-[0.14em] text-brass-dark uppercase">Sign in</div>
          <h2 className="font-display mt-2 text-[32px] leading-none text-ink">Who are you today?</h2>
          <PersonaPicker personas={PERSONAS} currentId={current?.id} />
        </div>
      </section>
    </div>
  );
}
