import Link from "next/link";
import { cn } from "@/lib/format";

const TABS = [
  { k: "overview", l: "Overview", href: "/overview" },
  { k: "data", l: "Data", href: "/data" },
  { k: "roi", l: "ROI", href: "/roi" },
];

export function InsightTabs({ active }: { active: string }) {
  return (
    <div className="-mt-4 mb-8 flex gap-6 border-b border-line">
      {TABS.map((t) => (
        <Link key={t.k} href={t.href} className={cn("-mb-px border-b-2 pb-2.5 text-[14px] transition", active === t.k ? "border-brass text-ink" : "border-transparent text-muted hover:text-ink")}>
          {t.l}
        </Link>
      ))}
    </div>
  );
}
