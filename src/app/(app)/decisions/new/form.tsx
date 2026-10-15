"use client";

import { ArrowRight, Info, Loader2, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { createCase } from "@/app/actions";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/format";

const PROMOS = [
  ["PRICE_ROLLBACK", "Price rollback", "Lower shelf + online price"],
  ["DIGITAL_COUPON", "Digital coupon", "Clip-to-save in the app"],
  ["ENDCAP_FEATURE", "Endcap feature", "Display + small discount"],
  ["BOGO", "Buy one, get one", "Second item free / discounted"],
  ["BUNDLE_DISCOUNT", "Bundle discount", "Save when bought together"],
  ["CLEARANCE_MARKDOWN", "Clearance markdown", "Clear aged inventory"],
  ["ONLINE_FLASH_DEAL", "Online flash deal", "Short online-only deal"],
  ["INVENTORY_REALLOCATION", "Inventory reallocation", "Move stock, no discount"],
] as const;
const FLAGS = [
  ["price_comparison", "“Was / compare at” price shown"],
  ["free_offer", "Uses the word FREE"],
  ["kids_marketing", "Creative aimed at children"],
  ["limited_time", "Limited-time / urgency language"],
  ["made_in_usa", "“Made in USA” claim"],
];

const field = "h-10 w-full rounded-xl border border-line bg-white px-3 text-[13.5px] outline-none transition focus:border-brand-400 focus:shadow-glow";

export function NewCaseForm({
  clock,
  cats,
  regions,
}: {
  clock: string;
  cats: { id: string; name: string; provenance: string; margin: number; regulated: boolean }[];
  regions: { id: string; name: string; state: string; stores: number }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const defStart = useMemo(() => {
    const d = new Date(`${clock}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 21);
    return d.toISOString().slice(0, 10);
  }, [clock]);
  const [f, setF] = useState({
    category_id: "C08",
    promo_type: "PRICE_ROLLBACK" as (typeof PROMOS)[number][0],
    discount_pct: 12,
    duration_weeks: 4,
    start_date: defStart,
    channel: "OMNICHANNEL" as "OMNICHANNEL" | "STORE_ONLY" | "ONLINE_ONLY",
    scope: "R-WEST",
    claim_text: "",
    vendor_funding_pct: 60,
    reallocation_units: 5000,
    flags: [] as string[],
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const cat = cats.find((c) => c.id === f.category_id);
  const realloc = f.promo_type === "INVENTORY_REALLOCATION";
  const submit = () =>
    start(async () => {
      const r = await createCase(f);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(`${r.id} created. Run the agents when ready.`);
        router.push(`/decisions/${r.id}`);
      }
    });

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="space-y-5">
        <Card className="p-5">
          <h3 className="text-[14px] font-semibold">What</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-[12.5px] font-medium text-ink-2">
              Merchandise category
              <select value={f.category_id} onChange={(e) => set("category_id", e.target.value)} className={cn(field, "mt-1")}>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.provenance === "GENERATED" ? " (generated pattern)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[12.5px] font-medium text-ink-2">
              Stores in scope
              <select value={f.scope} onChange={(e) => set("scope", e.target.value)} className={cn(field, "mt-1")}>
                <option value="ALL">All 50 pilot stores</option>
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.state}) · {r.stores} stores
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-4 text-[12.5px] font-medium text-ink-2">Mechanic</div>
          <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PROMOS.map(([v, l, d]) => (
              <button
                key={v}
                type="button"
                onClick={() => set("promo_type", v)}
                className={cn("rounded-xl border p-2.5 text-left transition", f.promo_type === v ? "border-brand-400 bg-brand-50 ring-2 ring-brand-100" : "border-line bg-white hover:border-[#c9cfdc]")}
              >
                <div className="text-[12.5px] font-semibold text-ink">{l}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-muted">{d}</div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-[14px] font-semibold">How much & when</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {!realloc ? (
              <label className="text-[12.5px] font-medium text-ink-2">
                <div className="flex justify-between">
                  <span>Discount</span>
                  <span className="tnum font-semibold text-brand-700">{f.discount_pct}%</span>
                </div>
                <input type="range" min={0} max={60} value={f.discount_pct} onChange={(e) => set("discount_pct", Number(e.target.value))} className="mt-2 w-full accent-brand-600" />
              </label>
            ) : (
              <label className="text-[12.5px] font-medium text-ink-2">
                Units to reallocate
                <input type="number" min={0} value={f.reallocation_units} onChange={(e) => set("reallocation_units", Number(e.target.value))} className={cn(field, "mt-1")} />
              </label>
            )}
            <label className="text-[12.5px] font-medium text-ink-2">
              <div className="flex justify-between">
                <span>Supplier funding of markdown</span>
                <span className="tnum font-semibold text-brand-700">{f.vendor_funding_pct}%</span>
              </div>
              <input type="range" min={0} max={100} step={5} value={f.vendor_funding_pct} onChange={(e) => set("vendor_funding_pct", Number(e.target.value))} className="mt-2 w-full accent-brand-600" />
            </label>
            <label className="text-[12.5px] font-medium text-ink-2">
              Duration (weeks)
              <input type="number" min={1} max={12} value={f.duration_weeks} onChange={(e) => set("duration_weeks", Number(e.target.value))} className={cn(field, "mt-1")} />
            </label>
            <label className="text-[12.5px] font-medium text-ink-2">
              Start date
              <input type="date" value={f.start_date} onChange={(e) => set("start_date", e.target.value)} className={cn(field, "mt-1")} />
            </label>
            <label className="text-[12.5px] font-medium text-ink-2 sm:col-span-2">
              Channel
              <div className="mt-1 grid grid-cols-3 gap-2">
                {(
                  [
                    ["OMNICHANNEL", "Stores + online"],
                    ["STORE_ONLY", "Stores only"],
                    ["ONLINE_ONLY", "Online only"],
                  ] as const
                ).map(([v, l]) => (
                  <button key={v} type="button" onClick={() => set("channel", v)} className={cn("h-10 rounded-xl border text-[13px] font-medium", f.channel === v ? "border-brand-400 bg-brand-50 text-brand-700" : "border-line bg-white text-ink-2")}>
                    {l}
                  </button>
                ))}
              </div>
            </label>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-[14px] font-semibold">Marketing & compliance</h3>
          <label className="mt-3 block text-[12.5px] font-medium text-ink-2">
            Marketing claim (shown to customers)
            <input value={f.claim_text} onChange={(e) => set("claim_text", e.target.value)} maxLength={240} placeholder="e.g. Clinically proven cold & flu relief - save this season" className={cn(field, "mt-1")} />
          </label>
          <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-muted">
            <ShieldAlert className="size-3.5" /> Treated as untrusted data: screened for prompt-injection and never followed as an instruction by the agents.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {FLAGS.map(([v, l]) => (
              <label key={v} className="flex cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2 text-[13px] text-ink-2 hover:bg-canvas">
                <input
                  type="checkbox"
                  className="accent-brand-600"
                  checked={f.flags.includes(v)}
                  onChange={(e) => set("flags", e.target.checked ? [...f.flags, v] : f.flags.filter((x) => x !== v))}
                />
                {l}
              </label>
            ))}
          </div>
        </Card>
      </div>

      <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <Card className="p-5">
          <h3 className="text-[14px] font-semibold">Summary</h3>
          <div className="mt-2 space-y-1.5 text-[13px] text-ink-2">
            <p>
              <span className="text-muted">Category</span> · {cat?.name}
            </p>
            <p>
              <span className="text-muted">Margin assumption</span> · {cat?.margin}%
            </p>
            <p>
              <span className="text-muted">Mechanic</span> · {PROMOS.find((p) => p[0] === f.promo_type)?.[1]}
              {!realloc && ` · ${f.discount_pct}% off`}
            </p>
            <p>
              <span className="text-muted">Scope</span> · {f.scope === "ALL" ? "All 50 stores" : regions.find((r) => r.id === f.scope)?.name}
            </p>
            <p>
              <span className="text-muted">Window</span> · {f.duration_weeks} weeks from {f.start_date}
            </p>
          </div>
          {cat?.regulated && (
            <p className="mt-3 flex gap-1.5 rounded-lg bg-violet-soft px-2.5 py-2 text-[12px] text-[#5b3fd1]">
              <Info className="mt-0.5 size-3.5 shrink-0" /> Regulated category: expect the Legal agent to check product claims carefully.
            </p>
          )}
          <Button className="mt-4 w-full" size="lg" onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : (
              <>
                Create decision case <ArrowRight className="size-4" />
              </>
            )}
          </Button>
          <p className="mt-2 text-center text-[11.5px] text-muted">Evidence snapshot: pilot data through Oct 11, 2026</p>
        </Card>
      </div>
    </div>
  );
}
