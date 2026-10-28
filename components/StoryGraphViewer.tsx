"use client";

import React, { useEffect, useRef, useState } from "react";
import cytoscape, { type ElementDefinition } from "cytoscape";

interface StoryGraphResponse {
  source: string;
  status: string;
  nodes: ElementDefinition[];
  edges: ElementDefinition[];
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

export default function StoryGraphViewer({
  projectId,
  onSelectScene,
}: {
  projectId: string | null;
  onSelectScene: (sceneNumber: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onSelectSceneRef = useRef(onSelectScene);
  const [graph, setGraph] = useState<StoryGraphResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onSelectSceneRef.current = onSelectScene;
  }, [onSelectScene]);

  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    fetch(`${API_BASE}/api/projects/${projectId}/story-graph`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Graph service returned ${response.status}.`);
        return (await response.json()) as StoryGraphResponse;
      })
      .then(setGraph)
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Unable to load story graph.",
          );
        }
      });

    return () => controller.abort();
  }, [projectId]);

  useEffect(() => {
    if (!containerRef.current || !graph) return;

    const cy = cytoscape({
      container: containerRef.current,
      boxSelectionEnabled: false,
      autounselectify: true,
      elements: [...graph.nodes, ...graph.edges],
      style: [
        {
          selector: "node",
          style: {
            "background-color": "#4f46e5",
            label: "data(label)",
            color: "#f8fafc",
            "font-size": "10px",
            "text-valign": "bottom",
            "text-margin-y": 4,
            width: 30,
            height: 30,
          },
        },
        {
          selector: 'node[type="character"]',
          style: { "background-color": "#6366f1" },
        },
        {
          selector: 'node[type="location"]',
          style: { "background-color": "#0ea5e9" },
        },
        {
          selector: 'node[type="artifact"]',
          style: { "background-color": "#f59e0b" },
        },
        {
          selector: "edge",
          style: {
            width: 2,
            "line-color": "#334155",
            "target-arrow-color": "#334155",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            label: "data(relationship)",
            "font-size": "8px",
            color: "#94a3b8",
            "text-rotation": "autorotate",
          },
        },
      ],
    });
    // Keep layout synchronous so a React cleanup cannot destroy the core
    // while Cytoscape's animation frame is still calling into it.
    const layout = cy.layout({ name: "cose", padding: 30, animate: false });
    layout.run();
    cy.on("tap", "node", (event) => {
      const nodeId = String(event.target.id());
      if (!nodeId.startsWith("scene:")) return;
      const sceneNumber = Number(nodeId.slice("scene:".length));
      if (Number.isInteger(sceneNumber)) onSelectSceneRef.current(sceneNumber);
    });

    return () => {
      layout.stop();
      cy.stop();
      cy.destroy();
    };
  }, [graph]);

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 rounded-lg overflow-hidden border border-slate-800">
      <div className="p-3 bg-slate-900 border-b border-slate-800 text-xs font-semibold text-slate-300 flex justify-between items-center">
        <span>Story Graph</span>
        <span className="text-[10px] text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
          {graph ? `${graph.source} · ${graph.status}` : "Connecting"}
        </span>
      </div>
      {error ? (
        <div className="flex-1 min-h-[350px] p-6 text-xs text-rose-200 bg-rose-950/20">
          {error}
        </div>
      ) : !graph ? (
        <div className="flex-1 min-h-[350px] p-6 text-xs text-slate-500">
          Loading story graph…
        </div>
      ) : (
        <div ref={containerRef} className="flex-1 w-full min-h-[350px]" />
      )}
    </div>
  );
}
