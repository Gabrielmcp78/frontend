"use client";

import React, { useMemo, useState } from "react";

/**
 * Reader River Lab — presentational, read-only research instrument.
 * No synthetic reader scores are treated as measurements.
 * Parent supplies versioned observations; this component never edits manuscript source.
 */
export type EvidenceKind = "editorial_estimate" | "human_reader" | "simulated_panel";
export type BridgeKind = "recognition" | "misunderstanding" | "delayed_comprehension" | "reader_only";
export interface RiverObservation {
  sceneId: string;
  sceneLabel: string;
  order: number;
  david: number | null;
  reader: number | null;
  /** Explicitly an editorial goal, never a confidence interval. */
  targetLow?: number | null;
  targetHigh?: number | null;
  evidence: EvidenceKind;
  sourceId: string;
  manuscriptCommit: string;
  assessedAt: string;
  dimension: string;
  note?: string;
}
export interface RiverBridge {
  id: string;
  sceneId: string;
  kind: BridgeKind;
  label: string;
  rationale?: string;
}
export interface ReaderRiverLabProps {
  observations: RiverObservation[];
  bridges?: RiverBridge[];
  manuscriptCommit?: string;
  onSelectScene?: (sceneId: string) => void;
}

const COLORS = {
  david: "#d97706",
  reader: "#0d9488",
  target: "#a78bfa",
  bridge: "#64748b",
};
const labelForEvidence: Record<EvidenceKind, string> = {
  editorial_estimate: "Editorial estimate",
  human_reader: "Human reader",
  simulated_panel: "Simulated panel",
};
const labelForBridge: Record<BridgeKind, string> = {
  recognition: "Shared recognition",
  misunderstanding: "Misunderstanding",
  delayed_comprehension: "Delayed comprehension",
  reader_only: "Reader-only crossing",
};
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const valid = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

