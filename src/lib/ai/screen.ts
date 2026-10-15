/**
 * Input screening for free-text fields that reach the AI agents (marketing claim, notes).
 * The text is always passed to models as quoted data, never as instructions; this check
 * additionally flags likely prompt-injection attempts so they are visible in the packet.
 */
const PATTERNS: [RegExp, string][] = [
  [/ignore (all |any )?(previous|prior|above) (instructions|rules)/i, "asks the model to ignore its instructions"],
  [/disregard (the )?(system|previous|above)/i, "asks the model to disregard its instructions"],
  [/\b(system prompt|developer message)\b/i, "references the system prompt"],
  [/you are now|act as (an?|the) /i, "attempts to change the model's role"],
  [/(recommend|output|return|respond with)\s*["']?(proceed|approve)/i, "tries to dictate the recommendation"],
  [/<\/?(system|assistant|instructions?)>/i, "contains role tags"],
  [/\b(api[_ -]?key|password|secret)\b/i, "requests secrets"],
];

export interface ScreenResult {
  flagged: boolean;
  reasons: string[];
}

export function screenText(text: string): ScreenResult {
  const reasons = PATTERNS.filter(([re]) => re.test(text)).map(([, r]) => r);
  return { flagged: reasons.length > 0, reasons };
}

/** Wrap untrusted text so models treat it as data. */
export const quoteUntrusted = (text: string) => `<untrusted_case_text>${text.replace(/<\/?untrusted_case_text>/g, "")}</untrusted_case_text>`;
