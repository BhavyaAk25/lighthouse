"use client";

import { useEffect } from "react";

/**
 * After the desk renders, remember how far this person has read the activity feed.
 * Set from the browser (not a server action) so the page does not re-render and hide the feed you are reading.
 */
export function MarkSeen({ personaId, seq }: { personaId: string; seq: number }) {
  useEffect(() => {
    if (seq > 0) document.cookie = `lh_seen_${personaId}=${Math.floor(seq)}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
  }, [personaId, seq]);
  return null;
}
