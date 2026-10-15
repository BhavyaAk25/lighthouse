"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { cn } from "@/lib/format";

const RECS = [
  ["", "Any recommendation"],
  ["PROCEED", "Proceed"],
  ["PROCEED_WITH_CONDITIONS", "Proceed with conditions"],
  ["HOLD", "Hold"],
  ["REJECT", "Reject"],
  ["REVIEW_REQUIRED", "Review required"],
];

export function Filters({ q, cat, rec, conflict, cats }: { q: string; cat: string; rec: string; conflict: boolean; cats: { id: string; name: string }[] }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [text, setText] = useState(q);
  const [pending, start] = useTransition();
  const push = (patch: Record<string, string>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) (v ? p.set(k, v) : p.delete(k));
    p.delete("page");
    start(() => router.push(`${path}?${p.toString()}`));
  };
  useEffect(() => {
    const t = setTimeout(() => text !== q && push({ q: text }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  const sel = "h-9 rounded-[10px] border border-line bg-white px-2.5 text-[13px] text-ink-2 outline-none focus:border-brand-400";
  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:items-center", pending && "opacity-70")}>
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search by ID, title or marketing claim…"
          className="h-9 w-full rounded-[10px] border border-line bg-white pr-8 pl-9 text-[13.5px] outline-none placeholder:text-faint focus:border-brand-400 focus:shadow-glow"
        />
        {text && (
          <button onClick={() => setText("")} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-faint hover:text-ink" aria-label="Clear">
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <select value={cat} onChange={(e) => push({ cat: e.target.value })} className={sel}>
        <option value="">All categories</option>
        {cats.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select value={rec} onChange={(e) => push({ rec: e.target.value })} className={sel}>
        {RECS.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[10px] border border-line bg-white px-3 text-[13px] text-ink-2">
        <input type="checkbox" checked={conflict} onChange={(e) => push({ conflict: e.target.checked ? "1" : "" })} className="accent-brand-600" />
        Material conflicts
      </label>
    </div>
  );
}
