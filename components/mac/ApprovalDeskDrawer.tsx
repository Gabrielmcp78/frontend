"use client";

import React, { useState } from "react";

export type DrawerTab = "desk" | "critique" | "annotations" | "history";

interface ApprovalDeskDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab?: DrawerTab;
  onTabChange?: (tab: DrawerTab) => void;
  // Desk tab props
  pendingProposalsCount?: number;
  deskContent?: React.ReactNode;
  // Critique tab props
  critiqueContent?: React.ReactNode;
  // Annotations tab props
  annotationsCount?: number;
  annotationsContent?: React.ReactNode;
  // History tab props
  historyContent?: React.ReactNode;
}

export const ApprovalDeskDrawer: React.FC<ApprovalDeskDrawerProps> = ({
  isOpen,
  onClose,
  activeTab: controlledTab,
  onTabChange,
  pendingProposalsCount = 0,
  deskContent,
  critiqueContent,
  annotationsCount = 0,
  annotationsContent,
  historyContent,
}) => {
  const [internalTab, setInternalTab] = useState<DrawerTab>("desk");
  const currentTab = controlledTab ?? internalTab;

  const handleTabClick = (tab: DrawerTab) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalTab(tab);
    }
  };

  if (!isOpen) return null;

  return (
    <aside className="w-96 border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex flex-col h-full shrink-0 select-none">
      {/* Header & Apple Native Segmented Control */}
      <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
        <div className="mac-segmented-control flex-1 justify-between">
          <button
            type="button"
            onClick={() => handleTabClick("desk")}
            className={`mac-segmented-item flex items-center gap-1.5 ${
              currentTab === "desk" ? "active" : ""
            }`}
          >
            <span>Desk</span>
            {pendingProposalsCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] flex items-center justify-center font-bold">
                {pendingProposalsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleTabClick("critique")}
            className={`mac-segmented-item ${currentTab === "critique" ? "active" : ""}`}
          >
            Critique
          </button>

          <button
            type="button"
            onClick={() => handleTabClick("annotations")}
            className={`mac-segmented-item flex items-center gap-1.5 ${
              currentTab === "annotations" ? "active" : ""
            }`}
          >
            <span>Notes</span>
            {annotationsCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-indigo-500 text-white text-[9px] flex items-center justify-center font-bold">
                {annotationsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleTabClick("history")}
            className={`mac-segmented-item ${currentTab === "history" ? "active" : ""}`}
          >
            History
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 transition-colors"
          title="Close Drawer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tab Content Body */}
      <div className="flex-1 overflow-y-auto p-3">
        {currentTab === "desk" && (deskContent || <div className="text-xs text-zinc-400 p-4 text-center">No staged desk proposals.</div>)}
        {currentTab === "critique" && (critiqueContent || <div className="text-xs text-zinc-400 p-4 text-center">No active critique.</div>)}
        {currentTab === "annotations" && (annotationsContent || <div className="text-xs text-zinc-400 p-4 text-center">No scene notes.</div>)}
        {currentTab === "history" && (historyContent || <div className="text-xs text-zinc-400 p-4 text-center">No revision history available.</div>)}
      </div>
    </aside>
  );
};
