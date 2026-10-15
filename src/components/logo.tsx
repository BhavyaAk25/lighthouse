import { cn } from "@/lib/format";

/** Minimal line mark: a lighthouse with a single brass lamp. */
export function LogoMark({ size = 32, className, light = false }: { size?: number; className?: string; light?: boolean }) {
  const stroke = light ? "#F4F1EA" : "#142B45";
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} fill="none" aria-hidden className={cn("shrink-0", className)}>
      <path d="M16 3.5l2.4 3H13.6z" fill={stroke} />
      <rect x="12.6" y="6.6" width="6.8" height="4.4" rx="1" stroke={stroke} strokeWidth="1.4" />
      <circle cx="16" cy="8.8" r="1.25" fill="#B08A4A" />
      <path d="M13.3 11.4h5.4l1.5 15.1h-8.4z" stroke={stroke} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M12.9 16.4h6.2M12.4 21.4h7.2" stroke={stroke} strokeWidth="1.2" opacity=".55" />
      <path d="M7.5 26.8h17" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M20.4 8.8L29 6.2M20.4 8.8L29 11.2" stroke="#B08A4A" strokeWidth="1.1" strokeLinecap="round" opacity=".9" />
    </svg>
  );
}

export function Wordmark({ className, light = false }: { className?: string; light?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <LogoMark size={28} light={light} />
      <span className={cn("font-display text-[17px] leading-none", light ? "text-[#F4F1EA]" : "text-ink")}>Lighthouse</span>
    </span>
  );
}
