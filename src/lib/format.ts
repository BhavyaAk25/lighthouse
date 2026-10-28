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

/** "81% confident" (one format for confidence everywhere). */
export const confident = (v: number | null | undefined) => (v === null || v === undefined ? "" : `${Math.round(Number(v) * 100)}% confident`);

/** Shorten long dollar figures inside prose: "-$1,279,278" -> "-$1.28M", "$352,140" -> "$352K". */
export function plainMoney(text: string): string {
  return text
    .replace(/\s*—\s*/g, ", ") // AI prose loves em dashes; plain commas read calmer
    .replace(/\b(BLOCKED|CLEAR|WARNING|PENDING|HOLD|REJECT|PROCEED_WITH_CONDITIONS|PROCEED|REVIEW_REQUIRED)\b/g, (w) => w.toLowerCase().replace(/_/g, " "))
    .replace(/\bdecision owner\b/gi, "executive")
    .replace(/\bthe governance (layer|recommendation)\b/gi, (_m, w: string) => (w === "layer" ? "Lighthouse" : "Lighthouse’s recommendation"))
    .replace(/\bconfidence (?:of )?0\.(\d{2})\b/g, (_m, d: string) => `${Number(d)}% confidence`)
    .replace(/(-|−)?\$\s?(\d{1,3}(?:,\d{3})+|\d{4,})(?:\.\d+)?/g, (_m, neg, num) => {
    const n = Number(String(num).replace(/,/g, ""));
    const sign = neg ? "−" : "";
    if (n >= 1e9) return `${sign}$${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `${sign}$${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M`;
    if (n >= 1e3) return `${sign}$${Math.round(n / 1e3)}K`;
    return `${sign}$${n}`;
  });
}

/** The first n sentences of a paragraph (for AI prose shown at a glance). */
export function firstSentences(text: string, n = 1): string {
  // split only at a sentence end (punctuation, then a space and a capital/quote), never inside "$2.12M" or "e.g."
  const parts = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+(?=[A-Z“"(])/);
  return parts.slice(0, n).join(" ").trim();
}
