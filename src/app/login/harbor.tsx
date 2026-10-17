"use client";

import dynamic from "next/dynamic";

// three.js only runs in the browser; the night panel shows its navy background until the scene fades in
const LighthouseScene = dynamic(() => import("@/components/lighthouse-scene"), { ssr: false });

export function Harbor() {
  return <LighthouseScene className="absolute inset-0" />;
}
