import { Hourglass } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/format";

export function WaitingNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 rounded-[12px] border border-line bg-white px-5 py-4 text-[14px] text-ink-2", className)}>
      <Hourglass className="size-4 shrink-0 text-brass" strokeWidth={1.6} />
      <span>{children}</span>
    </div>
  );
}
