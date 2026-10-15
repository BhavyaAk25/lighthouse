import { cn } from "@/lib/format";

/** Lighthouse mark: a tower casting two light beams (placeholder until a designed logo is added). */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn("relative grid shrink-0 place-items-center overflow-hidden rounded-[10px]", className)}
      style={{ width: size, height: size, background: "linear-gradient(135deg,#3d63dd 0%,#6a5af8 55%,#0e93b8 100%)" }}
    >
      <svg viewBox="0 0 32 32" width={size * 0.78} height={size * 0.78} fill="none" aria-hidden>
        <path d="M16 9.5 L29 5 L29 14 Z" fill="white" opacity=".35" />
        <path d="M16 9.5 L3 5 L3 14 Z" fill="white" opacity=".22" />
        <path d="M13.2 12h5.6l1.6 15H11.6z" fill="white" />
        <path d="M12.4 17.2h7.2M12 22h8" stroke="#3d63dd" strokeWidth="1.4" opacity=".55" />
        <rect x="13" y="7" width="6" height="4.6" rx="1.2" fill="white" />
        <circle cx="16" cy="9.3" r="1.3" fill="#ffd166" />
        <path d="M14.6 5.2h2.8l-1.4-1.8z" fill="white" />
        <path d="M9 27.5h14" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="leading-tight">
        <span className="block text-[16px] font-semibold tracking-[-0.02em] text-ink">Lighthouse</span>
        <span className="block text-[11px] font-medium text-muted">Walmart U.S. pilot · Capstone</span>
      </span>
    </span>
  );
}
