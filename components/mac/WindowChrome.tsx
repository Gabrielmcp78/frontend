"use client";

import React from "react";

export interface ProjectMeta {
  project_id: string;
  title: string;
  branch?: string | null;
  commit_sha?: string | null;
  working_tree_dirty?: boolean | number;
}

interface WindowChromeProps {
  projects: ProjectMeta[];
  currentProjectId: string;
  onSelectProject: (id: string) => void;
  currentProject?: ProjectMeta;
  isSaving?: boolean;
  onPullGit?: () => void;
  onDeskPush?: () => void;
  onDirectCommit?: () => void;
  canDirectCommit?: boolean;
  onExportShunn?: () => void;
  onExportMarkdown?: () => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  inspectorOpen: boolean;
  setInspectorOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  isCompiling?: boolean;
  pullingGit?: boolean;
  pushingDesk?: boolean;
  directCommitting?: boolean;
}

export const WindowChrome: React.FC<WindowChromeProps> = ({
  projects,
  currentProjectId,
  onSelectProject,
  currentProject,
  isSaving = false,
  onPullGit,
  onDeskPush,
  onDirectCommit,
  canDirectCommit = false,
  onExportShunn,
  onExportMarkdown,
  sidebarOpen,
  setSidebarOpen,
  inspectorOpen,
  setInspectorOpen,
  isCompiling = false,
  pullingGit = false,
  pushingDesk = false,
  directCommitting = false,
}) => {
  return (
    <header className="mac-window-chrome h-13 px-3 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-md select-none shrink-0 z-20">
      {/* Left: macOS Traffic Lights + Sidebar Toggle + Project Selector */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 mr-1">
          <div className="w-3 h-3 rounded-full bg-[#ff5f57] border border-[#e0443e] cursor-default" />
          <div className="w-3 h-3 rounded-full bg-[#febc2e] border border-[#d89e24] cursor-default" />
          <div className="w-3 h-3 rounded-full bg-[#28c840] border border-[#1aab29] cursor-default" />
        </div>

        <button
          type="button"
          onClick={() => setSidebarOpen((prev) => !prev)}
          className={`p-1.5 rounded-md text-xs font-medium transition-colors ${
            sidebarOpen
              ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
              : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
          }`}
          title="Toggle Source Navigator Sidebar"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8m-8 6h16" />
          </svg>
        </button>

        <div className="flex items-center gap-2">
          <select
            value={currentProjectId}
            onChange={(e) => onSelectProject(e.target.value)}
            className="text-xs font-semibold bg-transparent text-zinc-900 dark:text-zinc-100 border border-zinc-300 dark:border-zinc-700 rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {projects.map((p) => (
              <option key={p.project_id} value={p.project_id} className="bg-white dark:bg-zinc-900">
                {p.title} ({p.project_id})
              </option>
            ))}
          </select>

          {isSaving && (
            <span className="text-[11px] text-amber-500 animate-pulse font-medium">
              Saving…
            </span>
          )}
        </div>
      </div>

      {/* Center: Git Provenance & Sync Status */}
      <div className="hidden md:flex items-center gap-2 text-xs">
        {currentProject && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-200/60 dark:bg-zinc-800/60 border border-zinc-300/50 dark:border-zinc-700/50 font-mono text-[11px]">
            <span
              className={`w-2 h-2 rounded-full ${
                currentProject.working_tree_dirty
                  ? "bg-amber-400"
                  : "bg-emerald-400"
              }`}
              title={currentProject.working_tree_dirty ? "Working tree dirty" : "Working tree clean"}
            />
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">
              {currentProject.branch || "detached"}
            </span>
            {currentProject.commit_sha && (
              <span className="text-zinc-400 dark:text-zinc-500">
                @{currentProject.commit_sha.slice(0, 7)}
              </span>
            )}
          </div>
        )}

        {/* Sync Controls */}
        <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800/80 p-0.5 rounded-lg border border-zinc-200 dark:border-zinc-700">
          {onPullGit && (
            <button
              type="button"
              onClick={onPullGit}
              disabled={pullingGit}
              className="px-2 py-0.5 text-[11px] font-medium rounded hover:bg-white dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 disabled:opacity-50 transition-all flex items-center gap-1"
              title="Pull external Git commits non-destructively into Studio cache"
            >
              {pullingGit ? "Pulling…" : "Git Pull"}
            </button>
          )}

          {canDirectCommit && onDirectCommit && (
            <button
              type="button"
              onClick={onDirectCommit}
              disabled={directCommitting}
              className="px-2 py-0.5 text-[11px] font-medium rounded hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 disabled:opacity-50 transition-all flex items-center gap-1"
              title="Direct Author Commit for active scene without proposal batching"
            >
              {directCommitting ? "Committing…" : "Direct Commit"}
            </button>
          )}

          {onDeskPush && (
            <button
              type="button"
              onClick={onDeskPush}
              disabled={pushingDesk}
              className="px-2 py-0.5 text-[11px] font-medium rounded hover:bg-white dark:hover:bg-zinc-700 text-indigo-600 dark:text-indigo-400 disabled:opacity-50 transition-all"
              title="Push full saved Studio desk to linked Git worktree"
            >
              {pushingDesk ? "Pushing…" : "Desk Push"}
            </button>
          )}
        </div>
      </div>

      {/* Right: Publisher Exports & Inspector Toggle */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          {onExportShunn && (
            <button
              type="button"
              onClick={onExportShunn}
              disabled={isCompiling}
              className="text-xs px-2.5 py-1 rounded-md bg-zinc-200/80 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
              title="Export William Shunn Standard Manuscript Format PDF"
            >
              {isCompiling ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
                  <span>Compiling PDF…</span>
                </>
              ) : (
                "Shunn PDF"
              )}
            </button>
          )}

          {onExportMarkdown && (
            <button
              type="button"
              onClick={onExportMarkdown}
              className="text-xs px-2.5 py-1 rounded-md bg-zinc-200/80 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-medium transition-colors"
              title="Export complete manuscript as Markdown"
            >
              Export MD
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setInspectorOpen((prev) => !prev)}
          className={`p-1.5 rounded-md text-xs font-medium transition-colors ${
            inspectorOpen
              ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
              : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
          }`}
          title="Toggle Approval Desk / Intelligence Drawer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </header>
  );
};
