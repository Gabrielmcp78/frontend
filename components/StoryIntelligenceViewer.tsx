"use client";

import React, { useEffect, useMemo, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

interface TrackedEntity {
  id: string;
  label: string;
  type: string;
}

interface StoryScene {
  scene_number: number;
  title: string;
  chapter_number?: number | null;
  chapter_title?: string | null;
  scene_number_in_chapter?: number | null;
  word_count: number;
  pressure_score: number;
  pressure_components: {
    sentence_velocity: number;
    conflict_density: number;
    dialogue_density: number;
  };
  tracked_entities: TrackedEntity[];
}

interface StoryChapter {
  chapter_number?: number | null;
  title: string;
  scene_numbers: number[];
  scenes: StoryScene[];
  pressure_average: number;
  word_count: number;
}

interface StoryTrack {
  track_id: string;
  label: string;
  type: string;
  track_kind: "key_object" | "story_entity";
  appearances: number[];
  first_scene: number;
  last_scene: number;
  recurrence: number;
  appearance_anchors: Array<{
    scene_number: number;
    paragraph_index: number;
    quote_text: string;
  }>;
}

interface StoryIntelligenceResponse {
  project_id: string;
  source: string;
  pressure_method: string;
  scene_count: number;
  chapter_count: number;
  chapters: StoryChapter[];
  scenes: StoryScene[];
  tracks: StoryTrack[];
}

type TrackFilter = "all" | "key_object" | "character" | "location";

function shortChapterLabel(chapter: StoryChapter): string {
  if (chapter.chapter_number !== null && chapter.chapter_number !== undefined) {
    return chapter.chapter_number === 0 ? "Epigraph" : `Ch. ${chapter.chapter_number}`;
  }
  return "Material";
}

export default function StoryIntelligenceViewer({
  projectId,
  onSelectScene,
}: {
  projectId: string | null;
  onSelectScene: (sceneNumber: number, paragraphIndex?: number | null) => void;
}) {
  const [data, setData] = useState<StoryIntelligenceResponse | null>(null);
  const [selectedSceneNumber, setSelectedSceneNumber] = useState<number | null>(null);
  const [trackFilter, setTrackFilter] = useState<TrackFilter>("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    fetch(`${API_BASE}/api/projects/${projectId}/story-intelligence`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Story intelligence returned ${response.status}.`);
        return (await response.json()) as StoryIntelligenceResponse;
      })
      .then((result) => {
        setError(null);
        setData(result);
        setSelectedSceneNumber((current) => current ?? result.scenes[0]?.scene_number ?? null);
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : "Unable to load story intelligence.");
        }
      });
    return () => controller.abort();
  }, [projectId]);

  const selectedScene = data?.scenes.find((scene) => scene.scene_number === selectedSceneNumber) ?? null;
  const chartWidth = Math.max(760, (data?.scenes.length ?? 1) * 11);
  const chartHeight = 220;
  const chartPadding = { top: 22, right: 18, bottom: 28, left: 30 };
  const plotWidth = chartWidth - chartPadding.left - chartPadding.right;
  const plotHeight = chartHeight - chartPadding.top - chartPadding.bottom;
  const xFor = (index: number) =>
    chartPadding.left + (data && data.scenes.length > 1 ? (index / (data.scenes.length - 1)) * plotWidth : plotWidth / 2);
  const yFor = (score: number) => chartPadding.top + ((100 - score) / 100) * plotHeight;

  const visibleTracks = useMemo(() => {
    if (!data) return [];
    return data.tracks
      .filter((track) => {
        if (trackFilter === "all") return true;
        if (trackFilter === "key_object") return track.track_kind === "key_object";
        return track.type === trackFilter;
      })
      .slice(0, 32);
  }, [data, trackFilter]);

  if (!projectId) {
    return <div className="p-4 text-xs text-slate-500">Choose a project to build its story map.</div>;
  }
  if (error) {
    return <div className="rounded border border-rose-800/60 bg-rose-950/20 p-4 text-xs text-rose-200">{error}</div>;
  }
  if (!data) {
    return <div className="p-4 text-xs text-slate-500">Building scene intelligence…</div>;
  }

  const chartPoints = data.scenes
    .map((scene, index) => `${xFor(index)},${yFor(scene.pressure_score)}`)
    .join(" ");

  return (
    <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-950 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-slate-200">Narrative pressure map</div>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{data.pressure_method}</p>
        </div>
        <div className="flex shrink-0 gap-1 text-[10px] text-slate-400">
          <span className="rounded border border-slate-700 px-1.5 py-0.5">{data.chapter_count} chapters</span>
          <span className="rounded border border-slate-700 px-1.5 py-0.5">{data.scene_count} scenes</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-slate-800 bg-slate-900/40">
        <svg width={chartWidth} height={chartHeight} role="img" aria-label="Narrative pressure by scene">
          {[0, 25, 50, 75, 100].map((score) => (
            <g key={score}>
              <line
                x1={chartPadding.left}
                x2={chartWidth - chartPadding.right}
                y1={yFor(score)}
                y2={yFor(score)}
                stroke="#1e293b"
                strokeWidth="1"
              />
              <text x="5" y={yFor(score) + 3} fill="#64748b" fontSize="9">
                {score}
              </text>
            </g>
          ))}
          {data.chapters.map((chapter, index) => {
            const first = data.scenes.findIndex((scene) => scene.scene_number === chapter.scene_numbers[0]);
            const last = data.scenes.findIndex((scene) => scene.scene_number === chapter.scene_numbers.at(-1));
            if (first < 0 || last < 0) return null;
            const startX = xFor(first);
            const endX = xFor(last);
            return (
              <g key={`${chapter.chapter_number ?? "material"}-${chapter.title}`}>
                <rect
                  x={startX}
                  y={chartPadding.top}
                  width={Math.max(endX - startX, 7)}
                  height={plotHeight}
                  fill={index % 2 === 0 ? "#312e81" : "#0f766e"}
                  opacity="0.08"
                />
                <text x={startX + 2} y="13" fill="#94a3b8" fontSize="9">
                  {shortChapterLabel(chapter)}
                </text>
              </g>
            );
          })}
          <polyline points={chartPoints} fill="none" stroke="#818cf8" strokeWidth="2.5" />
          {data.scenes.map((scene, index) => (
            <circle
              key={scene.scene_number}
              cx={xFor(index)}
              cy={yFor(scene.pressure_score)}
              r={scene.scene_number === selectedSceneNumber ? 5 : 3}
              fill={scene.scene_number === selectedSceneNumber ? "#fbbf24" : "#a5b4fc"}
              stroke="#0f172a"
              strokeWidth="2"
              className="cursor-pointer"
              onClick={() => {
                setSelectedSceneNumber(scene.scene_number);
                onSelectScene(scene.scene_number);
              }}
            >
              <title>{`Scene ${scene.scene_number}: ${scene.title} · pressure ${scene.pressure_score}`}</title>
            </circle>
          ))}
        </svg>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1">
        {data.chapters.map((chapter) => (
          <button
            type="button"
            key={`${chapter.chapter_number ?? "material"}-${chapter.title}`}
            onClick={() => {
              const firstScene = chapter.scenes[0];
              if (!firstScene) return;
              setSelectedSceneNumber(firstScene.scene_number);
              onSelectScene(firstScene.scene_number);
            }}
            className="shrink-0 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-left text-[10px] text-slate-300 transition hover:border-indigo-500 hover:text-indigo-200"
          >
            <span className="block text-indigo-300">{shortChapterLabel(chapter)}</span>
            <span className="text-slate-500">{chapter.pressure_average} avg · {chapter.scenes.length} scenes</span>
          </button>
        ))}
      </div>

      {selectedScene && (
        <div className="rounded border border-amber-800/50 bg-amber-950/20 p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-amber-300">
                Scene {selectedScene.scene_number_in_chapter ?? selectedScene.scene_number} · {selectedScene.chapter_title ?? "Material"}
              </div>
              <div className="mt-1 text-xs font-semibold text-slate-200">{selectedScene.title}</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-semibold text-amber-300">{selectedScene.pressure_score}</div>
              <div className="text-[9px] uppercase tracking-wider text-slate-500">pressure</div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {Object.entries(selectedScene.pressure_components).map(([label, value]) => (
              <div key={label}>
                <div className="mb-1 flex justify-between text-[9px] text-slate-500">
                  <span>{label.replaceAll("_", " ")}</span><span>{value}</span>
                </div>
                <div className="h-1 rounded bg-slate-800"><div className="h-1 rounded bg-amber-400" style={{ width: `${value}%` }} /></div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {selectedScene.tracked_entities.length > 0 ? selectedScene.tracked_entities.map((entity) => (
              <button
                type="button"
                key={entity.id}
                onClick={() => {
                  setTrackFilter(entity.type === "artifact" ? "key_object" : entity.type as TrackFilter);
                  const track = data.tracks.find((candidate) => candidate.track_id === entity.id);
                  const anchor = track?.appearance_anchors.find((candidate) => candidate.scene_number === selectedScene.scene_number);
                  onSelectScene(selectedScene.scene_number, anchor?.paragraph_index ?? null);
                }}
                className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300 hover:border-indigo-500 hover:text-indigo-200"
              >
                {entity.label}
              </button>
            )) : <span className="text-[10px] text-slate-500">No indexed entities in this scene.</span>}
          </div>
        </div>
      )}

      <div className="border-t border-slate-800 pt-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-slate-200">Key objects and story tracks</div>
            <div className="text-[10px] text-slate-500">Click a cell to jump to that scene.</div>
          </div>
          <select
            aria-label="Story track filter"
            value={trackFilter}
            onChange={(event) => setTrackFilter(event.target.value as TrackFilter)}
            className="rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-300 outline-none"
          >
            <option value="all">All tracks</option>
            <option value="key_object">Key objects</option>
            <option value="character">Characters</option>
            <option value="location">Locations</option>
          </select>
        </div>
        <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
          {visibleTracks.length === 0 ? (
            <div className="py-4 text-center text-[10px] text-slate-500">No tracks match this filter.</div>
          ) : visibleTracks.map((track) => {
            const appearances = new Set(track.appearances);
            return (
              <div key={track.track_id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSceneNumber(track.first_scene);
                    const anchor = track.appearance_anchors.find((candidate) => candidate.scene_number === track.first_scene);
                    onSelectScene(track.first_scene, anchor?.paragraph_index ?? null);
                  }}
                  className="w-32 shrink-0 truncate text-left text-[10px] text-slate-300 hover:text-indigo-200"
                  title={track.label}
                >
                  <span className={track.track_kind === "key_object" ? "text-amber-300" : "text-slate-400"}>{track.label}</span>
                  <span className="ml-1 text-[9px] text-slate-600">{track.recurrence}×</span>
                </button>
                <div className="grid min-w-[760px] flex-1 gap-px" style={{ gridTemplateColumns: `repeat(${data.scenes.length}, minmax(7px, 1fr))` }}>
                  {data.scenes.map((scene) => (
                    <button
                      type="button"
                      key={`${track.track_id}-${scene.scene_number}`}
                      aria-label={`${track.label} ${appearances.has(scene.scene_number) ? "appears in" : "not in"} Scene ${scene.scene_number}`}
                      onClick={() => {
                        setSelectedSceneNumber(scene.scene_number);
                        const anchor = track.appearance_anchors.find((candidate) => candidate.scene_number === scene.scene_number);
                        onSelectScene(scene.scene_number, anchor?.paragraph_index ?? null);
                      }}
                      className={`h-2 rounded-sm ${appearances.has(scene.scene_number) ? track.track_kind === "key_object" ? "bg-amber-400" : "bg-indigo-400" : "bg-slate-800/70"}`}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="text-[9px] text-slate-600">Derived from the active project manuscript and local story graph. Entity tracks are evidence of textual appearance, not invented plot claims.</div>
    </div>
  );
}
