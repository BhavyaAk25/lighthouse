import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";

export interface NextItem {
  id: string;
  title: string;
  action: string;
}

/** After you act on a case, the next thing that needs you (or a way back to your desk). */
export function NextUp({ next }: { next: NextItem | null }) {
  if (!next)
    return (
      <Link href="/home" className="card flex items-center gap-3 px-4 py-3 text-[13px] text-ink-2 hover:border-[#D8D3C7]">
        <Check className="size-4 shrink-0 text-ok" />
        <span className="flex-1">You’re all caught up.</span>
        <span className="text-muted">My desk →</span>
      </Link>
    );
  return (
    <Link href={`/decisions/${next.id}#act`} className="group card flex items-center gap-3 border-brass px-4 py-3 hover:shadow-pop">
      <div className="min-w-0 flex-1">
        <div className="text-[10.5px] tracking-[0.14em] text-brass-dark uppercase">Next for you</div>
        <div className="mt-0.5 truncate text-[13.5px] text-ink">
          <span className="font-mono text-[11.5px] text-faint">{next.id}</span> {next.title}
        </div>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1 rounded-[8px] bg-brand-600 px-2.5 py-1.5 text-[12px] text-[#F4F1EA] group-hover:bg-brand-700">
        {next.action} <ArrowRight className="size-3.5" />
      </span>
    </Link>
  );
}