export default function ReaderRiverLab({
  observations, bridges = [], manuscriptCommit, onSelectScene,
}: ReaderRiverLabProps) {
  const [dimension, setDimension] = useState<string>("all");
  const [evidence, setEvidence] = useState<EvidenceKind | "all">("all");
  const [zoom, setZoom] = useState(100);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const dims = useMemo(() => [...new Set(observations.map(o => o.dimension))].sort(), [observations]);
  const filtered = useMemo(() => observations
    .filter(o => (dimension === "all" || o.dimension === dimension) && (evidence === "all" || o.evidence === evidence))
    .sort((a, b) => a.order - b.order), [observations, dimension, evidence]);
  const count = filtered.length;
  const windowSize = Math.max(1, Math.ceil(count * 100 / zoom));
  const start = clamp(offset, 0, Math.max(0, count - windowSize));
  const visible = filtered.slice(start, start + windowSize);
  const values = visible.flatMap(o => [o.david, o.reader, o.targetLow, o.targetHigh]).filter(valid);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const span = Math.max(0.5, max - min);
  const yMin = min - span * 0.12;
  const yMax = max + span * 0.12;
  const width = 920, height = 420, left = 72, right = 24, top = 30, bottom = 85;
  const plotW = width - left - right, plotH = height - top - bottom;
  const x = (i: number) => left + (visible.length < 2 ? plotW / 2 : i * plotW / (visible.length - 1));
  const y = (v: number) => top + (yMax - v) / (yMax - yMin) * plotH;
  const path = (key: "david" | "reader") => {
    let d = "", connected = false;
    visible.forEach((o, i) => {
      const v = o[key];
      if (!valid(v)) { connected = false; return; }
      d += (connected ? " L" : " M") + x(i).toFixed(1) + " " + y(v).toFixed(1);
      connected = true;
    });
    return d;
  };
  const active = visible.find(o => o.sceneId === selected) ?? null;
  const jump = (sceneId: string) => { setSelected(sceneId); onSelectScene?.(sceneId); };
  const zoomTo = (next: number) => { setZoom(next); setOffset(0); };

  return (
    <section aria-label="Reader River Laboratory" style={{ fontFamily: "inherit", color: "inherit", display: "grid", gap: 16 }}>
      <header>
        <h2 style={{ fontSize: 20, fontWeight: 650, margin: 0 }}>Reader River Laboratory</h2>
        <p style={{ opacity: 0.8, margin: "6px 0" }}>Separate trajectories of David and the reader; crossings are narrative events, not automatically successes.</p>
        <small>Manuscript: {manuscriptCommit || "Unpinned — do not interpret as a reproducible study"}</small>
      </header>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
        <label>Dimension <select aria-label="Analysis dimension" value={dimension} onChange={e => { setDimension(e.target.value); setOffset(0); }}><option value="all">All dimensions (inspect separately)</option>{dims.map(d => <option key={d} value={d}>{d}</option>)}</select></label>
        <label>Evidence <select aria-label="Evidence class" value={evidence} onChange={e => { setEvidence(e.target.value as EvidenceKind | "all"); setOffset(0); }}><option value="all">All classes (not pooled)</option>{Object.entries(labelForEvidence).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Zoom <select aria-label="Horizontal zoom" value={zoom} onChange={e => zoomTo(Number(e.target.value))}>{[100, 150, 200, 300, 500].map(v => <option key={v} value={v}>{v}%</option>)}</select></label>
        <button type="button" onClick={() => setOffset(Math.max(0, start - windowSize))} disabled={!start}>Previous</button>
        <button type="button" onClick={() => setOffset(Math.min(Math.max(0, count - windowSize), start + windowSize))} disabled={start + windowSize >= count}>Next</button>
      </div>
      <div role="group" aria-label="Trajectory legend" style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 13 }}>
        <span style={{ color: COLORS.david }}>● David: character understanding</span>
        <span style={{ color: COLORS.reader }}>● Reader: inferred/observed understanding</span>
        <span style={{ color: COLORS.target }}>▧ Target corridor: editorial goal</span>
        <span>│ Bridge: narrated crossing</span>
      </div>
      {!visible.length ? <p role="status">No scored observations for these filters. This is not evidence of reader parity. Add source-linked scene assessments to begin.</p> :
        <div style={{ overflowX: "auto", border: "1px solid rgba(128,128,128,.25)", borderRadius: 12 }}>
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Scene-by-scene positions of David and reader, with independent editorial target bands and crossing markers" style={{ minWidth: 580, width: "100%", height: "auto" }}>
            {Array.from({length: 5}, (_, i) => {
              const v = yMin + (yMax - yMin) * i / 4;
              return <g key={i}><line x1={left} x2={width-right} y1={y(v)} y2={y(v)} stroke="currentColor" opacity=".12"/><text x={left-10} y={y(v)+4} textAnchor="end" fontSize="12" fill="currentColor">{v.toFixed(1)}</text></g>;
            })}
            {visible.map((o, i) => {
              const low = o.targetLow, high = o.targetHigh;
              if (!valid(low) || !valid(high) || low > high) return null;
              const rectW = Math.max(8, plotW / Math.max(visible.length, 2) * .72);
              return <rect key={o.sceneId + "-target"} x={x(i)-rectW/2} width={rectW} y={y(high)} height={Math.max(2,y(low)-y(high))} fill={COLORS.target} opacity=".23" />;
            })}
            <path d={path("david")} fill="none" stroke={COLORS.david} strokeWidth="3" strokeLinejoin="round"/>
            <path d={path("reader")} fill="none" stroke={COLORS.reader} strokeWidth="3" strokeLinejoin="round"/>
            {visible.map((o, i) => <g key={o.sceneId}>
              {valid(o.david) && <circle cx={x(i)} cy={y(o.david)} r="5" fill={COLORS.david}/>}
              {valid(o.reader) && <circle cx={x(i)} cy={y(o.reader)} r="5" fill={COLORS.reader}/>}
              {bridges.filter(b => b.sceneId === o.sceneId).map((b, j) => <g key={b.id}><line x1={x(i)+j*4} x2={x(i)+j*4} y1={top} y2={top+plotH} stroke={COLORS.bridge} strokeDasharray="3 7" opacity=".55"/><text x={x(i)+j*4} y={top-8} textAnchor="middle" fontSize="15" fill={b.kind === "reader_only" ? COLORS.reader : COLORS.bridge}>◆</text></g>)}
              <text x={x(i)} y={top+plotH+18} textAnchor="middle" fontSize="11" fill="currentColor">{o.sceneLabel.slice(0, 15)}</text>
              <circle cx={x(i)} cy={top+plotH+35} r="11" fill={selected===o.sceneId ? COLORS.reader : "transparent"} stroke="currentColor" opacity=".75" />
              <text x={x(i)} y={top+plotH+39} textAnchor="middle" fill={selected===o.sceneId ? "white" : "currentColor"} fontSize="10">{i+start+1}</text>
              <rect x={x(i)-13} y={top+plotH+22} width="26" height="26" fill="transparent" role="button" tabIndex={0} aria-label={`Inspect ${o.sceneLabel}`} onClick={() => jump(o.sceneId)} onKeyDown={e => { if(e.key==="Enter" || e.key===" "){e.preventDefault();jump(o.sceneId);} }} />
            </g>)}
            <text x={left} y={height-7} fontSize="12" fill="currentColor">Story progression →</text>
          </svg>
        </div>}
      {active && <aside style={{ borderLeft: `3px solid ${COLORS.reader}`, paddingLeft: 14 }}>
        <strong>{active.sceneLabel}</strong>
        <p>{labelForEvidence[active.evidence]} · {active.dimension} · {active.assessedAt}</p>
        <p>David: {valid(active.david) ? active.david : "Not estimated"} · Reader: {valid(active.reader) ? active.reader : "Not estimated"} · Difference: {valid(active.reader) && valid(active.david) ? (active.reader-active.david).toFixed(2) : "Unknown"}</p>
        <p>Source: {active.sourceId} · Manuscript: {active.manuscriptCommit}</p>
        {active.note && <p>{active.note}</p>}
        {bridges.filter(b => b.sceneId === active.sceneId).map(b => <p key={b.id}><strong>{labelForBridge[b.kind]}:</strong> {b.label}{b.rationale ? ` — ${b.rationale}` : ""}</p>)}
      </aside>}
      <footer style={{ fontSize: 12, opacity: .8 }}>
        Editorial target bands are desired reading positions, not confidence intervals. Mixed evidence classes are shown for comparison only, never averaged as if equivalent. Scores require an explicit rubric and manuscript revision before cross-session interpretation.
      </footer>
    </section>
  );
}
