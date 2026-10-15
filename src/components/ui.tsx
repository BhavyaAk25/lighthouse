import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/format";

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "success" | "soft";
const BTN: Record<BtnVariant, string> = {
  primary: "bg-brand-600 text-[#F4F1EA] hover:bg-brand-700 active:bg-brand-800",
  secondary: "bg-white text-ink border border-line hover:bg-canvas hover:border-[#D8D3C7]",
  ghost: "text-ink-2 hover:bg-line-2",
  danger: "bg-bad text-white hover:bg-[#9C3A2A]",
  success: "bg-ok text-white hover:bg-[#0e8a5b]",
  soft: "bg-brass-soft text-brass-dark hover:bg-[#EFE4CC]",
};
const SIZE = { sm: "h-8 px-3 text-[13px] gap-1.5", md: "h-9 px-3.5 text-sm gap-2", lg: "h-11 px-5 text-[15px] gap-2" };

export function buttonClass(variant: BtnVariant = "primary", size: keyof typeof SIZE = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center rounded-[8px] font-medium transition-all duration-150 select-none whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none active:scale-[.98]",
    BTN[variant],
    SIZE[size],
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...p
}: ComponentProps<"button"> & { variant?: BtnVariant; size?: keyof typeof SIZE }) {
  return <button className={buttonClass(variant, size, className)} {...p} />;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  ...p
}: ComponentProps<typeof Link> & { variant?: BtnVariant; size?: keyof typeof SIZE }) {
  return <Link className={buttonClass(variant, size, className)} {...p} />;
}

export function Card({ className, ...p }: ComponentProps<"div">) {
  return <div className={cn("card", className)} {...p} />;
}

export function CardHeader({ title, subtitle, action, icon, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 px-5 pt-4 pb-3", className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <div className="mt-0.5 text-muted">{icon}</div>}
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

type Tone = "neutral" | "brand" | "ok" | "warn" | "bad" | "info" | "violet";
const TONE: Record<Tone, string> = {
  neutral: "bg-line-2 text-ink-2 ring-line",
  brand: "bg-brand-50 text-brand-700 ring-brand-100",
  ok: "bg-ok-soft text-[#2F6347] ring-[#D3E5D9]",
  warn: "bg-warn-soft text-[#8A5A12] ring-[#EEDCB8]",
  bad: "bg-bad-soft text-[#9C3A2A] ring-[#EBCFC8]",
  info: "bg-info-soft text-[#3E5873] ring-[#D5DEE8]",
  violet: "bg-violet-soft text-[#7A5C2A] ring-[#E9DCC0]",
};

export function Badge({ tone = "neutral", className, children, dot }: { tone?: Tone; className?: string; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium ring-1 ring-inset whitespace-nowrap", TONE[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Stat({ label, value, sub, icon, tone = "neutral", className }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; tone?: Tone; className?: string }) {
  return (
    <Card className={cn("p-4", className)}>
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] text-muted">{label}</span>
        {icon && tone === "brand" ? <span className="text-faint">{icon}</span> : null}
      </div>
      <div className="tnum font-display mt-1.5 text-[28px] leading-none text-ink">{value}</div>
      {sub && <div className="mt-1 text-[12.5px] text-muted">{sub}</div>}
    </Card>
  );
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-center justify-between", className)}>
      <h2 className="text-[11.5px] font-medium uppercase tracking-[0.14em] text-muted">{children}</h2>
      {action}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 text-brass">{icon}</div>}
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ConfidenceRing({ value, size = 44, stroke = 4, label = true }: { value: number; size?: number; stroke?: number; label?: boolean }) {
  const v = Math.max(0, Math.min(1, Number(value) || 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = v >= 0.75 ? "var(--color-ok)" : v >= 0.6 ? "var(--color-brand-600)" : v >= 0.45 ? "var(--color-warn)" : "var(--color-bad)";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--color-line-2)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: "stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)" }}
        />
      </svg>
      {label && (
        <span className="tnum absolute inset-0 grid place-items-center font-semibold text-ink" style={{ fontSize: size * 0.27 }}>
          {v.toFixed(2)}
        </span>
      )}
    </div>
  );
}

export function Meter({ value, max = 100, warn, bad, className }: { value: number; max?: number; warn?: number; bad?: number; className?: string }) {
  const v = Math.max(0, Math.min(1, value / max));
  const color = bad !== undefined && value >= bad ? "bg-bad" : warn !== undefined && value >= warn ? "bg-warn" : "bg-brand-600";
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-line-2", className)}>
      <div className={cn("h-full rounded-full transition-all duration-700", color)} style={{ width: `${v * 100}%` }} />
    </div>
  );
}

export function KV({ k, v, className }: { k: ReactNode; v: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-1.5 text-[13px]", className)}>
      <span className="text-muted">{k}</span>
      <span className="tnum text-right font-medium text-ink">{v}</span>
    </div>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("font-mono text-[12px] text-ink-2", className)}>{children}</span>;
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-2 text-[11.5px] font-medium tracking-[0.14em] text-brass-dark uppercase">{eyebrow}</div>}
        <h1 className="font-display text-[30px] leading-[1.05] text-ink">{title}</h1>
        {subtitle && <p className="mt-2 max-w-xl text-[14px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
