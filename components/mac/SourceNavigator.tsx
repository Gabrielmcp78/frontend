"use client";

import React, { useMemo, useState } from "react";

export interface SceneItem {
  scene_number: number;
  title: string;
  chapter_number?: number | null;
  chapter_title?: string | null;
  scene_number_in_chapter?: number | null;
  part_number?: number | null;
  part_title?: string | null;
  source_path?: string | null;
  content_html?: string;
  word_count?: number;
  is_scratch?: boolean;
}

interface SourceNavigatorProps {
  scenes: SceneItem[];
  activeSceneNumber: number | null;
  onSelectScene: (sceneNumber: number) => void;
  onAddScene?: () => void;
  onAddChapter?: () => void;
  isOpen: boolean;
}

export const SourceNavigator: React.FC<SourceNavigatorProps> = ({
  scenes,
  activeSceneNumber,
  onSelectScene,
  onAddScene,
  onAddChapter,
  isOpen,
}) => {
  const [filterQuery, setFilterQuery] = useState("");
  const [collapsedChapters, setCollapsedChapters] = useState<Record<string, boolean>>({});

  const toggleChapter = (key: string) => {
    setCollapsedChapters((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Filter scenes
  const filteredScenes = useMemo(() => {
    if (!filterQuery.trim()) return scenes;
    const query = filterQuery.toLowerCase();
    return scenes.filter(
      (s) =>
        s.title.toLowerCase().includes(query) ||
        (s.chapter_title && s.chapter_title.toLowerCase().includes(query)) ||
        (s.source_path && s.source_path.toLowerCase().includes(query)) ||
        `scene ${s.scene_number}`.includes(query) ||
        `${s.chapter_number}.${s.scene_number_in_chapter}`.includes(query)
    );
  }, [scenes, filterQuery]);

  // Group by Part -> Chapter
  const groupedStructure = useMemo(() => {
    const partsMap = new Map<string, { partTitle: string; chaptersMap: Map<string, { chapterTitle: string; chapterNum: number | null; scenes: SceneItem[] }> }>();

    for (const scene of filteredScenes) {
      const partKey = scene.part_title ? `Part: ${scene.part_title}` : "Default Part";
      const partTitle = scene.part_title || "";

      if (!partsMap.has(partKey)) {
        partsMap.set(partKey, { partTitle, chaptersMap: new Map() });
      }

      const chapterNum = scene.chapter_number ?? null;
      const chapterKey = chapterNum !== null ? `ch_${chapterNum}` : `ch_title_${scene.chapter_title || "untitled"}`;
      const chapterTitle = scene.chapter_title
        ? (chapterNum !== null ? `Chapter ${chapterNum}: ${scene.chapter_title}` : scene.chapter_title)
        : (chapterNum !== null ? `Chapter ${chapterNum}` : "Unassigned Scenes");

      const part = partsMap.get(partKey)!;
      if (!part.chaptersMap.has(chapterKey)) {
        part.chaptersMap.set(chapterKey, { chapterTitle, chapterNum, scenes: [] });
      }

      part.chaptersMap.get(chapterKey)!.scenes.push(scene);
    }

    return Array.from(partsMap.entries()).map(([partKey, partData]) => ({
      partKey,
      partTitle: partData.partTitle,
      chapters: Array.from(partData.chaptersMap.entries()).map(([chapterKey, chapterData]) => ({
        chapterKey,
        chapterTitle: chapterData.chapterTitle,
        chapterNum: chapterData.chapterNum,
        scenes: chapterData.scenes.sort((a, b) => {
          const aCoord = a.scene_number_in_chapter ?? a.scene_number;
          const bCoord = b.scene_number_in_chapter ?? b.scene_number;
          return aCoord - bCoord;
        }),
      })),
    }));
  }, [filteredScenes]);

  if (!isOpen) return null;

  return (
    <aside className="w-68 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex flex-col h-full shrink-0 select-none">
      {/* Top Search & Actions */}
      <div className="p-2.5 border-b border-zinc-200 dark:border-zinc-800 flex flex-col gap-2">
        <div className="relative">
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Filter manuscript…"
            className="w-full text-xs pl-7 pr-2 py-1 rounded-md bg-zinc-200/50 dark:bg-zinc-800/50 border border-zinc-300 dark:border-zinc-700 outline-none focus:ring-1 focus:ring-indigo-500 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400"
          />
          <svg
            className="w-3.5 h-3.5 absolute left-2 top-2 text-zinc-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <div className="flex items-center justify-between text-[11px] text-zinc-500 font-medium px-1">
          <span>{scenes.length} Scenes</span>
          <div className="flex items-center gap-2">
            {onAddChapter && (
              <button
                type="button"
                onClick={onAddChapter}
                className="hover:text-indigo-600 dark:hover:text-indigo-400"
                title="Add Chapter"
              >
                + Chapter
              </button>
            )}
            {onAddScene && (
              <button
                type="button"
                onClick={onAddScene}
                className="hover:text-indigo-600 dark:hover:text-indigo-400"
                title="Add Scene"
              >
                + Scene
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Hierarchical Tree List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {groupedStructure.map(({ partKey, partTitle, chapters }) => (
          <div key={partKey} className="space-y-1">
            {partTitle && (
              <button
                type="button"
                onClick={() => {
                  const firstScene = chapters[0]?.scenes[0];
                  if (firstScene) {
                    onSelectScene(firstScene.scene_number);
                  }
                }}
                className="w-full text-left px-2 py-1 text-[11px] font-serif font-bold uppercase tracking-wider text-[#8b3a2b] dark:text-[#e07564] hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 rounded flex items-center justify-between group transition-colors"
                title={`View ${partTitle} Cover`}
              >
                <span>{partTitle}</span>
                <span className="text-[9px] text-zinc-400 opacity-0 group-hover:opacity-100 uppercase tracking-widest font-sans font-normal">
                  Cover ↗
                </span>
              </button>
            )}

            {chapters.map(({ chapterKey, chapterTitle, chapterNum, scenes: chScenes }) => {
              const isCollapsed = collapsedChapters[chapterKey] ?? false;
              return (
                <div key={chapterKey} className="space-y-0.5">
                  {/* Chapter Header */}
                  <button
                    type="button"
                    onClick={() => toggleChapter(chapterKey)}
                    className="w-full flex items-center justify-between px-2 py-1 rounded text-left text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <svg
                        className={`w-3 h-3 transition-transform text-zinc-400 ${isCollapsed ? "" : "rotate-90"}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <span className="truncate">{chapterTitle}</span>
                    </div>
                    <span className="text-[10px] text-zinc-400 font-normal">
                      {chScenes.length}
                    </span>
                  </button>

                  {/* Scenes in Chapter */}
                  {!isCollapsed && (
                    <div className="pl-4 space-y-0.5">
                      {chScenes.map((scene) => {
                        const isActive = scene.scene_number === activeSceneNumber;
                        const coordinate =
                          chapterNum !== null && scene.scene_number_in_chapter !== null && scene.scene_number_in_chapter !== undefined
                            ? `${chapterNum}.${scene.scene_number_in_chapter}`
                            : `${scene.scene_number}`;

                        return (
                          <button
                            key={scene.scene_number}
                            type="button"
                            onClick={() => onSelectScene(scene.scene_number)}
                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-left text-xs transition-colors ${
                              isActive
                                ? "bg-indigo-600 text-white font-medium shadow-sm"
                                : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60"
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span
                                className={`text-[10px] font-mono px-1 py-0.5 rounded ${
                                  isActive
                                    ? "bg-indigo-700 text-indigo-100"
                                    : "bg-zinc-200/60 dark:bg-zinc-800 text-zinc-500"
                                }`}
                              >
                                {coordinate}
                              </span>
                              <span className="truncate">
                                {scene.title || `Scene ${scene.scene_number}`}
                              </span>
                            </div>

                            {scene.word_count !== undefined && scene.word_count > 0 && (
                              <span
                                className={`text-[10px] shrink-0 ml-1 ${
                                  isActive ? "text-indigo-200" : "text-zinc-400"
                                }`}
                              >
                                {scene.word_count}w
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
};
