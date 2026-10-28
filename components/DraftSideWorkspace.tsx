"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import TiptapEditor, { type EditorTypographySettings } from "@/components/TiptapEditor";

export interface DraftDocument {
  document_id: string;
  session_id: string;
  label: string;
  kind: "source" | "draft" | string;
  content_html: string;
  source_scene_numbers: number[];
  version: number;
  created_at: string;
  updated_at: string;
}

export interface DraftSession {
  session_id: string;
  title: string;
  chapter_number?: number | null;
  source_scene_numbers: number[];
  mode: "tethered" | "piece_together";
  tether_enabled: boolean;
  base_document_id: string | null;
  status: "active" | "archived" | string;
  archived_at?: string | null;
  archive_reason?: string | null;
  created_at: string;
  updated_at: string;
  documents: DraftDocument[];
}

export interface DraftSessionSummary {
  session_id: string;
  title: string;
  chapter_number?: number | null;
  source_scene_numbers: number[];
  mode: "tethered" | "piece_together";
  tether_enabled: boolean;
  base_document_id: string | null;
  status: "active" | "archived" | string;
  archived_at?: string | null;
  archive_reason?: string | null;
  created_at: string;
  updated_at: string;
}

interface DraftSideWorkspaceProps {
  apiBase: string;
  projectId: string;
  session: DraftSession;
  onClose: () => void;
  onDeleted: (sessionId: string) => void;
  onResolved: (action: "promote" | "keep_canon") => Promise<void>;
  editorSettings?: EditorTypographySettings;
  onEditorSettingsChange?: (settings: EditorTypographySettings) => void;
}

function paragraphAt(html: string, index: number): string | null {
  if (typeof window === "undefined") return null;
  const wrapper = window.document.createElement("div");
  wrapper.innerHTML = html || "<p></p>";
  return wrapper.querySelectorAll("p")[index]?.outerHTML ?? null;
}

function replaceParagraphAt(html: string, index: number, replacement: string): string {
  if (typeof window === "undefined") return html;
  const wrapper = window.document.createElement("div");
  wrapper.innerHTML = html || "<p></p>";
  let paragraphs = Array.from(wrapper.querySelectorAll("p"));
  while (paragraphs.length <= index) {
    const empty = window.document.createElement("p");
    wrapper.appendChild(empty);
    paragraphs = Array.from(wrapper.querySelectorAll("p"));
  }
  paragraphs[index].outerHTML = replacement;
  return wrapper.innerHTML || "<p></p>";
}

function removeParagraphAt(html: string, index: number): string {
  if (typeof window === "undefined") return html;
  const wrapper = window.document.createElement("div");
  wrapper.innerHTML = html || "<p></p>";
  const paragraph = wrapper.querySelectorAll("p")[index];
  paragraph?.remove();
  return wrapper.innerHTML || "<p></p>";
}

function paragraphCount(html: string): number {
  if (typeof window === "undefined") return 0;
  const wrapper = window.document.createElement("div");
  wrapper.innerHTML = html || "<p></p>";
  return wrapper.querySelectorAll("p").length;
}

