"use client";

import Link from "next/link";
import ReaderRiverLab, { type RiverBridge, type RiverObservation } from "@/components/ReaderRiverLab";

// Demonstration-only: these positions are invented to exercise UI behavior.
// They are NOT manuscript observations or beta-reader results.
const sampleCommit = "DEMO-NOT-A-REAL-MANUSCRIPT-COMMIT";
const labels = [
  "01 · Arrival", "02 · Uncertainty", "03 · Separation",
  "04 · Invitation", "05 · Fracture", "06 · Resistance",
  "07 · Crossing", "08 · Recognition", "09 · Relapse",
  "10 · Absence", "11 · Synthesis", "12 · Return",
];
const david = [0.4, 0.7, 0.8, 1.4, 1.1, 1.5, 1.8, 2.2, 2.0, 2.5, 2.8, 3.1];
const reader = [0.2, 0.9, 1.0, 1.1, 1.4, 1.7, 2.3, 2.7, 2.4, 3.1, 3.8, 4.4];
const observations: RiverObservation[] = labels.map((label, order) => ({
  sceneId: `demo-${order + 1}`,
  sceneLabel: label,
  order,
  david: david[order],
  reader: reader[order],
  targetLow: Math.max(0, reader[order] - .42),
  targetHigh: reader[order] + .42,
  evidence: "editorial_estimate",
  sourceId: "EXAMPLE ONLY — invented visualization positions",
  manuscriptCommit: sampleCommit,
  assessedAt: "demonstration",
  dimension: "Interpretive synthesis — illustrative units (0–5)",
  note: "Fictional example of visual behavior, not a claim about any chapter, reader, or editorial target.",
}));
const bridges: RiverBridge[] = [
  { id: "demo-bridge-1", sceneId: "demo-4", kind: "recognition", label: "Shared insight", rationale: "Illustrative shared crossing." },
  { id: "demo-bridge-2", sceneId: "demo-6", kind: "misunderstanding", label: "Wrong explanation", rationale: "Illustrative divergence." },
  { id: "demo-bridge-3", sceneId: "demo-8", kind: "delayed_comprehension", label: "Meaning arrives later", rationale: "Illustrative delayed response." },
  { id: "demo-bridge-4", sceneId: "demo-11", kind: "reader_only", label: "Reader gets there first", rationale: "Illustrative crossing unavailable to the protagonist." },
];

export default function ReaderLabPreviewPage() {
  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "24px clamp(14px, 4vw, 48px)", fontFamily: "system-ui, sans-serif" }}>
      <nav style={{ marginBottom: 20 }}><Link href="/" style={{ textDecoration: "underline" }}>← Literary Studio</Link></nav>
      <div style={{ padding: "12px 16px", background: "#fff4d6", border: "1px solid #d4aa48", borderRadius: 8, color: "#42340b", marginBottom: 20 }}>
        <strong>DEMONSTRATION ONLY — NO READER DATA</strong>
        <p style={{ margin: "6px 0 0" }}>All twelve positions, target bands, and bridge events below are invented to demonstrate the interface. They are not assessments of String Theories or human-reader measurements. This route makes no API calls and cannot modify manuscript files.</p>
      </div>
      <p style={{marginBottom:18}}><Link href="/reader-lab/part-one" style={{fontWeight:700,textDecoration:"underline"}}>Open the Part One river map (Chapters 1–5) →</Link></p>
      <ReaderRiverLab observations={observations} bridges={bridges} manuscriptCommit={sampleCommit} />
      <p style={{ marginTop: 24, fontSize: 13, opacity: .75 }}>Preview route: /reader-lab · Isolated frontend feature branch · Experimental visualization</p>
    </main>
  );
}
