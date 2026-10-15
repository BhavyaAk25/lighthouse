import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...v: ClassValue[]) => twMerge(clsx(v));

export const money = (v: number | null | undefined, compact = true) => {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return "-";
  const n = Number(v);
  const a = Math.abs(n);
  const s = !compact
    ? `$${a.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
    : a >= 1e9
      ? `$${(a / 1e9).toFixed(2)}B`
      : a >= 1e6
        ? `$${(a / 1e6).toFixed(2)}M`
        : a >= 1e3
          ? `$${(a / 1e3).toFixed(0)}K`
          : `$${a.toFixed(0)}`;
  return (n < 0 ? "-" : "") + s;
};

export const pct = (v: number | null | undefined, d = 1, sign = false) =>
  v === null || v === undefined || !Number.isFinite(Number(v)) ? "-" : `${sign && Number(v) > 0 ? "+" : ""}${Number(v).toFixed(d)}%`;

export const int = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(Number(v)) ? "-" : Math.round(Number(v)).toLocaleString("en-US");

export const dateLabel = (v: string | Date | null | undefined, withTime = false) => {
  if (!v) return "-";
  const d = typeof v === "string" ? new Date(v.length === 10 ? `${v}T12:00:00Z` : v) : v;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
    timeZone: "America/New_York",
  });
};

export const relTime = (v: string | Date) => {
  const d = typeof v === "string" ? new Date(v) : v;
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return dateLabel(d);
};

export const titleCase = (s: string) => s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