export default function DraftSideWorkspace({
  apiBase,
  projectId,
  session,
  onClose,
  onDeleted,
  onResolved,
  editorSettings,
  onEditorSettingsChange,
}: DraftSideWorkspaceProps) {
  const sourceDocument = useMemo(
    () => session.documents.find((document) => document.kind === "source") ?? session.documents[0],
    [session.documents],
  );
  const workingDocument = useMemo(
    () => session.documents.find((document) => document.kind === "draft") ?? session.documents[1],
    [session.documents],
  );
  const [sourceHtml, setSourceHtml] = useState(sourceDocument?.content_html ?? "<p></p>");
  const [workingHtml, setWorkingHtml] = useState(workingDocument?.content_html ?? "<p></p>");
  const [tetherEnabled, setTetherEnabled] = useState(session.tether_enabled);
  const [mode, setMode] = useState<"tethered" | "piece_together">(session.mode);
  const [baseDocumentId, setBaseDocumentId] = useState(
    session.base_document_id ?? sourceDocument?.document_id ?? "",
  );
  const [activeParagraph, setActiveParagraph] = useState<number | null>(0);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [resolving, setResolving] = useState<"promote" | "keep_canon" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saveTimers = useRef<Record<string, number>>({});

  useEffect(() => {
    const timers = saveTimers.current;
    return () => {
      Object.values(timers).forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const persistDocument = (documentId: string, contentHtml: string) => {
    const existingTimer = saveTimers.current[documentId];
    if (existingTimer) window.clearTimeout(existingTimer);
    setSaveState("saving");
    saveTimers.current[documentId] = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `${apiBase}/api/projects/${encodeURIComponent(projectId)}/draft-sessions/${encodeURIComponent(session.session_id)}/documents/${encodeURIComponent(documentId)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content_html: contentHtml }),
          },
        );
        if (!response.ok) throw new Error(`Draft save failed (${response.status}).`);
        setSaveState("saved");
        setError(null);
      } catch (saveError) {
        setSaveState("error");
        setError(saveError instanceof Error ? saveError.message : "Draft save failed.");
      }
    }, 650);
  };

  const updateSessionOptions = async (next: {
    mode?: "tethered" | "piece_together";
    tether_enabled?: boolean;
    base_document_id?: string;
  }) => {
    try {
      const response = await fetch(
        `${apiBase}/api/projects/${encodeURIComponent(projectId)}/draft-sessions/${encodeURIComponent(session.session_id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        },
      );
      if (!response.ok) throw new Error(`Draft session update failed (${response.status}).`);
      setError(null);
    } catch (sessionError) {
      setError(sessionError instanceof Error ? sessionError.message : "Draft session update failed.");
    }
  };

  const updateDocumentContent = (documentId: string, content: string) => {
    if (documentId === sourceDocument?.document_id) setSourceHtml(content);
    if (documentId === workingDocument?.document_id) setWorkingHtml(content);
    persistDocument(documentId, content);
  };

  const deleteDraft = async () => {
    if (!window.confirm(`Delete this draft side for ${session.title}? This only removes the project-local draft.`)) return;
    try {
      Object.values(saveTimers.current).forEach((timer) => window.clearTimeout(timer));
      const response = await fetch(
        `${apiBase}/api/projects/${encodeURIComponent(projectId)}/draft-sessions/${encodeURIComponent(session.session_id)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error(`Draft deletion failed (${response.status}).`);
      onDeleted(session.session_id);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Draft deletion failed.");
    }
  };

  const resolveDraft = async (action: "promote" | "keep_canon") => {
    const message = action === "promote"
      ? "Make the working draft canonical for this scene and archive the other active drafts?"
      : "Keep the manuscript canonical and archive this working draft?";
    if (!window.confirm(message)) return;
    setResolving(action);
    try {
      const response = await fetch(
        `${apiBase}/api/projects/${encodeURIComponent(projectId)}/draft-sessions/${encodeURIComponent(session.session_id)}/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      const detail = await response.json().catch(() => null);
      if (!response.ok) throw new Error(detail?.detail ?? `Draft resolution failed (${response.status}).`);
      await onResolved(action);
    } catch (resolveError) {
      setResolving(null);
      setError(resolveError instanceof Error ? resolveError.message : "Draft resolution failed.");
    }
  };

  const currentBaseHtml = baseDocumentId === sourceDocument?.document_id ? sourceHtml : workingHtml;
  const currentOtherHtml = baseDocumentId === sourceDocument?.document_id ? workingHtml : sourceHtml;
  const otherLabel = baseDocumentId === sourceDocument?.document_id ? "Working draft" : "Original chapter";
  const legacyChapterSession = session.source_scene_numbers.length > 1;

  const transplantParagraph = (removeFromOther: boolean) => {
    if (activeParagraph === null) {
      setError("Place the cursor in a paragraph first.");
      return;
    }
    const sourceBlock = paragraphAt(currentOtherHtml, activeParagraph);
    if (!sourceBlock) {
      setError(`The ${otherLabel.toLowerCase()} has no paragraph ${activeParagraph + 1} yet.`);
      return;
    }
    const nextBaseHtml = replaceParagraphAt(currentBaseHtml, activeParagraph, sourceBlock);
    updateDocumentContent(baseDocumentId, nextBaseHtml);

    if (removeFromOther) {
      updateDocumentContent(
        baseDocumentId === sourceDocument?.document_id
          ? workingDocument?.document_id ?? ""
          : sourceDocument?.document_id ?? "",
        removeParagraphAt(currentOtherHtml, activeParagraph),
      );
    }
    setError(null);
  };

  if (!sourceDocument || !workingDocument) {
    return <div className="rounded border border-rose-800/50 bg-rose-950/20 p-4 text-sm text-rose-200">Draft session is missing one of its documents.</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-indigo-800/50 bg-slate-950">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/80 px-3 py-2 font-sans text-xs">
        <div>
          <div className="font-semibold text-slate-200">Draft Side · {session.title}</div>
          <div className="mt-0.5 text-[10px] text-slate-500">
            {legacyChapterSession ? "Legacy chapter snapshot · preserved from the previous scope" : `Scene ${session.source_scene_numbers[0] ?? "—"} · separate project draft`}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              const next = !tetherEnabled;
              setTetherEnabled(next);
              void updateSessionOptions({ tether_enabled: next });
            }}
            className={`rounded border px-2 py-1 text-[10px] transition ${tetherEnabled ? "border-emerald-700 bg-emerald-950/50 text-emerald-200" : "border-slate-700 bg-slate-900 text-slate-400"}`}
          >
            Tethering {tetherEnabled ? "On" : "Off"}
          </button>
          <button
            type="button"
            onClick={() => {
              const next = mode === "piece_together" ? "tethered" : "piece_together";
              setMode(next);
              void updateSessionOptions({ mode: next });
            }}
            className={`rounded border px-2 py-1 text-[10px] transition ${mode === "piece_together" ? "border-amber-700 bg-amber-950/50 text-amber-200" : "border-slate-700 bg-slate-900 text-slate-400"}`}
          >
            {mode === "piece_together" ? "Piece-together mode" : "Enter piece-together"}
          </button>
          <span className={`px-1 text-[10px] ${saveState === "error" ? "text-rose-300" : saveState === "saving" ? "text-amber-300" : "text-emerald-400"}`}>
            {saveState === "saving" ? "Saving draft…" : saveState === "error" ? "Draft save error" : "Draft saved"}
          </span>
          <button type="button" disabled={resolving !== null || saveState === "saving"} onClick={() => void resolveDraft("promote")} className="rounded border border-emerald-700/70 bg-emerald-950/40 px-2 py-1 text-[10px] text-emerald-200 hover:bg-emerald-900/50 disabled:opacity-50">
            {resolving === "promote" ? "Making canon…" : "Make draft canon"}
          </button>
          <button type="button" disabled={resolving !== null || saveState === "saving"} onClick={() => void resolveDraft("keep_canon")} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-800 disabled:opacity-50">
            {resolving === "keep_canon" ? "Archiving…" : "Keep canon / Archive draft"}
          </button>
          <button type="button" onClick={() => void deleteDraft()} className="rounded border border-rose-800/70 bg-rose-950/30 px-2 py-1 text-[10px] text-rose-200 hover:bg-rose-900/50">Abort / Delete</button>
          <button type="button" onClick={onClose} className="rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-800">Close</button>
        </div>
      </div>

      {mode === "piece_together" && (
        <div className="flex flex-wrap items-center gap-2 border-b border-amber-900/40 bg-amber-950/20 px-3 py-2 text-[11px] text-amber-100">
          <span className="font-semibold">Base draft:</span>
          <button
            type="button"
            onClick={() => {
              setBaseDocumentId(sourceDocument.document_id);
              void updateSessionOptions({ base_document_id: sourceDocument.document_id });
            }}
            className={`rounded border px-2 py-1 ${baseDocumentId === sourceDocument.document_id ? "border-amber-500 bg-amber-900/50" : "border-amber-900/60 bg-slate-900/40"}`}
          >Original chapter</button>
          <button
            type="button"
            onClick={() => {
              setBaseDocumentId(workingDocument.document_id);
              void updateSessionOptions({ base_document_id: workingDocument.document_id });
            }}
            className={`rounded border px-2 py-1 ${baseDocumentId === workingDocument.document_id ? "border-amber-500 bg-amber-900/50" : "border-amber-900/60 bg-slate-900/40"}`}
          >Working draft</button>
          <span className="ml-1 text-amber-200/70">Cursor paragraph: {activeParagraph === null ? "—" : activeParagraph + 1}</span>
          <button type="button" onClick={() => transplantParagraph(false)} className="rounded border border-emerald-700/70 bg-emerald-950/40 px-2 py-1 text-emerald-200 hover:bg-emerald-900/50">Copy other paragraph into base</button>
          <button type="button" onClick={() => transplantParagraph(true)} className="rounded border border-rose-700/70 bg-rose-950/40 px-2 py-1 text-rose-200 hover:bg-rose-900/50">Move other paragraph into base</button>
        </div>
      )}

      {tetherEnabled && (
        <div className="border-b border-indigo-900/40 bg-indigo-950/20 px-3 py-1.5 text-[10px] text-indigo-200">
          Paragraph tether active · each editor tracks the corresponding prose paragraph; the draft may expand or contract independently.
        </div>
      )}

      {legacyChapterSession && (
        <div className="border-b border-amber-900/50 bg-amber-950/25 px-3 py-1.5 text-[10px] text-amber-200">
          This session was created before Draft Side became scene-scoped. It is preserved intact; new Draft Side sessions opened from a scene contain only that scene.
        </div>
      )}

      {error && <div className="border-b border-rose-900/50 bg-rose-950/30 px-3 py-1.5 text-[10px] text-rose-200">{error}</div>}

      <div className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-slate-800 overflow-y-auto xl:grid-cols-2 xl:divide-x xl:divide-y-0">
        <div className="min-w-0 px-5 py-4">
          <div className="mb-2 flex items-center justify-between font-sans">
            <div className="text-xs font-semibold text-slate-300">Original chapter · source copy</div>
            <div className="text-[10px] text-slate-500">{paragraphCount(sourceHtml)} paragraphs</div>
          </div>
          <TiptapEditor
            initialContent={sourceHtml}
            editorSettings={editorSettings}
            onEditorSettingsChange={onEditorSettingsChange}
            onUpdate={(content) => updateDocumentContent(sourceDocument.document_id, content)}
            onParagraphChange={(index) => {
              if (tetherEnabled) setActiveParagraph(index);
            }}
            highlightParagraphIndex={tetherEnabled ? activeParagraph : null}
          />
        </div>
        <div className="min-w-0 px-5 py-4">
          <div className="mb-2 flex items-center justify-between font-sans">
            <div className="text-xs font-semibold text-indigo-300">Working draft · non-canonical</div>
            <div className="text-[10px] text-slate-500">{paragraphCount(workingHtml)} paragraphs</div>
          </div>
          <TiptapEditor
            initialContent={workingHtml}
            editorSettings={editorSettings}
            onEditorSettingsChange={onEditorSettingsChange}
            onUpdate={(content) => updateDocumentContent(workingDocument.document_id, content)}
            onParagraphChange={(index) => {
              if (tetherEnabled) setActiveParagraph(index);
            }}
            highlightParagraphIndex={tetherEnabled ? activeParagraph : null}
          />
        </div>
      </div>
    </div>
  );
}
