"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { AnnotationAnchor, EditorTypographySettings } from "@/components/TiptapEditor";
import type { DraftSession, DraftSessionSummary } from "@/components/DraftSideWorkspace";

const TiptapEditor = dynamic(() => import("@/components/TiptapEditor"), {
  ssr: false,
});
const StoryGraphViewer = dynamic(
  () => import("@/components/StoryGraphViewer"),
  { ssr: false },
);
const StoryIntelligenceViewer = dynamic(
  () => import("@/components/StoryIntelligenceViewer"),
  { ssr: false },
);
const InterrogationRoom = dynamic(
  () => import("@/components/InterrogationRoom"),
  { ssr: false },
);
const DraftSideWorkspace = dynamic(
  () => import("@/components/DraftSideWorkspace"),
  { ssr: false },
);
import { WindowChrome } from "@/components/mac/WindowChrome";
import { LiveTypesetPreview } from "@/components/mac/LiveTypesetPreview";
import { DEFAULT_LAYOUT_TUNING } from "@/components/mac/LiveTypesetPreview";
import type { LayoutTuningParams, PreviewScope } from "@/components/mac/LiveTypesetPreview";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

interface TelemetryData {
  session_id: string;
  net_word_change: number;
  words_added: number;
  words_deleted: number;
  active_plot_tags: string[];
  graph_status: string;
  semantic_summary: string;
  last_updated?: string | null;
}

interface PersonaProfile {
  persona_id: string;
  name: string;
  category: "beta_reader" | "literary_agent" | "prestige_editor" | "craft_agent" | "author_profile" | "author_agent" | "specialist" | string;
  role: string;
  title_or_archetype: string;
  organization_or_imprint: string;
  taste_summary: string;
  focus: string;
  green_flags: string[];
  red_flags: string[];
  source_file?: string;
  source_sha256?: string;
}

interface PersonaPanel {
  panel_id: string;
  name: string;
  description: string;
  persona_ids: string[];
  source_file?: string;
}

interface FormatProfile {
  id: string;
  label: string;
  target: string;
  description: string;
}

type CompilerOutputFormat = "pdf" | "markdown" | "docx";

interface EvaluationResult {
  evaluation_id?: string;
  project_id?: string;
  scene_number?: number;
  focus_scope?: EvaluationScope;
  focus_chapter_number?: number | null;
  focus_instruction?: string;
  focus_text?: string;
  focus_text_supplied?: boolean;
  created_at?: string;
  persona_id: string;
  persona_name: string;
  persona_role?: string;
  title_or_archetype?: string;
  executive_reaction: string;
  verdict: string;
  provider?: string;
  model?: string;
  independent?: boolean;
  staged_diff_proposals?: Array<Record<string, unknown>>;
  margin_annotations?: Array<{
    exact_quote_anchor: string;
    comment_body: string;
    severity: string;
  }>;
}

interface AnalysisConversationMessage {
  message_id?: number;
  role: "user" | "model";
  content: string;
  context_label?: string | null;
}

interface AnalysisConversationPayload {
  conversation_id: string;
  agent_id?: string;
  channel?: "roleplay" | "analysis";
  created_at?: string;
  updated_at?: string;
  messages: AnalysisConversationMessage[];
}

interface ConversationSummary {
  conversation_id: string;
  agent_id: string;
  channel: "roleplay" | "analysis";
  created_at: string;
  updated_at: string;
  last_message_at?: string | null;
  last_context_label?: string | null;
  last_scene_number?: number | null;
  message_count: number;
}

type EvaluationScope = "scene" | "chapter" | "selection";
type ScenePassType = "mechanical" | "slop_tell_habit";

interface SceneData {
  scene_number: number;
  title: string;
  chapter_number?: number | null;
  chapter_title?: string | null;
  scene_number_in_chapter?: number | null;
  part_number?: number | null;
  part_title?: string | null;
  source_path?: string | null;
  content_html: string;
  content_json?: Record<string, unknown> | null;
  version: number;
  word_count: number;
  updated_at: string;
}

interface SceneMetadataDraft {
  title: string;
  chapter_number: string;
  chapter_title: string;
  scene_number_in_chapter: string;
  part_number: string;
  part_title: string;
}

function cleanChapterTitle(title: string | null | undefined, chapterNumber?: number | null) {
  const raw = (title ?? "").trim();
  const withoutAct = raw.replace(/^act[-_ ]?\d+\s*\/\s*/i, "");
  const withoutNumber = withoutAct
    .replace(/^(?:chapter|ch)\s*\d+\s*[:|—-]\s*/i, "")
    .replace(/^\d+\s*[|—:-]\s*/, "");
  if (withoutNumber.trim()) return withoutNumber.trim();
  return chapterNumber ? `Chapter ${chapterNumber}` : "Unstructured material";
}

function partLabel(scene: SceneData) {
  return scene.part_title?.trim() || (scene.part_number ? `Part ${scene.part_number}` : "Unassigned");
}

function sceneTitleLabel(scene: SceneData) {
  const title = (scene.title ?? "").trim();
  return /^scene\s+[\dIVXLC]+$/i.test(title) ? "" : title;
}

function editorSceneTitle(content: string): string | null {
  if (typeof window === "undefined") return null;
  const parsed = new DOMParser().parseFromString(content, "text/html");
  const block = parsed.querySelector('[data-semantic-style="scene-title"]');
  return block ? (block.textContent ?? "").replace(/\s+/g, " ").trim() : null;
}

function chapterLabel(scene: SceneData) {
  if (scene.chapter_number === 0) return "Epigraph";
  return scene.chapter_number == null
    ? cleanChapterTitle(scene.chapter_title)
    : `Chapter ${scene.chapter_number} · ${cleanChapterTitle(scene.chapter_title, scene.chapter_number)}`;
}

interface SceneRevision {
  revision_id: number;
  scene_number: number;
  version: number;
  content_html: string;
  content_text: string;
  summary: string;
  source: "seed" | "editor" | "governance" | string;
  created_at: string;
  before_text?: string;
  after_text?: string;
  is_initial?: boolean;
  changed_lines?: string[];
  word_delta?: { added: number; deleted: number };
}

interface GovernanceProposal {
  proposal_id: string;
  batch_id?: string | null;
  scene_number: number;
  proposed_by_name: string;
  change_type: string;
  original_verbatim_text: string;
  proposed_replacement_text: string;
  editorial_rationale: string;
  source_branch?: string | null;
  source_commit_sha?: string | null;
  source_scene_version?: number | null;
  status: "staged" | "accepted" | "rejected";
  validation?: {
    errors: string[];
    warnings: string[];
    writeback?: { available: boolean; path?: string; reason?: string };
    source_path?: string | null;
    mechanical_review?: {
      provider?: string | null;
      model?: string | null;
      issues?: Array<{ kind?: string; description?: string }>;
      changed?: boolean;
      applied_correction?: boolean;
      note?: string;
    };
  } | null;
}

interface ProposalDraft {
  original_verbatim_text: string;
  proposed_replacement_text: string;
  editorial_rationale: string;
  change_type: string;
}

interface ReviewErrorDetail {
  code?: string;
  message?: string;
  studio_only_available?: boolean;
  dirty_source_available?: boolean;
  conflicts?: { message?: string }[];
  validation?: { errors?: string[]; warnings?: string[] };
}

interface PendingCommitBatch {
  batch_id: string;
  branch?: string | null;
  status: string;
  created_at?: string;
  proposal_count: number;
  files: string[];
  commit_error?: { message?: string } | null;
}

interface ManualChangesResponse {
  status: string;
  candidate_count?: number;
  available_count?: number;
  blocked_count?: number;
  studio_only_count?: number;
  candidates?: Array<{ scene_number: number; safety_errors?: string[]; source_mode?: string }>;
  blocked?: Array<{ scene_number: number; source_path?: string; kind?: string; reason?: string }>;
  proposals?: GovernanceProposal[];
  skipped?: Array<{ scene_number: number; source_path?: string; operation?: string; errors?: string[] }>;
}

type WorkspaceTab = "personas" | "governance" | "orchestrator" | "graph" | "chat" | "notes";

interface Annotation {
  annotation_id: string;
  scene_number: number;
  paragraph_id: string;
  quote_text: string;
  body: string;
  category: string;
  status: "open" | "resolved";
  anchor_present: boolean;
  created_at: string;
  updated_at: string;
  ai_advice?: {
    question: string;
    response: string;
    suggestions: string[];
    persona_id: string;
    generated_at: string;
    model?: string;
    provider?: string;
  } | null;
}

interface RepositoryFilePayload {
  path: string;
  text: string;
}

interface ProjectSummary {
  project_id: string;
  title: string;
  author?: string | null;
  source_root?: string | null;
  source_subpath?: string | null;
  branch?: string | null;
  commit_sha?: string | null;
  source_digest?: string | null;
  working_tree_dirty?: boolean;
}

const DEFAULT_EDITOR_SETTINGS: EditorTypographySettings = {
  font_family: "literary-serif",
  font_size: 18,
  line_height: 1.7,
  paragraph_spacing: "comfortable",
  style_overrides: {},
};

interface SourceWorktreeFile {
  path: string;
  status_code: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  label: string;
}

interface SourceWorktreeStatus {
  source_root: string;
  source_subpath?: string | null;
  branch?: string | null;
  commit_sha?: string | null;
  working_tree_dirty: boolean;
  files: SourceWorktreeFile[];
  counts: { total: number; staged: number; unstaged: number; untracked: number };
  checked_at?: string;
}

interface SourceFileDiff {
  path: string;
  label: string;
  status_code: string;
  diff: string;
  truncated?: boolean;
}

interface SourceRepairFile {
  path: string;
  bytes: number;
  sha256: string;
  scene_count: number;
  scene_numbers: number[];
  chapter_number?: number | null;
  chapter_title?: string | null;
}

interface SourceRepairDocument {
  path: string;
  sha256: string;
  frontmatter: string;
  content_html: string;
}

interface IntakeAudit {
  audit_id?: string;
  source_label?: string;
  created_at?: string;
  status: "complete" | "deterministic_only" | "ai_unavailable" | "ai_unstructured" | "none" | string;
  structural_audit?: {
    scene_count: number;
    chapter_count: number;
    paragraph_count: number;
    issues: Array<{
      kind: string;
      severity: string;
      scene_number?: number;
      chapter_number?: number;
      evidence: string;
      recommendation: string;
    }>;
    graph: { node_count: number; edge_count: number };
  };
  corrections?: Array<{
    kind?: string;
    severity?: string;
    scene_number?: number;
    evidence?: string;
    recommendation?: string;
  }>;
  story_bible?: {
    characters?: Array<{ name?: string; role?: string; evidence_scene_numbers?: number[] }>;
    plot_threads?: Array<{ name?: string; description?: string; evidence_scene_numbers?: number[] }>;
    subplots?: Array<{ name?: string; description?: string; evidence_scene_numbers?: number[] }>;
    key_objects?: Array<{ name?: string; function?: string; evidence_scene_numbers?: number[] }>;
  };
  questions?: string[];
  ai?: { provider?: string | null; model?: string | null; error?: string };
}

type ContextOption =
  | "plot"
  | "science"
  | "character"
  | "subtext"
  | "causality"
  | "documentation";

interface ContextPackage {
  title: string;
  selected_chapters: number[];
  included: string[];
  manifest: {
    branch?: string | null;
    commit_sha?: string | null;
    source_digest?: string | null;
    working_tree_dirty?: boolean;
  };
  package_sha256: string;
  git_links: Array<{ label: string; url: string }>;
  markdown: string;
  paste_prompt: string;
}

const CONTEXT_OPTIONS: Array<{ value: ContextOption; label: string; description: string }> = [
  { value: "plot", label: "Plot pressure", description: "Pressure scores, tracked entities, and chapter movement." },
  { value: "science", label: "Science / research", description: "Matching research and worldbuilding Markdown." },
  { value: "character", label: "Characters", description: "Character/entity graph evidence and cast documents." },
  { value: "subtext", label: "Subtext / notes", description: "Saved notes and anchored author annotations." },
  { value: "causality", label: "Causality", description: "Scene adjacency and extracted relationship evidence." },
  { value: "documentation", label: "Documentation / Git", description: "Project provenance, source files, and stable Git links." },
];

export default function LiteraryStudioWorkspace() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("personas");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [selectedSceneNumber, setSelectedSceneNumber] = useState(1);
  const [scenes, setScenes] = useState<SceneData[]>([]);
  const [sceneContent, setSceneContent] = useState("");
  const [sceneDocumentJson, setSceneDocumentJson] = useState<Record<string, unknown> | null>(null);
  const [metadataEditorOpen, setMetadataEditorOpen] = useState(false);
  const [metadataDraft, setMetadataDraft] = useState<SceneMetadataDraft | null>(null);
  const [metadataSaving, setMetadataSaving] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [editorSettings, setEditorSettings] = useState<EditorTypographySettings>(DEFAULT_EDITOR_SETTINGS);
  const [editorSettingsProjectId, setEditorSettingsProjectId] = useState<string | null>(null);
  const [layoutTuning, setLayoutTuning] = useState<LayoutTuningParams>(DEFAULT_LAYOUT_TUNING);
  const [previewScope, setPreviewScope] = useState<PreviewScope>("chapter");
  const previewDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const triggerDebouncedPreviewRef = useRef<(scope?: PreviewScope, delayMs?: number) => void>(() => {});
  const [mapFocusParagraphIndex, setMapFocusParagraphIndex] = useState<number | null>(null);
  const [mapFocusRequestId, setMapFocusRequestId] = useState(0);
  const [draftSession, setDraftSession] = useState<DraftSession | null>(null);
  const [draftSessions, setDraftSessions] = useState<DraftSessionSummary[]>([]);
  const [draftSessionBusy, setDraftSessionBusy] = useState(false);
  const [draftSessionError, setDraftSessionError] = useState<string | null>(null);
  const [sceneLoaded, setSceneLoaded] = useState(false);
  const [sceneDirty, setSceneDirty] = useState(false);
  const [editorViewMode, setEditorViewMode] = useState<"editor" | "split" | "preview">("split");
  const [saveState, setSaveState] = useState<"loading" | "saved" | "saving" | "error">("loading");
  const [backendStatus, setBackendStatus] = useState<"checking" | "connected" | "offline">("checking");
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [evaluationResult, setEvaluationResult] =
    useState<EvaluationResult | null>(null);
  const [evaluationArchive, setEvaluationArchive] = useState<EvaluationResult[]>([]);
  const [evaluationDocument, setEvaluationDocument] = useState<EvaluationResult | null>(null);
  const [loadingEval, setLoadingEval] = useState(false);
  const [evaluatingPersonaId, setEvaluatingPersonaId] = useState<string | null>(null);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [evaluationScope, setEvaluationScope] = useState<EvaluationScope>("scene");
  const [evaluationFocus, setEvaluationFocus] = useState("");
  const [selectedPassage, setSelectedPassage] = useState<AnnotationAnchor | null>(null);
  const [personaRoster, setPersonaRoster] = useState<PersonaProfile[]>([]);
  const [personaPanels, setPersonaPanels] = useState<PersonaPanel[]>([]);
  const [selectedPersonaPanelId, setSelectedPersonaPanelId] = useState("editorial_workshop");
  const [personaCategoryFilter, setPersonaCategoryFilter] = useState("all");
  const [personaResults, setPersonaResults] = useState<Record<string, EvaluationResult>>({});
  const [panelRunning, setPanelRunning] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [analysisConversationPersonaId, setAnalysisConversationPersonaId] = useState<string | null>(null);
  const [analysisConversationMessages, setAnalysisConversationMessages] = useState<AnalysisConversationMessage[]>([]);
  const [analysisConversationInput, setAnalysisConversationInput] = useState("");
  const [analysisConversationLoading, setAnalysisConversationLoading] = useState(false);
  const [analysisConversationSending, setAnalysisConversationSending] = useState(false);
  const [analysisConversationError, setAnalysisConversationError] = useState<string | null>(null);
  const [analysisConversationArchive, setAnalysisConversationArchive] = useState<ConversationSummary[]>([]);
  const [analysisConversationDocumentOpen, setAnalysisConversationDocumentOpen] = useState(false);
  const [proposals, setProposals] = useState<GovernanceProposal[]>([]);
  const [manualSyncBusy, setManualSyncBusy] = useState(false);
  const [deskPushBusy, setDeskPushBusy] = useState(false);
  const [gitPullBusy, setGitPullBusy] = useState(false);
  const [directCommitBusy, setDirectCommitBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [manualChangeCount, setManualChangeCount] = useState(0);
  const [manualChangeSummary, setManualChangeSummary] = useState<ManualChangesResponse | null>(null);
  const [governanceError, setGovernanceError] = useState<string | null>(null);
  const [governanceNotice, setGovernanceNotice] = useState<string | null>(null);
  const [scenePassBusy, setScenePassBusy] = useState<ScenePassType | null>(null);
  const [writebackBlocked, setWritebackBlocked] = useState<Record<string, string>>({});
  const [sourceStatus, setSourceStatus] = useState<SourceWorktreeStatus | null>(null);
  const [sourceStatusProjectId, setSourceStatusProjectId] = useState<string | null>(null);
  const [sourceStatusOpen, setSourceStatusOpen] = useState(false);
  const [sourceStatusLoading, setSourceStatusLoading] = useState(false);
  const [sourceStatusError, setSourceStatusError] = useState<string | null>(null);
  const [sourceDiff, setSourceDiff] = useState<SourceFileDiff | null>(null);
  const [sourceDiffLoading, setSourceDiffLoading] = useState(false);
  const [sourceRepairOpen, setSourceRepairOpen] = useState(false);
  const [sourceRepairFiles, setSourceRepairFiles] = useState<SourceRepairFile[]>([]);
  const [sourceRepairPath, setSourceRepairPath] = useState<string | null>(null);
  const [sourceRepairDocument, setSourceRepairDocument] = useState<SourceRepairDocument | null>(null);
  const [sourceRepairContent, setSourceRepairContent] = useState("");
  const [sourceRepairLoading, setSourceRepairLoading] = useState(false);
  const [sourceRepairBusy, setSourceRepairBusy] = useState(false);
  const [sourceRepairError, setSourceRepairError] = useState<string | null>(null);
  const [sourceRepairNotice, setSourceRepairNotice] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [editingProposalId, setEditingProposalId] = useState<string | null>(null);
  const [proposalDrafts, setProposalDrafts] = useState<Record<string, ProposalDraft>>({});
  const [pendingCommitBatches, setPendingCommitBatches] = useState<PendingCommitBatch[]>([]);
  const [failedCommitBatches, setFailedCommitBatches] = useState<PendingCommitBatch[]>([]);
  const [reconcilingBatchId, setReconcilingBatchId] = useState<string | null>(null);
  const [commitPromptOpen, setCommitPromptOpen] = useState(false);
  const [commitPromptReason, setCommitPromptReason] = useState<"leave" | "reminder">("leave");
  const [commitPromptTarget, setCommitPromptTarget] = useState<WorkspaceTab | null>(null);
  const [commitBusy, setCommitBusy] = useState(false);
  const commitReminderTimer = useRef<number | null>(null);
  const sceneTitleSyncTimer = useRef<number | null>(null);
  const sceneTitleBlockPresent = useRef<boolean | null>(null);
  const [sceneReloadKey, setSceneReloadKey] = useState(0);
  const [isCompiling, setIsCompiling] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isAirDropping, setIsAirDropping] = useState(false);
  const [formatProfiles, setFormatProfiles] = useState<FormatProfile[]>([]);
  const [formatProfileId, setFormatProfileId] = useState("manuscript_submission");
  const [compilerOutputFormat, setCompilerOutputFormat] = useState<CompilerOutputFormat>("pdf");
  const [compilerScopeMode, setCompilerScopeMode] = useState<"all" | "custom">("all");
  const [selectedExportParts, setSelectedExportParts] = useState<number[]>([]);
  const [selectedExportChapters, setSelectedExportChapters] = useState<number[]>([]);
  const [selectedExportScenes, setSelectedExportScenes] = useState<number[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [compilerError, setCompilerError] = useState<string | null>(null);
  const [compilerNotice, setCompilerNotice] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<SceneRevision[]>([]);
  const [selectedRevision, setSelectedRevision] = useState<SceneRevision | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const [contextChapterStart, setContextChapterStart] = useState("1");
  const [contextChapterEnd, setContextChapterEnd] = useState("1");
  const [contextIncludes, setContextIncludes] = useState<ContextOption[]>(
    CONTEXT_OPTIONS.map((option) => option.value),
  );
  const [contextGenerating, setContextGenerating] = useState(false);
  const [contextGoogleExporting, setContextGoogleExporting] = useState(false);
  const [contextPackage, setContextPackage] = useState<ContextPackage | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [contextCopied, setContextCopied] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importTitle, setImportTitle] = useState("Imported material");
  const [importText, setImportText] = useState("");
  const [importSplitMode, setImportSplitMode] = useState<"single" | "headings">("single");
  const [repositoryFiles, setRepositoryFiles] = useState<RepositoryFilePayload[]>([]);
  const [sourceRoot, setSourceRoot] = useState("");
  const [sourceSubpath, setSourceSubpath] = useState("");
  const [snapshotting, setSnapshotting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [intakeAnalyzing, setIntakeAnalyzing] = useState(false);
  const [intakeAnalysis, setIntakeAnalysis] = useState<string | null>(null);
  const [intakeAudit, setIntakeAudit] = useState<IntakeAudit | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [annotationDraft, setAnnotationDraft] = useState<
    (AnnotationAnchor & { body: string; category: string }) | null
  >(null);
  const [annotationLoading, setAnnotationLoading] = useState(false);
  const [annotationSaving, setAnnotationSaving] = useState(false);
  const [annotationError, setAnnotationError] = useState<string | null>(null);
  const [annotationAdviceQuestion, setAnnotationAdviceQuestion] = useState<Record<string, string>>({});
  const [annotationAdviceLoading, setAnnotationAdviceLoading] = useState<string | null>(null);

  // New blank page / scratch modal state
  const [newPageOpen, setNewPageOpen] = useState(false);
  const [newPageTitle, setNewPageTitle] = useState("");
  const [newPageType, setNewPageType] = useState<"scratch" | "chapter">("scratch");
  const [newPageChapterMode, setNewPageChapterMode] = useState<"existing" | "new">("existing");
  const [newPageChapterNumber, setNewPageChapterNumber] = useState<string>("");
  const [newPageChapterTitle, setNewPageChapterTitle] = useState("");
  const [newPageSourcePath, setNewPageSourcePath] = useState("");
  const [newPageBusy, setNewPageBusy] = useState(false);
  const [newPageError, setNewPageError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeProjectId) return;
    let cancelled = false;
    fetch(`${API_BASE}/api/projects/${activeProjectId}/draft-sessions`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Draft session service returned ${response.status}.`);
        return (await response.json()) as DraftSessionSummary[];
      })
      .then((sessions) => {
        if (!cancelled) setDraftSessions(sessions);
      })
      .catch((error) => {
        if (!cancelled) setDraftSessionError(error instanceof Error ? error.message : "Unable to load draft sessions.");
      });
    return () => {
      cancelled = true;
    };
  }, [activeProjectId]);

  const selectedScene = scenes.find(
    (scene) => scene.scene_number === selectedSceneNumber,
  );
  const selectedSceneLabel = selectedScene
    ? [
        partLabel(selectedScene),
        chapterLabel(selectedScene) === partLabel(selectedScene) ? "" : chapterLabel(selectedScene),
        selectedScene.scene_number_in_chapter == null
          ? sceneTitleLabel(selectedScene) || "Scene"
          : `${selectedScene.chapter_number != null ? `${selectedScene.chapter_number}.${selectedScene.scene_number_in_chapter}` : `Scene ${selectedScene.scene_number_in_chapter}`}${sceneTitleLabel(selectedScene) ? ` · ${sceneTitleLabel(selectedScene)}` : ""}`,
      ].filter(Boolean).join(" · ")
    : scenes.length === 0
      ? "No manuscript loaded"
      : "Loading manuscript…";

  const liveScenesForPreview = useMemo(() => {
    return scenes.map((s) => {
      if (s.scene_number === selectedSceneNumber) {
        return { ...s, content_html: sceneContent };
      }
      return s;
    });
  }, [scenes, selectedSceneNumber, sceneContent]);

  const liveSelectedSceneForPreview = useMemo(() => {
    if (!selectedScene) return null;
    return { ...selectedScene, content_html: sceneContent };
  }, [selectedScene, sceneContent]);

  const partGroups = Array.from(
    scenes.reduce((parts, scene) => {
      const isScratch = scene.chapter_title?.toLowerCase().includes("scratch") || scene.chapter_number == null;
      const partKey = isScratch
        ? "scratch"
        : scene.part_number == null
          ? "unassigned"
          : `part-${scene.part_number}`;
      const part = parts.get(partKey) ?? {
        key: partKey,
        title: isScratch ? "Scratch & Drafts" : partLabel(scene),
        part_number: scene.part_number ?? null,
        chapters: new Map<string, { key: string; chapter_number: number | null; title: string; scenes: SceneData[] }>(),
      };
      const chapterKey = isScratch
        ? "scratch"
        : `${scene.chapter_number ?? "unassigned"}:${scene.chapter_title ?? "Unstructured material"}`;
      const chapter = part.chapters.get(chapterKey) ?? {
        key: chapterKey,
        chapter_number: scene.chapter_number ?? null,
        title: scene.chapter_number === 0 ? "Epigraph" : cleanChapterTitle(scene.chapter_title, scene.chapter_number),
        scenes: [],
      };
      chapter.scenes.push(scene);
      part.chapters.set(chapterKey, chapter);
      parts.set(partKey, part);
      return parts;
    }, new Map<string, { key: string; title: string; part_number: number | null; chapters: Map<string, { key: string; chapter_number: number | null; title: string; scenes: SceneData[] }> }>()).values(),
  ).map((part) => ({ ...part, chapters: Array.from(part.chapters.values()) }));
  const compilerPartGroups = partGroups.filter((part) => part.key !== "scratch");
  const selectedPersonaPanel = personaPanels.find(
    (panel) => panel.panel_id === selectedPersonaPanelId,
  );
  const visiblePersonas = personaRoster.filter(
    (persona) => personaCategoryFilter === "all" || persona.category === personaCategoryFilter,
  );

  const sceneLabelForNumber = (sceneNumber: number | undefined) => {
    const scene = scenes.find((candidate) => candidate.scene_number === sceneNumber);
    if (!scene) return sceneNumber ? `Scene ${sceneNumber}` : "Unknown manuscript scope";
    return [
      partLabel(scene),
      chapterLabel(scene) === partLabel(scene) ? "" : chapterLabel(scene),
      `Scene ${scene.scene_number_in_chapter ?? scene.scene_number}${sceneTitleLabel(scene) ? ` · ${sceneTitleLabel(scene)}` : ""}`,
    ].join(" · ");
  };

  const personaNameForId = (personaId: string) =>
    personaRoster.find((persona) => persona.persona_id === personaId)?.name ?? personaId;

  const formatArchiveDate = (value?: string | null) =>
    value ? new Date(value).toLocaleString() : "Date unavailable";

  const loadEvaluationArchive = useCallback(async () => {
    if (!activeProjectId) return;
    try {
      const res = await fetch(`${API_BASE}/api/projects/${activeProjectId}/personas/evaluations`);
      if (!res.ok) throw new Error(`Evaluation archive service returned ${res.status}.`);
      const data = (await res.json()) as { evaluations?: EvaluationResult[] };
      setEvaluationArchive(data.evaluations ?? []);
    } catch (err) {
      console.error("Failed to fetch evaluation archive:", err);
    }
  }, [activeProjectId]);

  const loadAnalysisConversation = async (personaId: string) => {
    if (!activeProjectId) return;
    setAnalysisConversationPersonaId(personaId);
    setAnalysisConversationLoading(true);
    setAnalysisConversationError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/projects/${activeProjectId}/agent-conversations/analysis/${encodeURIComponent(personaId)}`,
      );
      if (!res.ok) throw new Error(`Analysis conversation service returned ${res.status}.`);
      const data = (await res.json()) as AnalysisConversationPayload;
      setAnalysisConversationMessages(data.messages ?? []);
      setAnalysisConversationDocumentOpen(true);
    } catch (err) {
      console.error("Failed to load analysis conversation:", err);
      setAnalysisConversationError(err instanceof Error ? err.message : "Unable to load analysis conversation.");
      setAnalysisConversationMessages([]);
    } finally {
      setAnalysisConversationLoading(false);
    }
  };

  const loadAnalysisConversationArchive = useCallback(async () => {
    if (!activeProjectId) return;
    try {
      const res = await fetch(`${API_BASE}/api/projects/${activeProjectId}/agent-conversations/analysis`);
      if (!res.ok) throw new Error(`Analysis archive service returned ${res.status}.`);
      const data = (await res.json()) as { conversations?: ConversationSummary[] };
      setAnalysisConversationArchive(data.conversations ?? []);
    } catch (err) {
      console.error("Failed to fetch analysis conversation archive:", err);
    }
  }, [activeProjectId]);

  const sendAnalysisConversationMessage = async () => {
    const personaId = analysisConversationPersonaId;
    const userMessage = analysisConversationInput.trim();
    if (!activeProjectId || !personaId || !selectedScene || !userMessage || analysisConversationSending) return;
    const nextMessages = [
      ...analysisConversationMessages,
      { role: "user" as const, content: userMessage },
    ];
    setAnalysisConversationMessages(nextMessages);
    setAnalysisConversationInput("");
    setAnalysisConversationSending(true);
    setAnalysisConversationError(null);
    try {
      const res = await fetch(`${API_BASE}/api/projects/${activeProjectId}/interrogation/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona_id: personaId,
          scene_number: selectedSceneNumber,
          conversation_channel: "analysis",
          conversation_history: analysisConversationMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          user_message: userMessage,
          current_screen_text: sceneContent,
          target_scope: "screen",
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail ?? `Analysis conversation returned ${res.status}.`);
      setAnalysisConversationMessages((current) => [
        ...current,
        {
          role: "model",
          content: data.response_message ?? "…",
          context_label: data.context?.context_label ?? "Context: current editor screen",
        },
      ]);
      await loadAnalysisConversationArchive();
    } catch (err) {
      console.error("Analysis conversation failed:", err);
      setAnalysisConversationError(err instanceof Error ? err.message : "Analysis conversation failed.");
    } finally {
      setAnalysisConversationSending(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/compiler/profiles`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Formatter service returned ${res.status}.`);
        return (await res.json()) as FormatProfile[];
      })
      .then((data) => {
        if (cancelled) return;
        setFormatProfiles(data);
        setFormatProfileId((current) =>
          data.length > 0 && !data.some((profile) => profile.id === current) ? data[0].id : current,
        );
      })
      .catch((err: unknown) => {
        if (!cancelled) console.error("Failed to load formatter profiles:", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/projects`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Project service returned ${res.status}.`);
        return (await res.json()) as ProjectSummary[];
      })
      .then((data) => {
        if (cancelled) return;
        setProjects(data);
        setActiveProjectId((current) =>
          current && data.some((project) => project.project_id === current) ? current : null,
        );
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setProjectError(err instanceof Error ? err.message : "Unable to load projects.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeProjectId) return;
    let cancelled = false;
    fetch(`${API_BASE}/api/projects/${activeProjectId}/personas/catalog`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Persona service returned ${res.status}.`);
        return (await res.json()) as {
          personas: PersonaProfile[];
          panels: PersonaPanel[];
        };
      })
      .then((data) => {
        if (cancelled) return;
        setPersonaRoster(data.personas);
        setPersonaPanels(data.panels);
        if (data.panels.length > 0) {
          setSelectedPersonaPanelId((current) =>
            data.panels.some((panel) => panel.panel_id === current)
              ? current
              : data.panels[0].panel_id,
          );
        }
        setPersonaResults({});
        setEvaluationArchive([]);
        setAnalysisConversationArchive([]);
        setPanelError(null);
      })
      .catch((err: unknown) => {
        console.error("Failed to fetch persona roster:", err);
        if (!cancelled) {
          setPanelError(err instanceof Error ? err.message : "Unable to load persona roster.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeProjectId]);

  useEffect(() => {
    if (!activeProjectId) return;
    let cancelled = false;
    const evaluationRequest = fetch(`${API_BASE}/api/projects/${activeProjectId}/personas/evaluations`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Evaluation archive service returned ${res.status}.`);
        return (await res.json()) as { evaluations?: EvaluationResult[] };
      })
      .then((data) => {
        if (!cancelled) setEvaluationArchive(data.evaluations ?? []);
      })
      .catch((err) => console.error("Failed to fetch evaluation archive:", err));
    const conversationRequest = fetch(`${API_BASE}/api/projects/${activeProjectId}/agent-conversations/analysis`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Analysis archive service returned ${res.status}.`);
        return (await res.json()) as { conversations?: ConversationSummary[] };
      })
      .then((data) => {
        if (!cancelled) setAnalysisConversationArchive(data.conversations ?? []);
      })
      .catch((err) => console.error("Failed to fetch analysis conversation archive:", err));
    void Promise.all([evaluationRequest, conversationRequest]);
    return () => {
      cancelled = true;
    };
  }, [activeProjectId]);

  useEffect(() => {
    if (!activeProjectId) return;
    let cancelled = false;
    fetch(`${API_BASE}/api/projects/${activeProjectId}/intake/audit/latest`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Intake audit service returned ${res.status}.`);
        return (await res.json()) as IntakeAudit;
      })
      .then((audit) => {
        if (!cancelled) setIntakeAudit(audit.status === "none" ? null : audit);
      })
      .catch((err: unknown) => {
        console.error("Failed to fetch intake audit:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [activeProjectId]);

  const refreshScenes = useCallback(async (selectSceneNumber?: number) => {
    if (!activeProjectId) return [];
    try {
      const res = await fetch(`${API_BASE}/api/projects/${activeProjectId}/scenes`);
      if (!res.ok) throw new Error(`Scene service returned ${res.status}.`);
      const data = (await res.json()) as SceneData[];
      setBackendStatus("connected");
      setScenes(data);
      if (selectSceneNumber !== undefined) {
        setSelectedSceneNumber(selectSceneNumber);
      } else if (data.length > 0 && (selectedSceneNumber === undefined || !data.some((s) => s.scene_number === selectedSceneNumber))) {
        setSelectedSceneNumber(data[0].scene_number);
      }
      return data;
    } catch (err) {
      console.error("Failed to fetch scenes:", err);
      setBackendStatus("offline");
      setSaveState("error");
      return [];
    }
  }, [activeProjectId, selectedSceneNumber]);

  useEffect(() => {
    if (!activeProjectId) return;
    // This refresh synchronizes the editor's selected scene with the backend
    // project after an explicit project switch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshScenes();
  }, [activeProjectId, refreshScenes]);

  useEffect(() => {
    if (!activeProjectId) {
      return;
    }
    let cancelled = false;
    fetch(`${API_BASE}/api/projects/${activeProjectId}/editor-settings`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Editor settings service returned ${res.status}.`);
        return (await res.json()) as EditorTypographySettings & { layout_tuning?: Partial<LayoutTuningParams> };
      })
      .then((settings) => {
        if (cancelled) return;
        setEditorSettings({ ...DEFAULT_EDITOR_SETTINGS, ...settings });
        setLayoutTuning({ ...DEFAULT_LAYOUT_TUNING, ...(settings.layout_tuning ?? {}) });
        setEditorSettingsProjectId(activeProjectId);
      })
      .catch((err) => {
        console.error("Failed to load project editor settings:", err);
        if (!cancelled) setEditorSettingsProjectId(activeProjectId);
      });
    return () => {
      cancelled = true;
    };
  }, [activeProjectId]);

  const handleEditorSettingsChange = useCallback((settings: EditorTypographySettings) => {
    setEditorSettings(settings);
    if (!activeProjectId || editorSettingsProjectId !== activeProjectId) return;
    void fetch(`${API_BASE}/api/projects/${activeProjectId}/editor-settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...settings, layout_tuning: layoutTuning }),
    }).catch((err) => console.error("Failed to persist project editor settings:", err));
  }, [activeProjectId, editorSettingsProjectId, layoutTuning]);

  const handleLayoutTuningChange = useCallback((tuning: LayoutTuningParams) => {
    setLayoutTuning(tuning);
    if (activeProjectId && editorSettingsProjectId === activeProjectId) {
      void fetch(`${API_BASE}/api/projects/${activeProjectId}/editor-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editorSettings, layout_tuning: tuning }),
      }).catch((err) => console.error("Failed to persist layout tuning:", err));
    }
    triggerDebouncedPreviewRef.current?.(previewScope, 600);
  }, [activeProjectId, editorSettings, editorSettingsProjectId, previewScope]);

  useEffect(() => {
    if (!activeProjectId || !selectedScene) return;
    let cancelled = false;
    fetch(
      `${API_BASE}/api/projects/${activeProjectId}/scenes/${selectedSceneNumber}/annotations`,
    )
      .then(async (res) => {
        if (!res.ok) throw new Error(`Annotation service returned ${res.status}.`);
        return (await res.json()) as Annotation[];
      })
      .then((data) => {
        if (!cancelled) {
          setAnnotations(data);
          setAnnotationError(null);
        }
      })
      .catch((err: unknown) => {
        console.error("Failed to fetch annotations:", err);
        if (!cancelled) {
          setAnnotationError(
            err instanceof Error ? err.message : "Unable to load notes.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setAnnotationLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeProjectId, selectedScene, selectedSceneNumber]);

  useEffect(() => {
    if (!activeProjectId || scenes.length === 0) return;
    let cancelled = false;
    const loadScene = async () => {
      setSceneLoaded(false);
      setSaveState("loading");
      try {
        const res = await fetch(`${API_BASE}/api/projects/${activeProjectId}/scenes/${selectedSceneNumber}`);
        if (!res.ok) throw new Error(`Scene service returned ${res.status}.`);
        const data = (await res.json()) as SceneData;
        if (!cancelled) {
          setSceneContent(data.content_html);
          setSceneDocumentJson((data as SceneData & { content_json?: Record<string, unknown> | null }).content_json ?? null);
          setSceneDirty(false);
          setSceneLoaded(true);
          setSaveState("saved");
        }
      } catch (err) {
        console.error("Failed to fetch scene:", err);
        if (!cancelled) setSaveState("error");
      }
    };
    void loadScene();
    return () => {
      cancelled = true;
    };
  }, [activeProjectId, scenes.length, selectedSceneNumber, sceneReloadKey]);

  useEffect(() => {
    if (!sceneLoaded || mapFocusParagraphIndex === null) return;
    const paragraphIndex = mapFocusParagraphIndex;
    let observer: MutationObserver | null = null;
    const applyHighlight = (shouldScroll = false) => {
      const editor = document.querySelector(".literary-editor");
      const paragraphs = editor?.querySelectorAll("p") ?? [];
      paragraphs.forEach((paragraph, index) => {
        paragraph.classList.toggle("tether-paragraph-active", index === paragraphIndex);
      });
      const target = paragraphs[paragraphIndex] as HTMLElement | undefined;
      if (shouldScroll) target?.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    const timer = window.setTimeout(() => {
      applyHighlight(true);
      const editor = document.querySelector(".literary-editor");
      if (editor) {
        observer = new MutationObserver(() => applyHighlight(false));
        observer.observe(editor, { childList: true, subtree: true });
      }
    }, 80);
    return () => {
      window.clearTimeout(timer);
      observer?.disconnect();
    };
  }, [mapFocusParagraphIndex, mapFocusRequestId, sceneLoaded]);

  useEffect(() => {
    if (!activeProjectId) return;
    let cancelled = false;
    const loadTelemetry = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/projects/${activeProjectId}/telemetry/latest`);
        if (!res.ok) throw new Error(`Telemetry service returned ${res.status}.`);
        const data = (await res.json()) as TelemetryData;
        if (!cancelled) setTelemetry(data);
      } catch (err) {
        console.error("Failed to fetch telemetry:", err);
      }
    };
    void loadTelemetry();
    const interval = window.setInterval(loadTelemetry, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeProjectId]);

  const loadGovernanceProposals = useCallback(async () => {
    if (!activeProjectId) return;
    const res = await fetch(`${API_BASE}/api/projects/${activeProjectId}/governance/proposals`);
    if (!res.ok) throw new Error(`Governance service returned ${res.status}.`);
    const data = (await res.json()) as GovernanceProposal[];
    setProposals(data);
  }, [activeProjectId]);

  const loadPendingCommitBatches = useCallback(async () => {
    if (!activeProjectId) {
      return [];
    }
    const res = await fetch(`${API_BASE}/api/projects/${activeProjectId}/governance/commit-pending`);
    if (!res.ok) throw new Error(`Governance commit service returned ${res.status}.`);
    return (await res.json()) as PendingCommitBatch[];
  }, [activeProjectId]);

  const loadFailedCommitBatches = useCallback(async () => {
    if (!activeProjectId) {
      return [];
    }
    const res = await fetch(`${API_BASE}/api/projects/${activeProjectId}/governance/commit-failed`);
    if (!res.ok) throw new Error(`Governance failure service returned ${res.status}.`);
    return (await res.json()) as PendingCommitBatch[];
  }, [activeProjectId]);

  const loadSourceStatus = useCallback(async (open = false) => {
    if (!activeProjectId) return;
    setSourceStatusLoading(true);
    setSourceStatusError(null);
    try {
      const res = await fetch(`${API_BASE}/api/projects/${activeProjectId}/source-provenance/status`);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.detail ?? `Source status service returned ${res.status}.`);
      const status = body as SourceWorktreeStatus;
      setSourceStatus(status);
      setSourceStatusProjectId(activeProjectId);
      setProjects((current) => current.map((project) =>
        project.project_id === activeProjectId
          ? { ...project, branch: status.branch, commit_sha: status.commit_sha, working_tree_dirty: status.working_tree_dirty }
          : project,
      ));
      if (open) setSourceStatusOpen(true);
    } catch (err) {
      console.error("Failed to fetch source worktree status:", err);
      setSourceStatusProjectId(activeProjectId);
      setSourceStatus(null);
      setSourceStatusError(err instanceof Error ? err.message : "Unable to load source worktree status.");
      if (open) setSourceStatusOpen(true);
    } finally {
      setSourceStatusLoading(false);
    }
  }, [activeProjectId]);

  useEffect(() => {
    if (!activeProjectId) return;
    // Refresh the manuscript checkout status on every project selection. The
    // editor must never rely on the intake-time Git snapshot or another repo's
    // dirty state for its write/commit guard.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSourceStatus(false);
  }, [activeProjectId, loadSourceStatus]);

  const reconcileFailedCommit = useCallback(async (batchId: string) => {
    if (!activeProjectId || reconcilingBatchId) return;
    setReconcilingBatchId(batchId);
    setGovernanceError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/projects/${activeProjectId}/governance/commit-failed/${batchId}/reconcile`,
        { method: "POST" },
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.detail?.message ?? body?.detail ?? `Reconciliation returned ${res.status}.`);
      }
      setFailedCommitBatches(await loadFailedCommitBatches());
      setPendingCommitBatches(await loadPendingCommitBatches());
      await loadSourceStatus();
      setGovernanceNotice("The historical failure was reconciled against the clean source commit. No manuscript text was changed.");
    } catch (err) {
      console.error("Failed to reconcile historical commit failure:", err);
      setGovernanceError(err instanceof Error ? err.message : "Unable to reconcile the historical commit failure.");
    } finally {
      setReconcilingBatchId(null);
    }
  }, [
    activeProjectId,
    loadFailedCommitBatches,
    loadPendingCommitBatches,
    loadSourceStatus,
    reconcilingBatchId,
  ]);

  const viewSourceFile = async (file: SourceWorktreeFile) => {
    if (!activeProjectId || sourceDiffLoading) return;
    setSourceDiffLoading(true);
    setSourceStatusError(null);
    try {
      const res = await fetch(`${API_BASE}/api/projects/${activeProjectId}/source-provenance/diff?path=${encodeURIComponent(file.path)}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.detail ?? `Source diff service returned ${res.status}.`);
      setSourceDiff(body as SourceFileDiff);
    } catch (err) {
      console.error("Failed to fetch source file diff:", err);
      setSourceStatusError(err instanceof Error ? err.message : "Unable to load source file diff.");
    } finally {
      setSourceDiffLoading(false);
    }
  };

  const openSourceFileInIde = async (file: SourceWorktreeFile) => {
    if (!activeProjectId) return;
    try {
      const res = await fetch(`${API_BASE}/api/projects/${activeProjectId}/source-provenance/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: file.path }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.detail ?? `IDE open service returned ${res.status}.`);
    } catch (err) {
      console.error("Failed to open source file in IDE:", err);
      setSourceStatusError(err instanceof Error ? err.message : "Unable to open source file in the IDE.");
    }
  };

  const copySourceFilePath = async (file: SourceWorktreeFile) => {
    if (!sourceStatus) return;
    try {
      await navigator.clipboard.writeText(`${sourceStatus.source_root}/${file.path}`);
    } catch (err) {
      console.error("Unable to copy source path:", err);
      setSourceStatusError("Clipboard access was unavailable; the path is shown in the panel.");
    }
  };

  const loadSourceRepairDocument = async (path: string) => {
    if (!activeProjectId) return;
    setSourceRepairLoading(true);
    setSourceRepairError(null);
    setSourceRepairNotice(null);
    try {
      const res = await fetch(`${API_BASE}/api/projects/${activeProjectId}/source-repair/file?path=${encodeURIComponent(path)}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.detail?.message ?? body?.detail ?? `Source repair file returned ${res.status}.`);
      const document = body as SourceRepairDocument;
      setSourceRepairPath(document.path);
      setSourceRepairDocument(document);
      setSourceRepairContent(document.content_html);
    } catch (err) {
      console.error("Failed to load source repair file:", err);
      setSourceRepairError(err instanceof Error ? err.message : "Unable to load source repair file.");
    } finally {
      setSourceRepairLoading(false);
    }
  };

  const openSourceRepair = async () => {
    if (!activeProjectId || sourceRepairLoading) return;
    setSourceRepairOpen(true);
    setSourceRepairError(null);
    setSourceRepairNotice(null);
    try {
      const res = await fetch(`${API_BASE}/api/projects/${activeProjectId}/source-repair/files`);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.detail ?? `Source repair service returned ${res.status}.`);
      const files = (body?.files ?? []) as SourceRepairFile[];
      setSourceRepairFiles(files);
      const selectedSourcePath = selectedScene?.source_path ?? "";
      const projectPrefix = `${activeProjectId}/`;
      const selectedPath = selectedSourcePath.startsWith(projectPrefix)
        ? selectedSourcePath.slice(projectPrefix.length)
        : selectedSourcePath;
      const preferred = files.find((file) => file.path === selectedPath)
        ?? files.find((file) => selectedScene?.source_path?.endsWith(file.path))
        ?? files[0];
      if (preferred) await loadSourceRepairDocument(preferred.path);
      else setSourceRepairError("No Markdown files are available in the linked manuscript scope.");
    } catch (err) {
      console.error("Failed to open source repair:", err);
      setSourceRepairError(err instanceof Error ? err.message : "Unable to open source repair.");
    }
  };

  const recompileSourceRepair = async () => {
    if (!activeProjectId || !sourceRepairDocument || !sourceRepairPath || sourceRepairBusy) return;
    if (!window.confirm(`Recompile only ${sourceRepairPath} and rebuild its scene/index relationships? This writes the file to the current linked worktree but does not commit it.`)) return;
    setSourceRepairBusy(true);
    setSourceRepairError(null);
    setSourceRepairNotice(null);
    try {
      const res = await fetch(`${API_BASE}/api/projects/${activeProjectId}/source-repair/recompile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: sourceRepairPath,
          expected_sha256: sourceRepairDocument.sha256,
          content_html: sourceRepairContent,
          frontmatter: sourceRepairDocument.frontmatter,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.detail?.message ?? body?.detail ?? `Source repair recompile returned ${res.status}.`);
      const result = body as { scenes?: SceneData[]; removed_scene_numbers?: number[]; project?: ProjectSummary };
      if (result.project) {
        setProjects((current) => current.map((project) => project.project_id === result.project?.project_id ? result.project : project));
      }
      const refreshed = await refreshScenes(result.scenes?.[0]?.scene_number);
      if (refreshed[0]) setSceneContent(refreshed[0].content_html);
      setSourceRepairDocument(null);
      setSourceRepairPath(null);
      setSourceRepairContent("");
      setSourceRepairNotice(
        `Recompiled ${sourceRepairPath}. ${result.scenes?.length ?? 0} scene${result.scenes?.length === 1 ? "" : "s"} indexed${result.removed_scene_numbers?.length ? `; removed ${result.removed_scene_numbers.length} obsolete scene record${result.removed_scene_numbers.length === 1 ? "" : "s"}` : ""}. The worktree is ready for review and commit.`,
      );
    } catch (err) {
      console.error("Source repair recompile failed:", err);
      setSourceRepairError(err instanceof Error ? err.message : "Unable to recompile source file.");
    } finally {
      setSourceRepairBusy(false);
    }
  };

  const refreshManualChangeAvailability = useCallback(async () => {
    if (!activeProjectId) {
      setManualChangeCount(0);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/projects/${activeProjectId}/manual-changes`);
      if (!res.ok) throw new Error(`Manual-change service returned ${res.status}.`);
      const body = (await res.json()) as ManualChangesResponse;
      setManualChangeCount(body.available_count ?? body.candidates?.length ?? 0);
      setManualChangeSummary(body);
    } catch (err) {
      console.error("Failed to refresh saved editor-change availability:", err);
    }
  }, [activeProjectId]);

  const prepareManualChanges = useCallback(async (sceneNumbers: number[] = []) => {
    if (!activeProjectId || manualSyncBusy) return;
    setManualSyncBusy(true);
    setGovernanceError(null);
    setGovernanceNotice(null);
    try {
      const res = await fetch(`${API_BASE}/api/projects/${activeProjectId}/manual-changes/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene_numbers: sceneNumbers }),
      });
      const body = (await res.json().catch(() => null)) as ManualChangesResponse | null;
      if (!res.ok) throw new Error((body as { detail?: string } | null)?.detail ?? `Manual sync returned ${res.status}.`);
      await loadGovernanceProposals();
      setPendingCommitBatches(await loadPendingCommitBatches());
      setFailedCommitBatches(await loadFailedCommitBatches());
      await refreshManualChangeAvailability();
      if (body?.status === "staged") {
        const skipped = body.skipped?.length ?? 0;
        setGovernanceNotice(
          `${body.proposals?.length ?? 0} saved editor change${body.proposals?.length === 1 ? "" : "s"} staged for review${skipped ? `; ${skipped} could not be staged safely` : ""}.`,
        );
      } else if (body?.status === "blocked" || (body?.skipped?.length ?? 0) > 0) {
        const skipped = body?.skipped ?? [];
        const detail = skipped
          .slice(0, 2)
          .map((item) => `Scene ${item.scene_number}: ${(item.errors ?? []).join(" ")}`)
          .join(" ");
        setGovernanceNotice(
          `No safe saved editor changes were staged. ${skipped.length} item${skipped.length === 1 ? " remains" : "s remain"} blocked for review.${detail ? ` ${detail}` : ""}`,
        );
      } else {
        setGovernanceNotice("No new saved editor changes were found for this project.");
      }
    } catch (err) {
      console.error("Failed to prepare manual editor changes:", err);
      setGovernanceError(err instanceof Error ? err.message : "Unable to prepare saved editor changes.");
    } finally {
      setManualSyncBusy(false);
    }
  }, [
    activeProjectId,
    loadGovernanceProposals,
    loadFailedCommitBatches,
    loadPendingCommitBatches,
    manualSyncBusy,
    refreshManualChangeAvailability,
  ]);

  const pushSavedDeskToGit = useCallback(async (overrideDirty = false) => {
    if (!activeProjectId || deskPushBusy) return;
    const confirmation = overrideDirty
      ? "Override the dirty-tree guard and commit only files changed by the saved Literary Studio desk? Unrelated dirty files will remain untouched, but any changes in the same committed file will be included."
      : "Push the complete saved Literary Studio desk into the linked current Git branch and commit it?";
    if (!window.confirm(confirmation)) {
      return;
    }
    setDeskPushBusy(true);
    setGovernanceError(null);
    setGovernanceNotice(null);
    try {
      const res = await fetch(`${API_BASE}/api/projects/${activeProjectId}/manual-changes/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, override_dirty: overrideDirty }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const detail = typeof body?.detail === "string" ? body.detail : body?.detail?.message;
        throw new Error(detail ?? `Full desk push returned ${res.status}.`);
      }
      if (body?.status === "blocked") {
        const blocked = (body.blocked ?? [])
          .map((item: { scene_number?: number; reason?: string }) => `Scene ${item.scene_number}: ${item.reason}`)
          .join(" ");
        setGovernanceError(`The safe desk push made no changes. Review the blocked scene(s). ${blocked}`.trim());
        return;
      }
      if (body?.committed) {
        setGovernanceNotice(
          `Full saved desk committed to ${body.branch ?? "the current branch"} at ${body.commit_sha?.slice(0, 8) ?? "new commit"}.${body.warning ? ` ${body.warning}` : ""}`,
        );
        await loadSourceStatus();
        await refreshManualChangeAvailability();
      } else {
        setGovernanceNotice(body?.message ?? "The saved desk already matches the linked Markdown source.");
      }
    } catch (err) {
      console.error("Failed to push the saved desk to Git:", err);
      setGovernanceError(err instanceof Error ? err.message : "Unable to push the saved desk to Git.");
    } finally {
      setDeskPushBusy(false);
    }
  }, [activeProjectId, deskPushBusy, loadSourceStatus, refreshManualChangeAvailability]);

  const pullFromGit = useCallback(async (pullRemote = false) => {
    if (!activeProjectId || gitPullBusy) return;
    setGitPullBusy(true);
    setGovernanceError(null);
    setGovernanceNotice(null);
    try {
      const res = await fetch(`${API_BASE}/api/projects/${activeProjectId}/git-pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pull_remote: pullRemote }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const detail = typeof body?.detail === "string" ? body.detail : body?.detail?.message;
        throw new Error(detail ?? `Git pull returned ${res.status}.`);
      }
      setGovernanceNotice(
        `Successfully pulled changes from Git into Studio (${body.total_scenes ?? 0} scenes synced across ${body.files_updated?.length ?? 0} files).`
      );
      await loadSourceStatus();
      await refreshScenes();
      await refreshManualChangeAvailability();
    } catch (err) {
      console.error("Failed to pull from Git:", err);
      setGovernanceError(err instanceof Error ? err.message : "Unable to pull from Git.");
    } finally {
      setGitPullBusy(false);
    }
  }, [activeProjectId, gitPullBusy, loadSourceStatus, refreshScenes, refreshManualChangeAvailability]);

  const directCommitActiveScene = useCallback(async (message?: string) => {
    if (!activeProjectId || selectedSceneNumber === undefined || directCommitBusy) return;
    setDirectCommitBusy(true);
    setGovernanceError(null);
    setGovernanceNotice(null);
    try {
      const res = await fetch(`${API_BASE}/api/projects/${activeProjectId}/scenes/${selectedSceneNumber}/direct-commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const detail = typeof body?.detail === "string" ? body.detail : body?.detail?.message;
        throw new Error(detail ?? `Direct commit returned ${res.status}.`);
      }
      if (body.committed) {
        setGovernanceNotice(
          `Directly committed Scene ${selectedSceneNumber} to ${body.branch ?? "Git"} (${body.commit_sha?.slice(0, 8)}).`
        );
        await loadSourceStatus();
        await refreshManualChangeAvailability();
      } else {
        setGovernanceNotice(body.message ?? "Scene is already committed and matches Git.");
      }
    } catch (err) {
      console.error("Failed to directly commit scene:", err);
      setGovernanceError(err instanceof Error ? err.message : "Unable to commit scene directly to Git.");
    } finally {
      setDirectCommitBusy(false);
    }
  }, [activeProjectId, selectedSceneNumber, directCommitBusy, loadSourceStatus, refreshManualChangeAvailability]);

  useEffect(() => {
    if (!activeProjectId) {
      return;
    }
    let cancelled = false;
    fetch(`${API_BASE}/api/projects/${activeProjectId}/manual-changes`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Manual-change service returned ${res.status}.`);
        return (await res.json()) as ManualChangesResponse;
      })
      .then((body) => {
        if (!cancelled) {
          setManualChangeCount(body.available_count ?? 0);
          setManualChangeSummary(body);
        }
      })
      .catch((err) => console.error("Failed to load saved editor-change availability:", err));
    return () => {
      cancelled = true;
    };
  }, [activeProjectId]);

  useEffect(() => {
    if (!activeProjectId) return;
    let cancelled = false;
    fetch(`${API_BASE}/api/projects/${activeProjectId}/governance/proposals`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Governance service returned ${res.status}.`);
        return (await res.json()) as GovernanceProposal[];
      })
      .then((data) => {
        if (!cancelled) setProposals(data);
      })
      .catch((err: unknown) => {
        console.error("Failed to fetch proposals:", err);
        if (!cancelled) setGovernanceError("Unable to load governance queue.");
      });
    return () => {
      cancelled = true;
    };
  }, [activeProjectId, loadGovernanceProposals]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadPendingCommitBatches(), loadFailedCommitBatches()])
      .then(([pending, failed]) => {
        if (cancelled) return;
        setPendingCommitBatches(pending);
        setFailedCommitBatches(failed);
      })
      .catch((err) => console.error("Failed to fetch governance commit state:", err));
    return () => {
      cancelled = true;
    };
  }, [loadFailedCommitBatches, loadPendingCommitBatches]);

  const clearCommitReminder = useCallback(() => {
    if (commitReminderTimer.current !== null) {
      window.clearTimeout(commitReminderTimer.current);
      commitReminderTimer.current = null;
    }
  }, []);

  const scheduleCommitReminder = useCallback(() => {
    clearCommitReminder();
    commitReminderTimer.current = window.setTimeout(() => {
      void loadPendingCommitBatches()
        .then((pending) => {
          setPendingCommitBatches(pending);
          if (pending.length > 0) {
            setCommitPromptReason("reminder");
            setCommitPromptTarget(null);
            setCommitPromptOpen(true);
          }
        })
        .catch((err) => console.error("Failed to refresh commit reminder:", err));
    }, 10 * 60 * 1000);
  }, [clearCommitReminder, loadPendingCommitBatches]);

  useEffect(() => () => clearCommitReminder(), [clearCommitReminder]);

  const requestTabChange = useCallback(
    (nextTab: WorkspaceTab) => {
      if (activeTab === "governance" && nextTab !== "governance" && pendingCommitBatches.length > 0) {
        setCommitPromptReason("leave");
        setCommitPromptTarget(nextTab);
        setCommitPromptOpen(true);
        return;
      }
      setActiveTab(nextTab);
    },
    [activeTab, pendingCommitBatches.length],
  );

  const handleWaitForCommit = () => {
    const nextTab = commitPromptTarget;
    setCommitPromptOpen(false);
    setCommitPromptTarget(null);
    if (nextTab) setActiveTab(nextTab);
    scheduleCommitReminder();
  };

  const handleCommitPending = async (overrideDirty = false) => {
    if (!activeProjectId || pendingCommitBatches.length === 0) return;
    if (overrideDirty && !window.confirm(
      "Override the dirty-source guard for these approved changes? The exact written source file will be committed, including any unrelated edits already present in that same file.",
    )) {
      return;
    }
    const nextTab = commitPromptTarget;
    setCommitBusy(true);
    setGovernanceError(null);
    const failures: string[] = [];
    try {
      for (const batch of pendingCommitBatches) {
        const res = await fetch(
          `${API_BASE}/api/projects/${activeProjectId}/approval-batches/${batch.batch_id}/commit`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ override_dirty: overrideDirty }),
          },
        );
        const body = await res.json().catch(() => null);
        if (res.ok && body?.committed === false && typeof body?.message === "string") {
          failures.push(`${batch.branch ?? "current branch"}: ${body.message}`);
          continue;
        }
        if (!res.ok) {
          const message = typeof body?.detail === "string"
            ? body.detail
            : body?.detail?.message ?? `Commit failed with status ${res.status}.`;
          failures.push(`${batch.branch ?? "current branch"}: ${message}`);
        }
      }
      const [remaining, failed] = await Promise.all([
        loadPendingCommitBatches(),
        loadFailedCommitBatches(),
      ]);
      setPendingCommitBatches(remaining);
      setFailedCommitBatches(failed);
      if (failures.length > 0 || remaining.length > 0) {
        setGovernanceError(failures.join(" ") || "Some approved changes are still waiting for a safe branch commit.");
        return;
      }
      clearCommitReminder();
      setCommitPromptOpen(false);
      setCommitPromptTarget(null);
      setGovernanceNotice(
        overrideDirty
          ? "Approved changes committed with the dirty-source override. Review the committed file before pushing or merging elsewhere."
          : "Approved changes committed to the pinned current branch.",
      );
      if (nextTab) setActiveTab(nextTab);
    } catch (err) {
      console.error("Failed to commit pending governance batches:", err);
      setGovernanceError(err instanceof Error ? err.message : "Unable to commit approved changes.");
    } finally {
      setCommitBusy(false);
    }
  };

  const saveScene = useCallback(async () => {
    if (!activeProjectId || !selectedScene) return;
    setSaveState("saving");
    const res = await fetch(`${API_BASE}/api/projects/${activeProjectId}/scenes/${selectedSceneNumber}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content_html: sceneContent, content_json: sceneDocumentJson, summary: "Editor autosave" }),
    });
    if (!res.ok) {
      setSaveState("error");
      throw new Error(`Scene save failed with status ${res.status}.`);
    }
    setSceneDirty(false);
    setSaveState("saved");
    void refreshManualChangeAvailability();
  }, [activeProjectId, refreshManualChangeAvailability, sceneContent, sceneDocumentJson, selectedScene, selectedSceneNumber]);

  useEffect(() => {
    if (!sceneLoaded || !sceneDirty) return;
    const timeout = window.setTimeout(() => {
      void saveScene().catch((err) => console.error("Scene autosave failed:", err));
    }, 800);
    return () => window.clearTimeout(timeout);
  }, [sceneDirty, sceneLoaded, saveScene]);

  const evaluationFocusPayload = () => ({
    focus_scope: evaluationScope,
    focus_instruction: evaluationFocus.trim(),
    focus_text: evaluationScope === "selection" ? selectedPassage?.quoteText ?? "" : "",
  });

  const runPersonaEvaluation = async (personaId: string) => {
    if (!activeProjectId || !selectedScene) return;
    if (evaluationScope === "chapter" && selectedScene.chapter_number === null) {
      setEvaluationError("Chapter focus is available for manuscript scenes, not scratch pages.");
      return;
    }
    if (evaluationScope === "selection" && !selectedPassage?.quoteText.trim()) {
      setEvaluationError("Select a passage in the editor first, or switch focus scope to Entire scene or Entire chapter.");
      return;
    }
    setLoadingEval(true);
    setEvaluatingPersonaId(personaId);
    setEvaluationError(null);
    try {
      const res = await fetch(`${API_BASE}/api/projects/${activeProjectId}/personas/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona_id: personaId,
          scene_number: selectedSceneNumber,
          scene_text: sceneContent,
          ...evaluationFocusPayload(),
        }),
      });
      if (!res.ok) {
        const errorBody = await res.json().catch(() => null);
        throw new Error(
          errorBody?.detail ?? `Evaluation service returned ${res.status}.`,
        );
      }
      const data = (await res.json()) as EvaluationResult;
      setEvaluationResult(data);
      setPersonaResults((current) => ({ ...current, [personaId]: data }));
      await loadEvaluationArchive();
    } catch (err) {
      console.error("Evaluation failed:", err);
      setEvaluationError(
        err instanceof Error ? err.message : "Evaluation failed.",
      );
    } finally {
      setLoadingEval(false);
      setEvaluatingPersonaId(null);
    }
  };

  const runAllPersonaEvaluations = async () => {
    if (!activeProjectId || !selectedScene || personaRoster.length === 0 || panelRunning) return;
    if (evaluationScope === "chapter" && selectedScene.chapter_number === null) {
      setPanelError("Chapter focus is available for manuscript scenes, not scratch pages.");
      return;
    }
    if (evaluationScope === "selection" && !selectedPassage?.quoteText.trim()) {
      setPanelError("Select a passage in the editor first, or switch focus scope to Entire scene or Entire chapter.");
      return;
    }
    setPanelRunning(true);
    setPanelError(null);
    setEvaluationError(null);
    try {
      const res = await fetch(`${API_BASE}/api/projects/${activeProjectId}/personas/evaluate-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scene_number: selectedSceneNumber,
          scene_text: sceneContent,
          panel_id: selectedPersonaPanelId,
          ...evaluationFocusPayload(),
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        evaluations?: EvaluationResult[];
        failed?: Record<string, string>;
        completed?: number;
        requested?: number;
      } | null;
      if (!res.ok) {
        throw new Error((data as { detail?: string } | null)?.detail ?? `Panel service returned ${res.status}.`);
      }
      const results = data?.evaluations ?? [];
      setPersonaResults(
        Object.fromEntries(results.map((result) => [result.persona_id, result])),
      );
      if (results[0]) setEvaluationResult(results[0]);
      await loadEvaluationArchive();
      const failedCount = Object.keys(data?.failed ?? {}).length;
      if (failedCount > 0) {
        setPanelError(
          `${data?.completed ?? results.length}/${data?.requested ?? personaRoster.length} simulators completed; ${failedCount} failed.`,
        );
      }
    } catch (err) {
      console.error("Persona panel failed:", err);
      setPanelError(err instanceof Error ? err.message : "Persona panel failed.");
    } finally {
      setPanelRunning(false);
    }
  };

  const runScenePass = async (passType: ScenePassType) => {
    if (!activeProjectId || !selectedScene || scenePassBusy) return;
    setScenePassBusy(passType);
    setGovernanceError(null);
    setGovernanceNotice(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/projects/${activeProjectId}/scenes/${selectedSceneNumber}/passes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pass_type: passType }),
        },
      );
      const body = await res.json().catch(() => null) as {
        detail?: string;
        pass_label?: string;
        proposals?: GovernanceProposal[];
        summary?: string;
        provenance?: { provider?: string | null; model?: string | null };
      } | null;
      if (!res.ok) {
        throw new Error(body?.detail ?? `Scene pass service returned ${res.status}.`);
      }
      await loadGovernanceProposals();
      const providerLabel = body?.provenance?.provider
        ? ` via ${body.provenance.provider}${body.provenance.model ? ` / ${body.provenance.model}` : ""}`
        : "";
      setGovernanceNotice(
        `${body?.pass_label ?? "Scene pass"} completed for ${sceneLabelForNumber(selectedSceneNumber)}. `
        + `${body?.proposals?.length ?? 0} proposal${body?.proposals?.length === 1 ? "" : "s"} sent to the Approval Desk${providerLabel}.`
        + (body?.summary ? ` ${body.summary}` : ""),
      );
      requestTabChange("governance");
    } catch (err) {
      console.error("Scene pass failed:", err);
      setGovernanceError(err instanceof Error ? err.message : "Scene pass failed.");
    } finally {
      setScenePassBusy(null);
    }
  };

  // Review a staged proposal. Accepting writes to the Markdown source on the
  // batch's pinned branch unless studioOnly; a dirty source can be explicitly
  // allowed after the exact-anchor safety check passes.
  const handleReview = async (
    proposal: GovernanceProposal,
    action: "accept" | "reject",
    studioOnly = false,
    edits?: ProposalDraft,
    allowDirtySource = false,
  ) => {
    if (!activeProjectId) return;
    if (action === "accept" && proposal.scene_number === selectedSceneNumber && sceneDirty) {
      setGovernanceError(
        `Scene ${proposal.scene_number} is open with unsaved edits. Let it save first, then accept, so autosave doesn't overwrite the change.`,
      );
      return;
    }
    setGovernanceError(null);
    setGovernanceNotice(null);
    setReviewingId(proposal.proposal_id);
    try {
      const res = await fetch(
        `${API_BASE}/api/projects/${activeProjectId}/governance/proposals/${proposal.proposal_id}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            studio_only: studioOnly,
            allow_dirty_source: allowDirtySource,
            defer_commit: true,
            ...(action === "accept" && edits ? edits : {}),
          }),
        },
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const detail: ReviewErrorDetail | string | undefined = body?.detail;
        if (detail && typeof detail === "object") {
          if (detail.code === "writeback_blocked" && detail.dirty_source_available) {
            setWritebackBlocked((prev) => ({
              ...prev,
              [proposal.proposal_id]: detail.message ?? "The source file could not be updated.",
            }));
            return;
          }
          const conflictText = detail.conflicts?.map((c) => c.message).filter(Boolean).join(" ");
          const validationText = detail.validation?.errors?.join(" ");
          throw new Error([detail.message, validationText, conflictText].filter(Boolean).join(" "));
        }
        throw new Error(typeof detail === "string" ? detail : `Review service returned ${res.status}.`);
      }
      setProposals((prev) => prev.filter((item) => item.proposal_id !== proposal.proposal_id));
      setWritebackBlocked((prev) => {
        const next = { ...prev };
        delete next[proposal.proposal_id];
        return next;
      });
      setEditingProposalId(null);
      setProposalDrafts((prev) => {
        const next = { ...prev };
        delete next[proposal.proposal_id];
        return next;
      });
      setGovernanceNotice(body?.message ?? "Proposal reviewed.");
      setPendingCommitBatches(await loadPendingCommitBatches());
      setFailedCommitBatches(await loadFailedCommitBatches());
      await loadSourceStatus();
      if (action === "accept" && proposal.scene_number === selectedSceneNumber) {
        setSceneReloadKey((key) => key + 1);
      }
    } catch (err) {
      console.error("Failed to review proposal:", err);
      setGovernanceError(err instanceof Error ? err.message : "Proposal review failed.");
    } finally {
      setReviewingId(null);
    }
  };

  const beginProposalEdit = (proposal: GovernanceProposal) => {
    setEditingProposalId(proposal.proposal_id);
    setProposalDrafts((prev) => ({
      ...prev,
      [proposal.proposal_id]: {
        original_verbatim_text: proposal.original_verbatim_text,
        proposed_replacement_text: proposal.proposed_replacement_text,
        editorial_rationale: proposal.editorial_rationale,
        change_type: proposal.change_type,
      },
    }));
    setGovernanceError(null);
  };

  const updateProposalDraft = (
    proposalId: string,
    field: keyof ProposalDraft,
    value: string,
  ) => {
    setProposalDrafts((prev) => ({
      ...prev,
      [proposalId]: {
        ...prev[proposalId],
        [field]: value,
      },
    }));
  };

  const cancelProposalEdit = (proposalId: string) => {
    setEditingProposalId(null);
    setProposalDrafts((prev) => {
      const next = { ...prev };
      delete next[proposalId];
      return next;
    });
  };

  const exportSelectionPayload = () => compilerScopeMode === "custom"
      ? {
        scene_numbers: selectedExportScenes,
        chapter_numbers: selectedExportChapters,
        part_numbers: selectedExportParts,
        selection_active: true,
      }
    : { scene_numbers: [], chapter_numbers: [], part_numbers: [], selection_active: false };

  const toggleExportPart = (partNumber: number) => {
    setCompilerScopeMode("custom");
    setSelectedExportParts((previous) => previous.includes(partNumber)
      ? previous.filter((number) => number !== partNumber)
      : [...previous, partNumber]);
  };

  const toggleExportChapter = (chapterNumber: number, parentPartNumber: number | null) => {
    setCompilerScopeMode("custom");
    if (parentPartNumber !== null) {
      setSelectedExportParts((previous) => previous.filter((number) => number !== parentPartNumber));
    }
    setSelectedExportChapters((previous) => previous.includes(chapterNumber)
      ? previous.filter((number) => number !== chapterNumber)
      : [...previous, chapterNumber]);
  };

  const toggleExportScene = (sceneNumber: number, parentChapterNumber: number | null, parentPartNumber: number | null) => {
    setCompilerScopeMode("custom");
    if (parentPartNumber !== null) {
      setSelectedExportParts((previous) => previous.filter((number) => number !== parentPartNumber));
    }
    if (parentChapterNumber !== null) {
      setSelectedExportChapters((previous) => previous.filter((number) => number !== parentChapterNumber));
    }
    setSelectedExportScenes((previous) => previous.includes(sceneNumber)
      ? previous.filter((number) => number !== sceneNumber)
      : [...previous, sceneNumber]);
  };

  const resetExportScope = () => {
    setCompilerScopeMode("all");
    setSelectedExportParts([]);
    setSelectedExportChapters([]);
    setSelectedExportScenes([]);
  };

  const compilerScopeLabel = compilerScopeMode === "all"
    ? "Full manuscript"
    : `${selectedExportParts.length} part${selectedExportParts.length === 1 ? "" : "s"}, ${selectedExportChapters.length} chapter${selectedExportChapters.length === 1 ? "" : "s"}, ${selectedExportScenes.length} scene${selectedExportScenes.length === 1 ? "" : "s"}`;

  const requestCompilerArtifact = async (
    outputFormat: CompilerOutputFormat,
    scopeOverride?: PreviewScope
  ) => {
    if (!activeProjectId) throw new Error("Choose a project before exporting.");
    if (sceneDirty) await saveScene();
    const projectTitle =
      projects.find((project) => project.project_id === activeProjectId)?.title ??
      "Manuscript";

    let selectionPayload;
    if (scopeOverride) {
      const targetScene = liveSelectedSceneForPreview ?? selectedScene ?? (scenes.length > 0 ? scenes[0] : null);
      selectionPayload = {
        scene_numbers: [] as number[],
        chapter_numbers: [] as number[],
        part_numbers: [] as number[],
        selection_active: false,
      };
      if (scopeOverride === "scene" && targetScene) {
        selectionPayload = {
          scene_numbers: [targetScene.scene_number],
          chapter_numbers: [],
          part_numbers: [],
          selection_active: true,
        };
      } else if (
        scopeOverride === "chapter" &&
        targetScene?.chapter_number !== null &&
        targetScene?.chapter_number !== undefined
      ) {
        selectionPayload = {
          scene_numbers: [],
          chapter_numbers: [targetScene.chapter_number],
          part_numbers: [],
          selection_active: true,
        };
      } else if (
        scopeOverride === "part" &&
        targetScene?.part_number !== null &&
        targetScene?.part_number !== undefined
      ) {
        selectionPayload = {
          scene_numbers: [],
          chapter_numbers: [],
          part_numbers: [targetScene.part_number],
          selection_active: true,
        };
      }
    } else {
      selectionPayload = exportSelectionPayload();
    }

    const res = await fetch(`${API_BASE}/api/projects/${activeProjectId}/compiler/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: projectTitle,
        author: "Gabriel McPherson",
        profile_id: formatProfileId,
        layout_tuning: layoutTuning,
        output_format: outputFormat,
        ...selectionPayload,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.detail ?? `Export failed with status ${res.status}.`);
    }
    const fallbackExtension = outputFormat === "pdf" ? "pdf" : outputFormat === "docx" ? "docx" : "md";
    return {
      blob: await res.blob(),
      filename: res.headers.get("content-disposition")?.match(/filename="?([^";]+)"?/i)?.[1] ?? `${projectTitle.replace(/[^a-z0-9]+/gi, "_")}.${fallbackExtension}`,
    };
  };

  const handleCompileExport = async () => {
    if (!activeProjectId) return;
    setIsCompiling(true);
    setCompilerError(null);
    setCompilerNotice(null);
    try {
      const { blob, filename } = await requestCompilerArtifact(compilerOutputFormat);
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error connecting to compiler service:", err);
      setCompilerError(err instanceof Error ? err.message : "Unable to compile the manuscript.");
    } finally {
      setIsCompiling(false);
    }
  };

  const handlePreviewExportArtifact = async (
    format: "pdf" | "docx" | "markdown",
    previewScopeParam: PreviewScope
  ) => {
    if (!activeProjectId) return;
    setIsCompiling(true);
    setCompilerError(null);
    setCompilerNotice(null);

    try {
      if (sceneDirty) await saveScene();
      const { blob, filename } = await requestCompilerArtifact(format, previewScopeParam);
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export error:", err);
      setCompilerError(
        err instanceof Error ? err.message : "Unable to export selected manuscript scope."
      );
    } finally {
      setIsCompiling(false);
    }
  };

  const requestCompiledPdf = async (scopeToCompile: PreviewScope = previewScope) => {
    return requestCompilerArtifact("pdf", scopeToCompile);
  };

  const exportShunnPdf = async () => {
    if (!activeProjectId || isCompiling) return;
    setIsCompiling(true);
    setCompilerError(null);
    setCompilerNotice(null);
    try {
      const { blob, filename } = await requestCompilerArtifact("pdf");
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      setCompilerNotice(`Exported ${filename} successfully.`);
    } catch (err) {
      console.error("Export Shunn PDF failed:", err);
      setCompilerError(err instanceof Error ? err.message : "Unable to export Shunn PDF.");
    } finally {
      setIsCompiling(false);
    }
  };

  const exportMarkdown = async () => {
    if (!activeProjectId || isCompiling) return;
    setIsCompiling(true);
    setCompilerError(null);
    setCompilerNotice(null);
    try {
      const { blob, filename } = await requestCompilerArtifact("markdown");
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      setCompilerNotice(`Exported ${filename} successfully.`);
    } catch (err) {
      console.error("Export Markdown failed:", err);
      setCompilerError(err instanceof Error ? err.message : "Unable to export Markdown.");
    } finally {
      setIsCompiling(false);
    }
  };

  const handleAirDrop = async () => {
    if (!activeProjectId) return;
    setIsAirDropping(true);
    setCompilerError(null);
    setCompilerNotice(null);
    try {
      if (sceneDirty) await saveScene();
      const projectTitle = projects.find((project) => project.project_id === activeProjectId)?.title ?? "Manuscript";
      const res = await fetch(`${API_BASE}/api/projects/${activeProjectId}/compiler/airdrop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: projectTitle,
          author: "Gabriel McPherson",
          profile_id: formatProfileId,
          layout_tuning: layoutTuning,
          output_format: compilerOutputFormat,
          ...exportSelectionPayload(),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.detail ?? `AirDrop handoff failed with status ${res.status}.`);
      setCompilerNotice(body?.message ?? "Finder opened with the export selected.");
    } catch (err) {
      console.error("AirDrop handoff failed:", err);
      setCompilerError(err instanceof Error ? err.message : "Unable to prepare the AirDrop handoff.");
    } finally {
      setIsAirDropping(false);
    }
  };

  const handlePreviewPDF = async (scopeToCompile: PreviewScope = previewScope) => {
    if (!activeProjectId) return;
    setIsPreviewing(true);
    setCompilerError(null);
    try {
      const { blob } = await requestCompiledPdf(scopeToCompile);
      setPreviewUrl(window.URL.createObjectURL(blob));
    } catch (err) {
      console.error("Error preparing compiler preview:", err);
      setCompilerError(err instanceof Error ? err.message : "Unable to preview the manuscript.");
    } finally {
      setIsPreviewing(false);
    }
  };

  const handlePreviewPDFRef = useRef<(scope?: PreviewScope) => Promise<void>>(() => Promise.resolve());
  useEffect(() => {
    handlePreviewPDFRef.current = handlePreviewPDF;
  });

  const triggerDebouncedPreview = useCallback((scopeToCompile: PreviewScope = previewScope, delayMs: number = 600) => {
    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    previewDebounceRef.current = setTimeout(() => {
      void handlePreviewPDFRef.current(scopeToCompile);
    }, delayMs);
  }, [previewScope]);

  useEffect(() => {
    triggerDebouncedPreviewRef.current = triggerDebouncedPreview;
  }, [triggerDebouncedPreview]);

  const handlePreviewScopeChange = useCallback((newScope: PreviewScope) => {
    setPreviewScope(newScope);
    triggerDebouncedPreviewRef.current?.(newScope, 250);
  }, []);

  useEffect(() => {
    return () => {
      if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
      if (previewUrl) window.URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleOpenContextPackage = () => {
    const chapter = Math.max(1, selectedScene?.chapter_number ?? 1);
    setContextChapterStart(String(chapter));
    setContextChapterEnd(String(chapter));
    setContextPackage(null);
    setContextError(null);
    setContextCopied(false);
    setContextOpen(true);
  };

  const handleGenerateContextPackage = async () => {
    if (!activeProjectId || contextGenerating) return;
    const chapterStart = Number(contextChapterStart);
    const chapterEnd = Number(contextChapterEnd);
    if (!Number.isInteger(chapterStart) || !Number.isInteger(chapterEnd)) {
      setContextError("Enter whole-number chapter bounds.");
      return;
    }
    setContextGenerating(true);
    setContextError(null);
    setContextPackage(null);
    try {
      if (sceneDirty) await saveScene();
      const res = await fetch(`${API_BASE}/api/projects/${activeProjectId}/context-package`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapter_start: chapterStart,
          chapter_end: chapterEnd,
          include: contextIncludes,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.detail ?? `Context package service returned ${res.status}.`);
      }
      setContextPackage(data as ContextPackage);
    } catch (err) {
      console.error("Context package generation failed:", err);
      setContextError(err instanceof Error ? err.message : "Unable to build context package.");
    } finally {
      setContextGenerating(false);
    }
  };

  const handleCopyContextPackage = async () => {
    if (!contextPackage) return;
    try {
      await navigator.clipboard.writeText(contextPackage.paste_prompt);
      setContextCopied(true);
      window.setTimeout(() => setContextCopied(false), 2500);
    } catch (err) {
      console.error("Unable to copy context package:", err);
      setContextError("Clipboard access was unavailable. Use Download Markdown instead.");
    }
  };

  const handleDownloadContextPackage = () => {
    if (!contextPackage) return;
    const blob = new Blob([contextPackage.markdown], { type: "text/markdown;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${contextPackage.title.replace(/[^a-z0-9]+/gi, "_")}_chapters_${contextPackage.selected_chapters[0]}-${contextPackage.selected_chapters.at(-1)}_context.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleExportContextGoogleDoc = async () => {
    if (!activeProjectId || contextGoogleExporting) return;
    const chapterStart = Number(contextChapterStart);
    const chapterEnd = Number(contextChapterEnd);
    if (!Number.isInteger(chapterStart) || !Number.isInteger(chapterEnd)) {
      setContextError("Enter whole-number chapter bounds.");
      return;
    }
    setContextGoogleExporting(true);
    setContextError(null);
    try {
      if (sceneDirty) await saveScene();
      const res = await fetch(`${API_BASE}/api/projects/${activeProjectId}/context-package/google-doc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapter_start: chapterStart,
          chapter_end: chapterEnd,
          include: contextIncludes,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail ?? `Google Docs export returned ${res.status}.`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${activeProjectId}_chapters_${chapterStart}-${chapterEnd}_google-doc.docx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Google Docs export failed:", err);
      setContextError(err instanceof Error ? err.message : "Unable to export for Google Docs.");
    } finally {
      setContextGoogleExporting(false);
    }
  };

  const queueSceneTitleMetadata = (content: string) => {
    if (!activeProjectId || !selectedScene) return;
    const title = editorSceneTitle(content);
    const hadTitleBlock = sceneTitleBlockPresent.current;
    sceneTitleBlockPresent.current = title !== null;
    if (title === null && hadTitleBlock !== true) return;
    if (title !== null && title === (selectedScene.title ?? "").trim()) return;
    if (title === null && !(selectedScene.title ?? "").trim()) return;
    if (sceneTitleSyncTimer.current !== null) window.clearTimeout(sceneTitleSyncTimer.current);
    const targetScene = selectedScene;
    sceneTitleSyncTimer.current = window.setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/projects/${activeProjectId}/scenes/${targetScene.scene_number}/metadata`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            chapter_number: targetScene.chapter_number ?? null,
            chapter_title: targetScene.chapter_title ?? null,
            scene_number_in_chapter: targetScene.scene_number_in_chapter ?? null,
            part_number: targetScene.part_number ?? null,
            part_title: targetScene.part_title ?? null,
          }),
        });
        const updated = await res.json().catch(() => null);
        if (!res.ok) throw new Error(updated?.detail ?? `Scene title sync returned ${res.status}.`);
        setScenes((previous) => previous.map((scene) => scene.scene_number === targetScene.scene_number ? updated as SceneData : scene));
      } catch (error) {
        console.error("Failed to sync semantic scene title:", error);
      }
    }, 650);
  };

  const handleEditorUpdate = (content: string, documentJson?: Record<string, unknown>) => {
    setSceneContent(content);
    if (documentJson) setSceneDocumentJson(documentJson);
    setSceneDirty(true);
    setSaveState("saving");
    queueSceneTitleMetadata(content);
  };

  const createSceneDraftSession = async (scene: SceneData, mode: "tethered" | "piece_together" = "tethered") => {
    if (!activeProjectId) return;
    setDraftSessionBusy(true);
    setDraftSessionError(null);
    try {
      const response = await fetch(`${API_BASE}/api/projects/${activeProjectId}/draft-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: scene.chapter_title
            ? `${scene.chapter_title} · Scene ${scene.scene_number_in_chapter ?? scene.scene_number}: ${scene.title}`
            : scene.title,
          chapter_number: scene.chapter_number ?? null,
          scene_number: scene.scene_number,
          mode,
        }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.detail ?? `Draft session could not be started (${response.status}).`);
      }
      const created = (await response.json()) as DraftSession;
      setDraftSession(created);
      setDraftSessions((previous) => [
        {
          session_id: created.session_id,
          title: created.title,
          chapter_number: created.chapter_number,
          source_scene_numbers: created.source_scene_numbers,
          mode: created.mode,
          tether_enabled: created.tether_enabled,
          base_document_id: created.base_document_id,
          status: created.status,
          archived_at: created.archived_at,
          archive_reason: created.archive_reason,
          created_at: created.created_at,
          updated_at: created.updated_at,
        },
        ...previous.filter((session) => session.session_id !== created.session_id),
      ]);
    } catch (error) {
      setDraftSessionError(error instanceof Error ? error.message : "Draft session could not be started.");
    } finally {
      setDraftSessionBusy(false);
    }
  };

  const handleStartDraftSide = async () => {
    if (!selectedScene) return;
    await createSceneDraftSession(selectedScene);
  };

  const handleOpenDraftSession = async (summary: DraftSessionSummary) => {
    if (!activeProjectId) return;
    setDraftSessionBusy(true);
    setDraftSessionError(null);
    try {
      if (summary.source_scene_numbers.length > 1) {
        const currentScene = scenes.find((candidate) => candidate.scene_number === selectedSceneNumber);
        const scene = (currentScene?.chapter_number === summary.chapter_number ? currentScene : undefined)
          ?? scenes.find((candidate) => candidate.scene_number === summary.source_scene_numbers[0]);
        if (!scene) throw new Error("Choose a scene from this chapter before reopening the draft.");
        setSelectedSceneNumber(scene.scene_number);
        await createSceneDraftSession(scene, summary.mode);
        return;
      }
      const response = await fetch(
        `${API_BASE}/api/projects/${activeProjectId}/draft-sessions/${encodeURIComponent(summary.session_id)}`,
      );
      if (!response.ok) throw new Error(`Draft session could not be opened (${response.status}).`);
      const session = (await response.json()) as DraftSession;
      const sourceSceneNumber = session.source_scene_numbers[0];
      if (sourceSceneNumber !== undefined) setSelectedSceneNumber(sourceSceneNumber);
      setDraftSession(session);
    } catch (error) {
      setDraftSessionError(error instanceof Error ? error.message : "Draft session could not be opened.");
    } finally {
      setDraftSessionBusy(false);
    }
  };

  const handleDeleteDraftSession = (sessionId: string) => {
    setDraftSessions((previous) => previous.filter((session) => session.session_id !== sessionId));
    setDraftSession((current) => current?.session_id === sessionId ? null : current);
    setDraftSessionError(null);
  };

  const handleResolveDraftSession = async (action: "promote" | "keep_canon") => {
    setDraftSession(null);
    setDraftSessionError(null);
    if (action === "promote") {
      setSceneReloadKey((current) => current + 1);
      await refreshScenes(selectedSceneNumber);
    }
    if (activeProjectId) {
      try {
        const response = await fetch(`${API_BASE}/api/projects/${activeProjectId}/draft-sessions`);
        if (response.ok) setDraftSessions((await response.json()) as DraftSessionSummary[]);
      } catch (error) {
        setDraftSessionError(error instanceof Error ? error.message : "Unable to refresh draft archive.");
      }
    }
  };

  const handleDeleteLegacyDraftSession = async (sessionId: string) => {
    if (!window.confirm("Delete this legacy chapter-wide draft? Its saved draft copy will be removed.")) return;
    try {
      const response = await fetch(
        `${API_BASE}/api/projects/${activeProjectId}/draft-sessions/${encodeURIComponent(sessionId)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error(`Draft deletion failed (${response.status}).`);
      handleDeleteDraftSession(sessionId);
    } catch (error) {
      setDraftSessionError(error instanceof Error ? error.message : "Draft deletion failed.");
    }
  };

  const handleAddAnnotation = (anchor: AnnotationAnchor | null) => {
    setAnnotationError(null);
    requestTabChange("notes");
    if (!anchor) {
      setAnnotationDraft(null);
      setAnnotationError("Place the cursor inside a paragraph before adding a note.");
      return;
    }
    setAnnotationDraft({ ...anchor, body: "", category: "note" });
  };

  const handleSaveAnnotation = async () => {
    if (!activeProjectId || !selectedScene || !annotationDraft || !annotationDraft.body.trim()) {
      setAnnotationError("Write a note before saving it.");
      return;
    }
    setAnnotationSaving(true);
    setAnnotationError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/projects/${activeProjectId}/scenes/${selectedSceneNumber}/annotations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paragraph_id: annotationDraft.paragraphId,
            quote_text: annotationDraft.quoteText,
            body: annotationDraft.body,
            category: annotationDraft.category,
          }),
        },
      );
      const errorBody = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(errorBody?.detail ?? `Annotation service returned ${res.status}.`);
      }
      setAnnotations((previous) => [errorBody as Annotation, ...previous]);
      setAnnotationDraft(null);
    } catch (err) {
      console.error("Failed to save annotation:", err);
      setAnnotationError(err instanceof Error ? err.message : "Unable to save note.");
    } finally {
      setAnnotationSaving(false);
    }
  };

  const handleResolveAnnotation = async (annotationId: string) => {
    if (!activeProjectId || !selectedScene) return;
    setAnnotationError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/projects/${activeProjectId}/scenes/${selectedSceneNumber}/annotations/${annotationId}/resolve`,
        { method: "POST" },
      );
      const errorBody = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(errorBody?.detail ?? `Annotation service returned ${res.status}.`);
      }
      const resolved = errorBody as Annotation;
      setAnnotations((previous) =>
        previous.map((annotation) =>
          annotation.annotation_id === annotationId ? { ...annotation, ...resolved } : annotation,
        ),
      );
    } catch (err) {
      console.error("Failed to resolve annotation:", err);
      setAnnotationError(err instanceof Error ? err.message : "Unable to resolve note.");
    }
  };

  const handleAskAnnotation = async (annotation: Annotation) => {
    if (!activeProjectId || !selectedScene) return;
    const question = annotationAdviceQuestion[annotation.annotation_id]?.trim() ||
      "What should I consider about this note?";
    setAnnotationAdviceLoading(annotation.annotation_id);
    setAnnotationError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/projects/${activeProjectId}/scenes/${selectedSceneNumber}/annotations/${annotation.annotation_id}/advice`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, persona_id: "narrative_editor" }),
        },
      );
      const errorBody = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(errorBody?.detail ?? `AI advice service returned ${res.status}.`);
      }
      const advicePayload = errorBody as { ai_advice: Annotation["ai_advice"] };
      setAnnotations((previous) =>
        previous.map((item) =>
          item.annotation_id === annotation.annotation_id
            ? { ...item, ai_advice: advicePayload.ai_advice }
            : item,
        ),
      );
    } catch (err) {
      console.error("Failed to get AI advice for annotation:", err);
      setAnnotationError(err instanceof Error ? err.message : "Unable to get AI advice.");
    } finally {
      setAnnotationAdviceLoading(null);
    }
  };

  const openMetadataEditor = () => {
    if (!selectedScene) return;
    setMetadataError(null);
    setMetadataDraft({
      title: selectedScene.title ?? "",
      chapter_number: selectedScene.chapter_number == null ? "" : String(selectedScene.chapter_number),
      chapter_title: cleanChapterTitle(selectedScene.chapter_title, selectedScene.chapter_number),
      scene_number_in_chapter: selectedScene.scene_number_in_chapter == null ? "" : String(selectedScene.scene_number_in_chapter),
      part_number: selectedScene.part_number == null ? "" : String(selectedScene.part_number),
      part_title: selectedScene.part_title ?? (selectedScene.part_number ? `Part ${selectedScene.part_number}` : ""),
    });
    setMetadataEditorOpen(true);
  };

  const saveSceneMetadata = async () => {
    if (!activeProjectId || !selectedScene || !metadataDraft) return;
    setMetadataSaving(true);
    setMetadataError(null);
    const integerOrNull = (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return null;
      const parsed = Number.parseInt(trimmed, 10);
      return Number.isFinite(parsed) ? parsed : null;
    };
    try {
      const res = await fetch(`${API_BASE}/api/projects/${activeProjectId}/scenes/${selectedScene.scene_number}/metadata`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: metadataDraft.title,
          chapter_number: integerOrNull(metadataDraft.chapter_number),
          chapter_title: metadataDraft.chapter_title.trim() || null,
          scene_number_in_chapter: integerOrNull(metadataDraft.scene_number_in_chapter),
          part_number: integerOrNull(metadataDraft.part_number),
          part_title: metadataDraft.part_title.trim() || null,
        }),
      });
      const detail = await res.json().catch(() => null);
      if (!res.ok) throw new Error(detail?.detail ?? `Metadata service returned ${res.status}.`);
      const updated = detail as SceneData;
      setScenes((previous) => previous.map((scene) => scene.scene_number === updated.scene_number ? updated : scene));
      setMetadataEditorOpen(false);
      setMetadataDraft(null);
    } catch (error) {
      setMetadataError(error instanceof Error ? error.message : "Unable to save scene metadata.");
    } finally {
      setMetadataSaving(false);
    }
  };

  const handleSceneSelect = useCallback((sceneNumber: number, paragraphIndex: number | null = null) => {
    setMapFocusParagraphIndex(paragraphIndex);
    setMapFocusRequestId((current) => current + 1);
    if (sceneNumber === selectedSceneNumber) return;
    if (draftSession && !draftSession.source_scene_numbers.includes(sceneNumber)) {
      setDraftSession(null);
      setDraftSessionError(null);
    }
    // A scene switch is a document identity boundary. Do not let the prior
    // editor buffer or autosave lifecycle follow the new scene.
    setSceneLoaded(false);
    setSceneDirty(false);
    setSaveState("loading");
    setSceneDocumentJson(null);
    setSelectedSceneNumber(sceneNumber);
    setAnnotationLoading(true);
    setEvaluationResult(null);
    setEvaluationError(null);
    setSelectedPassage(null);
    setHistoryOpen(false);
    setSelectedRevision(null);
    setAnnotationDraft(null);
    setAnnotationError(null);
  }, [draftSession, selectedSceneNumber]);

  useEffect(() => {
    sceneTitleBlockPresent.current = null;
  }, [selectedSceneNumber]);

  const handleOpenHistory = async () => {
    if (!activeProjectId || !selectedScene) return;
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await fetch(`${API_BASE}/api/projects/${activeProjectId}/scenes/${selectedSceneNumber}/history`);
      if (!res.ok) throw new Error(`History service returned ${res.status}.`);
      const data = (await res.json()) as SceneRevision[];
      setHistory(data);
      setSelectedRevision(data[0] ?? null);
    } catch (err) {
      console.error("Failed to fetch scene history:", err);
      setHistoryError(err instanceof Error ? err.message : "Unable to load scene history.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleRestoreRevision = async (revision: SceneRevision) => {
    if (!activeProjectId || !selectedScene || revision.version === selectedScene.version) return;
    if (!window.confirm(`Restore Scene ${selectedSceneNumber} to revision v${revision.version}?`)) {
      return;
    }

    setHistoryError(null);
    try {
      const res = await fetch(`${API_BASE}/api/projects/${activeProjectId}/scenes/${selectedSceneNumber}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision_id: revision.revision_id }),
      });
      if (!res.ok) {
        const errorBody = await res.json().catch(() => null);
        throw new Error(errorBody?.detail ?? `Restore service returned ${res.status}.`);
      }
      const restored = (await res.json()) as SceneData;
      setSceneContent(restored.content_html);
      setSceneDirty(false);
      setSaveState("saved");
      setScenes((prev) =>
        prev.map((scene) =>
          scene.scene_number === restored.scene_number ? restored : scene,
        ),
      );
      await handleOpenHistory();
    } catch (err) {
      console.error("Failed to restore scene revision:", err);
      setHistoryError(err instanceof Error ? err.message : "Unable to restore revision.");
    }
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportTitle(file.name.replace(/\.(markdown|md|txt)$/i, "") || "Imported material");
    setImportText(await file.text());
    setImportError(null);
    setImportSuccess(null);
    setIntakeAnalysis(null);
    setIntakeAudit(null);
    setRepositoryFiles([]);
  };

  const handleRepositoryFolder = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
      .filter((file) => {
        if (!/\.(md|markdown)$/i.test(file.name)) return false;
        const path = file.webkitRelativePath || file.name;
        return path.split("/").some((part) =>
          /^acts?(?:\s|[-_]|$)/i.test(part) || /^chapters?$/i.test(part) || /^appendix(?:\s|[-_]|$)/i.test(part) || /chapter/i.test(part),
        );
      })
      .sort((left, right) => left.webkitRelativePath.localeCompare(right.webkitRelativePath, undefined, { numeric: true }));
    if (!files.length) {
      setImportError("Choose a checkout containing Act or Chapter folders with Markdown files.");
      return;
    }
    const payload = await Promise.all(
      files.map(async (file) => ({
        path: file.webkitRelativePath || file.name,
        text: await file.text(),
      })),
    );
    const root = payload[0]?.path.split("/")[0];
    setImportTitle(root || "Imported repository");
    setRepositoryFiles(payload);
    setImportText("");
    setImportError(null);
    setImportSuccess(null);
    setIntakeAnalysis(null);
    setIntakeAudit(null);
  };

  const handleAnalyzeIntake = async () => {
    if (!activeProjectId || intakeAnalyzing) return;
    const material = repositoryFiles.length > 0
      ? repositoryFiles.map((file) => `<!-- source: ${file.path} -->\n\n${file.text}`).join("\n\n")
      : importText;
    if (!material.trim()) return;
    setIntakeAnalyzing(true);
    setImportError(null);
    setIntakeAnalysis(null);
    try {
      const res = await fetch(`${API_BASE}/api/projects/${activeProjectId}/intake/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          material,
          source_label: importTitle.trim() || "manuscript intake",
        }),
      });
      const errorBody = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorBody?.detail ?? `Intake analysis returned ${res.status}.`);
      setIntakeAnalysis((errorBody as { analysis: string }).analysis);
    } catch (err) {
      console.error("Intake analysis failed:", err);
      setImportError(err instanceof Error ? err.message : "Intake analysis failed.");
    } finally {
      setIntakeAnalyzing(false);
    }
  };

  const handleSourceSnapshot = async () => {
    if (!activeProjectId || !sourceRoot.trim() || snapshotting) return;
    setSnapshotting(true);
    setImportError(null);
    setImportSuccess(null);
    try {
      const res = await fetch(`${API_BASE}/api/projects/${activeProjectId}/source-snapshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_root: sourceRoot.trim(),
          source_subpath: sourceSubpath.trim() || null,
        }),
      });
      const errorBody = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorBody?.detail ?? `Snapshot service returned ${res.status}.`);
      const data = errorBody as {
        project: ProjectSummary;
        scenes: SceneData[];
        manifest: { branch: string; commit_sha: string; working_tree_dirty: boolean };
        intake_audit?: IntakeAudit;
      };
      setProjects((previous) =>
        previous.map((project) =>
          project.project_id === data.project.project_id ? data.project : project,
        ),
      );
      setScenes(data.scenes);
      setIntakeAudit(data.intake_audit ?? null);
      if (data.scenes[0]) setSelectedSceneNumber(data.scenes[0].scene_number);
      setImportSuccess(
        `Imported ${data.scenes.length} scenes from ${data.manifest.branch} at ${data.manifest.commit_sha.slice(0, 8)}${data.manifest.working_tree_dirty ? " (working tree had changes)" : ""}; intake oversight recorded.`,
      );
      setSourceRoot("");
      setSourceSubpath("");
    } catch (err) {
      console.error("Source snapshot failed:", err);
      setImportError(err instanceof Error ? err.message : "Source snapshot failed.");
    } finally {
      setSnapshotting(false);
    }
  };

  const handleImportMaterial = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeProjectId || (!importText.trim() && repositoryFiles.length === 0) || importing) return;
    setImporting(true);
    setImportError(null);
    setImportSuccess(null);
    try {
      const isRepositoryImport = repositoryFiles.length > 0;
      const res = await fetch(
        `${API_BASE}/api/projects/${activeProjectId}/scenes/${isRepositoryImport ? "import-repository" : "import"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isRepositoryImport
              ? { title: importTitle.trim() || "Imported repository", files: repositoryFiles }
              : {
                  title: importTitle.trim() || "Imported material",
                  text: importText,
                  split_mode: importSplitMode,
                },
          ),
        },
      );
      const errorBody = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorBody?.detail ?? `Import service returned ${res.status}.`);
      const data = errorBody as { scenes: SceneData[]; intake_audit?: IntakeAudit };
      setScenes((previous) => [...previous, ...data.scenes]);
      setIntakeAudit(data.intake_audit ?? null);
      if (data.scenes[0]) {
        setSelectedSceneNumber(data.scenes[0].scene_number);
      }
      const issueCount = data.intake_audit?.structural_audit?.issues.length ?? 0;
      const aiStatus = data.intake_audit?.status === "complete"
        ? "AI oversight complete"
        : "deterministic oversight recorded";
      setImportSuccess(
        `Imported ${data.scenes.length} scene${data.scenes.length === 1 ? "" : "s"}; ${aiStatus}; ${issueCount} structural issue${issueCount === 1 ? "" : "s"} flagged for review.`,
      );
      setImportText("");
      setRepositoryFiles([]);
    } catch (err) {
      console.error("Material import failed:", err);
      setImportError(err instanceof Error ? err.message : "Material import failed.");
    } finally {
      setImporting(false);
    }
  };

  const existingChapters = Array.from(
    new Map(
      scenes
        .filter((s) => s.chapter_number !== null && s.chapter_number !== undefined)
        .map((s) => [s.chapter_number!, { number: s.chapter_number!, title: s.chapter_title ?? `Chapter ${s.chapter_number}` }])
    ).values()
  ).sort((a, b) => a.number - b.number);

  const handleCreateNewPage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeProjectId || newPageBusy) return;
    setNewPageBusy(true);
    setNewPageError(null);
    try {
      const isScratch = newPageType === "scratch";
      const chNum = !isScratch && newPageChapterNumber.trim() ? Number(newPageChapterNumber.trim()) : null;
      const res = await fetch(`${API_BASE}/api/projects/${activeProjectId}/scenes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newPageTitle.trim() || (isScratch ? "Scratchpad" : "New Scene"),
          content_html: "<p></p>",
          is_scratch: isScratch,
          chapter_number: chNum,
          chapter_title: !isScratch ? newPageChapterTitle.trim() || undefined : undefined,
          source_path: newPageSourcePath.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const errorBody = await res.json().catch(() => null);
        throw new Error(errorBody?.detail ?? `Scene creation returned status ${res.status}.`);
      }
      const createdScene = (await res.json()) as SceneData;
      await refreshScenes(createdScene.scene_number);
      setSelectedSceneNumber(createdScene.scene_number);
      setSceneContent("<p></p>");
      setSceneLoaded(true);
      setSceneDirty(false);
      setSaveState("saved");
      setNewPageOpen(false);
      setNewPageTitle("");
      setNewPageChapterNumber("");
      setNewPageChapterTitle("");
      setNewPageSourcePath("");
    } catch (err) {
      console.error("Failed to create new blank page:", err);
      setNewPageError(err instanceof Error ? err.message : "Failed to create new blank page.");
    } finally {
      setNewPageBusy(false);
    }
  };

  const handleProjectChange = (projectId: string) => {
    setScenes([]);
    setDraftSession(null);
    setDraftSessions([]);
    setDraftSessionError(null);
    setSelectedSceneNumber(1);
    setSceneContent("");
    setSceneLoaded(false);
    setSceneDirty(false);
    setSourceRoot("");
    setIntakeAudit(null);
    setCompilerScopeMode("all");
    setSelectedExportParts([]);
    setSelectedExportChapters([]);
    setSelectedExportScenes([]);
    setPendingCommitBatches([]);
    setFailedCommitBatches([]);
    setSourceStatus(null);
    setSourceStatusProjectId(null);
    setActiveProjectId(projectId || null);
  };

  const handleCreateProject = async () => {
    const title = window.prompt("New manuscript project name:")?.trim();
    if (!title) return;
    try {
      const res = await fetch(`${API_BASE}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const errorBody = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorBody?.detail ?? `Project service returned ${res.status}.`);
      const project = errorBody as ProjectSummary;
      setProjects((previous) => [...previous, project]);
      handleProjectChange(project.project_id);
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : "Unable to create project.");
    }
  };

  const currentProject = projects.find((p) => p.project_id === activeProjectId);

  return (
    <div className="flex flex-col h-screen w-full min-w-0 overflow-hidden bg-zinc-950 text-zinc-100 font-sans">
      <WindowChrome
        projects={projects}
        currentProjectId={activeProjectId ?? ""}
        onSelectProject={handleProjectChange}
        currentProject={currentProject}
        isSaving={saveState === "saving"}
        onPullGit={() => void pullFromGit(false)}
        onDeskPush={() => void pushSavedDeskToGit(false)}
        onDirectCommit={() => void directCommitActiveScene()}
        canDirectCommit={Boolean(selectedScene)}
        onExportShunn={() => void exportShunnPdf()}
        onExportMarkdown={() => void exportMarkdown()}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        inspectorOpen={inspectorOpen}
        setInspectorOpen={setInspectorOpen}
        isCompiling={isCompiling}
        pullingGit={gitPullBusy}
        pushingDesk={deskPushBusy}
        directCommitting={directCommitBusy}
      />

      <main className="flex-1 min-h-0 flex w-full min-w-0 overflow-hidden bg-[#18181b] text-zinc-100 font-sans">
        {/* ================= LEFT COLUMN: MANUSCRIPT NAVIGATOR ================= */}
        {sidebarOpen && (
          <aside className="w-72 border-r border-zinc-800 bg-zinc-900/60 backdrop-blur-sm flex flex-col shrink-0">
            <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Manuscript Tree
              </span>
              <span className="text-[11px] font-mono text-zinc-500 bg-zinc-800/80 px-2 py-0.5 rounded-full border border-zinc-700/50">
                {scenes.length} scenes
              </span>
            </div>

        <div className="p-4 flex-1 overflow-y-auto">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Project boundary
          </p>
          <select
            value={activeProjectId ?? ""}
            onChange={(event) => handleProjectChange(event.target.value)}
            disabled={projects.length === 0}
            className="mb-3 w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500 disabled:opacity-50"
            aria-label="Active manuscript project"
          >
            {projects.length === 0 ? (
              <option value="">Loading projects…</option>
            ) : (
              <>
                <option value="">Choose a project…</option>
                {projects.map((project) => (
                  <option key={project.project_id} value={project.project_id}>
                    {project.title}
                  </option>
                ))}
              </>
            )}
          </select>
          <button
            type="button"
            onClick={() => void handleCreateProject()}
            className="mb-3 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-left text-xs text-slate-300 transition hover:bg-slate-700"
          >
            + New isolated project
          </button>
          {projectError && <p className="mb-3 text-xs text-rose-300">{projectError}</p>}
          <div className="mb-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setNewPageOpen(true);
                setNewPageError(null);
                setNewPageTitle("");
                setNewPageType("scratch");
              }}
              disabled={!activeProjectId}
              className="rounded border border-emerald-600/60 bg-emerald-950/40 px-2 py-2 text-center text-xs font-medium text-emerald-200 transition hover:bg-emerald-900/50 disabled:opacity-40"
              title="Create a new blank scratch file or scene in the manuscript"
            >
              + New Blank Page
            </button>
            <button
              type="button"
              onClick={() => {
                setImportOpen(true);
                setImportError(null);
                setImportSuccess(null);
              }}
              disabled={!activeProjectId}
              className="rounded border border-indigo-700/60 bg-indigo-950/40 px-2 py-2 text-center text-xs font-medium text-indigo-200 transition hover:bg-indigo-900/50 disabled:opacity-40"
            >
              + Import Material
            </button>
          </div>
          <div className="space-y-1 text-sm">
              <div className="font-medium text-slate-200 py-1 px-2 rounded bg-slate-800/60">
                Manuscript chapters
              </div>
              <div className="pl-4 space-y-1 mt-1 text-slate-400">
                {scenes.length > 0 ? (
                  partGroups.map((part) => {
                    const partScenes = part.chapters.flatMap((chapter) => chapter.scenes);
                    const isScratch = part.key === "scratch";
                    return (
                      <details key={part.key} open className="space-y-1">
                        <summary className="mt-3 cursor-pointer list-none border-b border-slate-700/70 px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-300">
                          <span>{isScratch ? "📝 Scratch & Drafts" : part.title}</span>
                          <span className="float-right text-[9px] font-normal tracking-normal text-slate-600">{partScenes.length}</span>
                        </summary>
                        <div className="ml-2 space-y-2 border-l border-slate-700/80 pl-3">
                          {part.chapters.map((group) => {
                            const groupDraftSessions = draftSessions.filter((session) =>
                              group.chapter_number == null
                                ? session.chapter_number == null && session.source_scene_numbers.some((number) => group.scenes.some((scene) => scene.scene_number === number))
                                : session.chapter_number === group.chapter_number,
                            );
                            return (
                              <div key={group.key} className="space-y-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const firstScene = group.scenes[0];
                                    if (firstScene) handleSceneSelect(firstScene.scene_number);
                                  }}
                                  className="flex w-full items-center justify-between rounded px-1 pt-1 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400 transition hover:bg-slate-800/50 hover:text-slate-200"
                                  title="Open the first scene in this chapter"
                                >
                                  <span>{group.chapter_number == null || group.chapter_number === 0 ? group.title : `Chapter ${group.chapter_number} · ${group.title}`}</span>
                                  <span className="text-[9px] font-normal text-slate-600">{group.scenes.length}</span>
                                </button>
                                {groupDraftSessions.length > 0 && (
                                  <details className="rounded border border-violet-900/50 bg-violet-950/20">
                                    <summary className="cursor-pointer px-2 py-1 text-[10px] font-semibold text-violet-300">
                                      Draft sides ({groupDraftSessions.length})
                                    </summary>
                                    <div className="space-y-1 px-1 pb-1">
                                      {groupDraftSessions.map((draft) => (
                                        <button
                                          type="button"
                                          key={draft.session_id}
                                          onClick={() => void handleOpenDraftSession(draft)}
                                          disabled={draftSessionBusy}
                                          className={`w-full rounded px-2 py-1 text-left text-[10px] transition ${draftSession?.session_id === draft.session_id ? "bg-violet-700/40 text-violet-100" : "text-violet-200/80 hover:bg-violet-900/40"}`}
                                        >
                                          <span className="block truncate">{draft.title}</span>
                                          <span className="block text-[9px] text-violet-300/60">
                                            {draft.source_scene_numbers.length > 1 ? "Scenes" : "Scene"} {draft.source_scene_numbers.join(", ")} · saved {draft.updated_at.slice(0, 16).replace("T", " ")}
                                          </span>
                                        </button>
                                      ))}
                                    </div>
                                  </details>
                                )}
                                <div className="ml-2 space-y-0.5 border-l border-slate-800 pl-2">
                                  {group.scenes.map((scene) => (
                                    <button
                                      type="button"
                                      key={scene.scene_number}
                                      onClick={() => handleSceneSelect(scene.scene_number)}
                                      className={`flex w-full items-baseline gap-2 rounded py-1 pl-2 pr-1 text-left text-xs transition ${selectedSceneNumber === scene.scene_number ? "bg-indigo-600/20 text-indigo-300 border-l-2 border-indigo-500" : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-200"}`}
                                    >
                                      <span className="w-5 shrink-0 text-right font-mono text-[10px] text-slate-600">{scene.scene_number_in_chapter ?? "·"}</span>
                                      {sceneTitleLabel(scene) && <span className="truncate">{sceneTitleLabel(scene)}</span>}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </details>
                    );
                  })
                ) : (
                <div className="py-1 px-2 text-xs text-slate-500">
                  {activeProjectId ? "No manuscript loaded yet." : "Choose a project."}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-3 border-t border-zinc-800 text-xs text-zinc-500 flex justify-between">
          <span>FastAPI: {backendStatus === "connected" ? "Connected" : backendStatus === "offline" ? "Offline" : "Checking…"}</span>
          <span className={backendStatus === "connected" ? "text-emerald-400" : "text-amber-400"}>
            ● {backendStatus === "connected" ? "Live" : "Waiting"}
          </span>
        </div>
      </aside>
    )}

      {/* ================= CENTER COLUMN: THE PROSE EDITOR ================= */}
      <section className="min-h-0 min-w-0 flex-1 flex flex-col bg-slate-950 border-r border-slate-800">
        {/* Top Editor Bar / Branch Selector */}
        <div className="sticky top-0 z-[60] min-h-14 shrink-0 border-b border-slate-800 bg-slate-900/95 px-4 py-2 flex items-center justify-between gap-3 shadow-lg shadow-black/10 backdrop-blur-sm">
          <div className="flex min-w-0 items-center gap-3">
            <span className="text-sm font-medium text-slate-300">
              Live editor
            </span>
            <span className="min-w-0 truncate text-xs px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
              {saveState === "saving"
                ? "Saving…"
                : saveState === "error"
                  ? "Save error"
                  : (() => {
                    const project = projects.find((item) => item.project_id === activeProjectId);
                    const liveStatus = sourceStatusProjectId === activeProjectId ? sourceStatus : null;
                    const branch = liveStatus?.branch ?? project?.branch ?? "project-local";
                    const commitSha = liveStatus?.commit_sha ?? project?.commit_sha;
                    const commit = commitSha ? ` @ ${commitSha.slice(0, 8)}` : "";
                    const dirty = liveStatus
                      ? (liveStatus.working_tree_dirty ? " · manuscript worktree dirty" : "")
                      : (project?.working_tree_dirty ? " · manuscript worktree dirty" : "");
                    return `Saved · ${branch}${commit}${dirty}`;
                  })()}
            </span>

            {/* Apple HIG View Mode Segmented Control */}
            <div className="flex items-center rounded-lg bg-zinc-950/80 p-0.5 border border-zinc-700/60 text-xs">
              <button
                type="button"
                onClick={() => setEditorViewMode("editor")}
                className={`px-2.5 py-1 rounded font-medium transition ${
                  editorViewMode === "editor"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
                title="Editor only"
              >
                Editor
              </button>
              <button
                type="button"
                onClick={() => setEditorViewMode("split")}
                className={`px-2.5 py-1 rounded font-medium transition ${
                  editorViewMode === "split"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
                title="Split View: Live Editor + Instant Typeset Output Preview"
              >
                Split Preview
              </button>
              <button
                type="button"
                onClick={() => setEditorViewMode("preview")}
                className={`px-2.5 py-1 rounded font-medium transition ${
                  editorViewMode === "preview"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
                title="Formatted Publisher Output only"
              >
                Formatted Output
              </button>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* Quick Author Git Actions */}
            <button
              type="button"
              onClick={() => void pullFromGit(false)}
              disabled={gitPullBusy || !activeProjectId}
              className="rounded border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:bg-slate-700 disabled:opacity-50 flex items-center gap-1"
              title="Pull external Git commits non-destructively into Studio cache"
            >
              {gitPullBusy ? "Pulling…" : "Git Pull"}
            </button>
            <button
              type="button"
              onClick={() => void directCommitActiveScene()}
              disabled={directCommitBusy || !activeProjectId || selectedSceneNumber === undefined}
              className="rounded border border-emerald-600/70 bg-emerald-700/30 px-2.5 py-1 text-xs font-medium text-emerald-200 transition hover:bg-emerald-600/50 disabled:opacity-40 flex items-center gap-1 shadow-sm"
              title="Direct Author Commit of this scene to Git without proposal batching"
            >
              {directCommitBusy ? "Committing…" : "Direct Commit"}
            </button>

            <details className="relative">
              <summary className="list-none cursor-pointer rounded border border-indigo-600/70 bg-indigo-700/40 px-3 py-1.5 text-xs font-medium text-indigo-100 transition hover:bg-indigo-600/60 [&::-webkit-details-marker]:hidden">
                Functions <span className="ml-1 text-indigo-300">▾</span>
              </summary>
              <div
                className="absolute right-0 top-full z-[70] mt-2 max-h-[calc(100dvh-5rem)] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-lg border border-slate-700 bg-slate-900 p-3 shadow-2xl shadow-black/50"
                onWheel={(event) => event.stopPropagation()}
              >
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Scene passes</p>
                  <div className="space-y-1.5">
                    <button
                      type="button"
                      onClick={() => void runScenePass("mechanical")}
                      disabled={Boolean(scenePassBusy) || !activeProjectId || !selectedScene}
                      className="w-full rounded border border-sky-600/60 bg-sky-700/30 px-2.5 py-2 text-left text-xs font-medium text-sky-100 transition hover:bg-sky-700/50 disabled:bg-slate-800 disabled:text-slate-600"
                      title="Find only clear spelling, punctuation, grammar, capitalization, and spacing errors in this scene"
                    >
                      {scenePassBusy === "mechanical" ? "Running mechanical pass…" : "Run spelling / mechanical pass"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void runScenePass("slop_tell_habit")}
                      disabled={Boolean(scenePassBusy) || !activeProjectId || !selectedScene}
                      className="w-full rounded border border-fuchsia-600/60 bg-fuchsia-700/25 px-2.5 py-2 text-left text-xs font-medium text-fuchsia-100 transition hover:bg-fuchsia-700/45 disabled:bg-slate-800 disabled:text-slate-600"
                      title="Run a deep, evidence-based pass for AI slop, tell-not-show shortcuts, and recurring habits"
                    >
                      {scenePassBusy === "slop_tell_habit" ? "Running craft pass…" : "Run slop / tell / habit pass"}
                    </button>
                  </div>
                  <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
                    Both passes are scene-scoped and send proposed fixes to Approval Desk. Nothing changes automatically.
                  </p>
                </div>
                <div className="border-t border-slate-800 pt-3">
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Project</p>
                  <div className="space-y-1.5">
                    <button
                      type="button"
                      onClick={() => void openSourceRepair()}
                      disabled={!activeProjectId || sourceRepairLoading}
                      className="w-full rounded border border-amber-600/60 bg-amber-950/40 px-2.5 py-2 text-left text-xs text-amber-100 transition hover:bg-amber-900/50 disabled:opacity-40"
                      title="Review and recompile one complete Markdown source file with semantic scene boundaries"
                    >
                      {sourceRepairLoading ? "Opening source repair…" : "Repair Markdown intake"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void loadSourceStatus(true)}
                      disabled={!activeProjectId || sourceStatusLoading}
                      className={`w-full rounded border px-2.5 py-2 text-left text-xs transition ${sourceStatus?.working_tree_dirty || projects.find((item) => item.project_id === activeProjectId)?.working_tree_dirty
                        ? "border-amber-700/70 bg-amber-950/40 text-amber-200 hover:bg-amber-900/50"
                        : "border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-800"}`}
                      title="Show the exact files that make the source worktree dirty"
                    >
                      {sourceStatusLoading ? "Checking source…" : "Show source status"}
                    </button>
                    <button
                      type="button"
                      onClick={openMetadataEditor}
                      disabled={!selectedScene}
                      className="w-full rounded border border-cyan-700/60 bg-cyan-950/30 px-2.5 py-2 text-left text-xs text-cyan-200 transition hover:bg-cyan-900/50 disabled:opacity-40"
                      title="Edit the selected scene's outline taxonomy"
                    >
                      Edit outline metadata
                    </button>
                  </div>
                </div>
                </div>
                <div className="border-t border-slate-800 pt-3">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Workspace</p>
                  <div className="space-y-1.5">
                    <button
                      type="button"
                      onClick={handleOpenContextPackage}
                      disabled={!activeProjectId || scenes.length === 0}
                      className="w-full rounded border border-emerald-600/50 bg-emerald-700/40 px-2.5 py-2 text-left text-xs font-medium text-emerald-100 transition hover:bg-emerald-700/60 disabled:bg-slate-800 disabled:text-slate-600"
                    >
                      Share context package
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (draftSession) {
                          if (draftSession.source_scene_numbers.length > 1 && selectedScene) {
                            void createSceneDraftSession(selectedScene, draftSession.mode);
                          } else {
                            setDraftSession(null);
                            setDraftSessionError(null);
                          }
                        } else {
                          void handleStartDraftSide();
                        }
                      }}
                      disabled={draftSessionBusy || !activeProjectId || !selectedScene}
                      className="w-full rounded border border-violet-600/50 bg-violet-700/40 px-2.5 py-2 text-left text-xs font-medium text-violet-100 transition hover:bg-violet-700/60 disabled:bg-slate-800 disabled:text-slate-600"
                      title="Open a separate, project-local side-by-side draft for the selected scene"
                    >
                      {draftSessionBusy ? "Opening draft…" : draftSession && draftSession.source_scene_numbers.length > 1 ? "Open scene draft" : draftSession ? "Close draft side" : "Draft side"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleOpenHistory()}
                      className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-2 text-left text-xs font-medium text-slate-200 transition hover:bg-slate-700"
                    >
                      Scene history
                    </button>
                  </div>
                </div>
                <div className="border-t border-slate-800 pt-3">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Output</p>
                  <label className="mb-1.5 flex items-center justify-between gap-2 rounded border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-slate-300" title="Choose the generated file type">
                    <span>Output type</span>
                    <select
                      aria-label="Compiler output type"
                      value={compilerOutputFormat}
                      onChange={(event) => setCompilerOutputFormat(event.target.value as CompilerOutputFormat)}
                      disabled={isCompiling || isPreviewing || isAirDropping}
                      className="max-w-[10rem] rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-300 outline-none focus:border-indigo-500"
                    >
                      <option value="pdf">PDF</option>
                      <option value="markdown">Markdown (.md)</option>
                      <option value="docx">Word / Google Docs (.docx)</option>
                    </select>
                  </label>
                  <label className="mb-1.5 flex items-center justify-between gap-2 rounded border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-slate-300" title="Formatter profile">
                    <span>Format profile</span>
                    <select
                      aria-label="PDF format profile"
                      value={formatProfileId}
                      onChange={(event) => setFormatProfileId(event.target.value)}
                      disabled={isCompiling || isPreviewing || formatProfiles.length === 0}
                      className="max-w-[10rem] rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-300 outline-none focus:border-indigo-500"
                    >
                      {formatProfiles.length === 0 ? (
                        <option value="manuscript_submission">Loading profiles…</option>
                      ) : (
                        formatProfiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>{profile.label}</option>
                        ))
                      )}
                    </select>
                  </label>
                  <details className="mb-1.5 rounded border border-slate-700 bg-slate-950">
                    <summary className="cursor-pointer list-none px-2.5 py-2 text-xs text-slate-300">
                      <span className="font-medium">Include: {compilerScopeLabel}</span>
                      <span className="float-right text-slate-500">▾</span>
                    </summary>
                    <div className="max-h-72 space-y-1 overflow-y-auto border-t border-slate-800 p-2">
                      <button
                        type="button"
                        onClick={resetExportScope}
                        className={`mb-1 w-full rounded px-2 py-1.5 text-left text-[10px] transition ${compilerScopeMode === "all" ? "bg-indigo-900/60 text-indigo-100" : "text-slate-400 hover:bg-slate-800"}`}
                      >
                        Full manuscript — include every part, chapter, and scene
                      </button>
                      {compilerPartGroups.map((part) => {
                        const partSelected = part.part_number !== null && selectedExportParts.includes(part.part_number);
                        return (
                          <div key={part.key} className="rounded border border-slate-800/80">
                            <label className="flex items-center gap-2 px-2 py-1.5 text-[10px] font-semibold text-slate-300 hover:bg-slate-900">
                              {part.part_number !== null ? (
                                <input
                                  type="checkbox"
                                  checked={partSelected}
                                  onChange={() => toggleExportPart(part.part_number as number)}
                                  className="accent-indigo-500"
                                />
                              ) : <span className="w-3" />}
                              <span>{part.title}</span>
                              <span className="ml-auto text-[9px] font-normal text-slate-600">{part.chapters.reduce((count, chapter) => count + chapter.scenes.length, 0)} scenes</span>
                            </label>
                            <div className="space-y-1 border-l border-slate-800/80 pl-3">
                              {part.chapters.map((chapter) => {
                                const chapterSelected = chapter.chapter_number !== null && selectedExportChapters.includes(chapter.chapter_number);
                                return (
                                  <div key={chapter.key}>
                                    <label className="flex items-center gap-2 px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-900 hover:text-slate-200">
                                      {chapter.chapter_number !== null ? (
                                        <input
                                          type="checkbox"
                                          checked={partSelected || chapterSelected}
                                          onChange={() => toggleExportChapter(chapter.chapter_number as number, part.part_number)}
                                          className="accent-indigo-500"
                                        />
                                      ) : <span className="w-3" />}
                                      <span>{chapter.chapter_number == null ? chapter.title : `Chapter ${chapter.chapter_number} · ${chapter.title}`}</span>
                                    </label>
                                    <div className="space-y-0.5 border-l border-slate-800/60 pl-4">
                                      {chapter.scenes.map((scene) => {
                                        const sceneSelected = selectedExportScenes.includes(scene.scene_number);
                                        return (
                                          <label key={scene.scene_number} className="flex items-center gap-2 px-2 py-1 text-[10px] text-slate-500 hover:bg-slate-900 hover:text-slate-200">
                                            <input
                                              type="checkbox"
                                              checked={partSelected || chapterSelected || sceneSelected}
                                              onChange={() => toggleExportScene(scene.scene_number, chapter.chapter_number, part.part_number)}
                                              className="accent-indigo-500"
                                            />
                                            <span className="truncate">Scene {scene.scene_number_in_chapter ?? scene.scene_number}{sceneTitleLabel(scene) ? ` · ${sceneTitleLabel(scene)}` : ""}</span>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                  <div className="space-y-1.5">
                    <button
                      type="button"
                      onClick={() => void handleCompileExport()}
                      disabled={isCompiling || isPreviewing || isAirDropping}
                      className="w-full rounded border border-indigo-500/60 bg-indigo-600 px-2.5 py-2 text-left text-xs font-medium text-white transition hover:bg-indigo-500 disabled:cursor-wait disabled:bg-indigo-900"
                    >
                      {isCompiling ? "Preparing export…" : `Export ${compilerOutputFormat === "pdf" ? "PDF" : compilerOutputFormat === "docx" ? "DOCX" : "Markdown"}`}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handlePreviewPDF(previewScope)}
                      disabled={isCompiling || isPreviewing || isAirDropping}
                      className="w-full rounded border border-indigo-500/60 bg-indigo-950/40 px-2.5 py-2 text-left text-xs text-indigo-200 transition hover:bg-indigo-900/60 disabled:cursor-wait disabled:opacity-50"
                    >
                      {isPreviewing ? "Preparing preview…" : "Preview selected PDF"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleAirDrop()}
                      disabled={isCompiling || isPreviewing || isAirDropping}
                      className="w-full rounded border border-sky-700/60 bg-sky-950/40 px-2.5 py-2 text-left text-xs text-sky-200 transition hover:bg-sky-900/60 disabled:cursor-wait disabled:opacity-50"
                    >
                      {isAirDropping ? "Preparing AirDrop…" : "Send selected export via AirDrop"}
                    </button>
                  </div>
                </div>
              </div>
            </details>
          </div>
        </div>

        {metadataEditorOpen && metadataDraft && (
          <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/60 px-4 pt-16 backdrop-blur-sm">
            <div className="w-full max-w-4xl rounded-b-lg border border-cyan-800/70 bg-slate-900 px-6 py-4 shadow-2xl shadow-black/50">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">Outline metadata</p>
                  <p className="mt-1 text-[11px] text-slate-500">This controls the navigator, editor heading, and formatter taxonomy. Prose is unchanged. Scene titles are optional.</p>
                </div>
                <button type="button" onClick={() => setMetadataEditorOpen(false)} className="text-xs text-slate-500 hover:text-slate-200">Close</button>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {([
                  ["part_title", "Part label", "e.g. Part One"],
                  ["part_number", "Part number", "1"],
                  ["chapter_number", "Chapter number", "10"],
                  ["chapter_title", "Chapter title", "The chapter title"],
                  ["scene_number_in_chapter", "Scene number", "1"],
                  ["title", "Scene label", "The scene label"],
                ] as const).map(([field, label, placeholder]) => (
                  <label key={field} className="space-y-1 text-[10px] text-slate-400">
                    <span>{label}</span>
                    <input
                      value={metadataDraft[field]}
                      placeholder={placeholder}
                      onChange={(event) => setMetadataDraft((current) => current ? { ...current, [field]: event.target.value } : current)}
                      className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-cyan-500"
                    />
                  </label>
                ))}
              </div>
              {metadataError && <p className="mt-2 text-xs text-rose-300">{metadataError}</p>}
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setMetadataEditorOpen(false)} className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800">Cancel</button>
                <button type="button" onClick={() => void saveSceneMetadata()} disabled={metadataSaving} className="rounded border border-cyan-600/70 bg-cyan-800/40 px-3 py-1.5 text-xs font-medium text-cyan-100 hover:bg-cyan-700/50 disabled:opacity-50">
                  {metadataSaving ? "Saving metadata…" : "Save outline metadata"}
                </button>
              </div>
            </div>
          </div>
        )}

        {sourceRepairOpen && (
          <div className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-black/75 px-4 py-6 backdrop-blur-sm">
            <div className="w-full max-w-7xl rounded-lg border border-amber-800/70 bg-slate-900 shadow-2xl shadow-black/60">
              <div className="sticky top-0 z-[120] flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/95 px-5 py-3 backdrop-blur-sm">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-300">Source intake repair</p>
                  <p className="mt-1 text-[11px] text-slate-400">Review one complete Markdown file. Mark structural blocks with the Style menu; Scene Title blocks become scene boundaries when this file is recompiled.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSourceRepairOpen(false)}
                  className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800"
                >
                  Close
                </button>
              </div>
              <div className="space-y-3 p-5">
                <div className="flex flex-wrap items-end gap-3 rounded border border-slate-800 bg-slate-950/60 p-3">
                  <label className="min-w-0 flex-1 space-y-1 text-[10px] text-slate-400">
                    <span>Markdown source file</span>
                    <select
                      value={sourceRepairPath ?? ""}
                      onChange={(event) => void loadSourceRepairDocument(event.target.value)}
                      disabled={sourceRepairLoading || sourceRepairBusy || sourceRepairFiles.length === 0}
                      className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-slate-200 outline-none focus:border-amber-500 disabled:opacity-50"
                    >
                      {sourceRepairFiles.length === 0 ? (
                        <option value="">No Markdown files available</option>
                      ) : (
                        sourceRepairFiles.map((file) => (
                          <option key={file.path} value={file.path}>
                            {file.path} · {file.scene_count} indexed scene{file.scene_count === 1 ? "" : "s"}
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                  <div className="text-[10px] text-slate-500">
                    {sourceRepairDocument ? `Pinned source ${sourceRepairDocument.sha256.slice(0, 12)}…` : "Choose a file to begin"}
                  </div>
                  <button
                    type="button"
                    onClick={() => void recompileSourceRepair()}
                    disabled={!sourceRepairDocument || sourceRepairBusy || sourceRepairLoading}
                    className="rounded border border-amber-600/70 bg-amber-700/40 px-3 py-2 text-xs font-medium text-amber-100 transition hover:bg-amber-600/50 disabled:opacity-40"
                  >
                    {sourceRepairBusy ? "Recompiling file…" : "Recompile this file"}
                  </button>
                </div>
                <div className="rounded border border-indigo-800/50 bg-indigo-950/20 p-3 text-[11px] leading-relaxed text-indigo-100/80">
                  Click inside a source line, open <span className="font-semibold text-indigo-200">Style</span> in the editor toolbar, and assign <span className="font-semibold text-indigo-200">Scene Title</span> to each actual internal scene header. Use Chapter Title, Part Title, Dateline, Location, and the other styles where they belong. Removing a Scene Title block removes that scene boundary from the rebuilt contents and graph; the prose is not silently discarded.
                </div>
                {sourceRepairError && <p className="rounded border border-rose-800/60 bg-rose-950/30 p-2 text-xs text-rose-200">{sourceRepairError}</p>}
                {sourceRepairNotice && <p className="rounded border border-emerald-800/60 bg-emerald-950/30 p-2 text-xs text-emerald-200">{sourceRepairNotice}</p>}
                {sourceRepairDocument?.frontmatter && (
                  <details className="rounded border border-slate-800 bg-slate-950/60 p-2">
                    <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-slate-500">Preserved Markdown frontmatter</summary>
                    <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-[10px] leading-relaxed text-slate-400">{sourceRepairDocument.frontmatter}</pre>
                  </details>
                )}
                {sourceRepairLoading ? (
                  <p className="py-12 text-center text-xs text-slate-500">Loading the complete Markdown file…</p>
                ) : sourceRepairDocument ? (
                  <div className="max-h-[70vh] overflow-y-auto rounded border border-slate-800 bg-slate-950 px-12 py-2">
                    <TiptapEditor
                      key={`${sourceRepairDocument.path}:${sourceRepairDocument.sha256}`}
                      initialContent={sourceRepairDocument.content_html}
                      documentLabel={`Source repair · ${sourceRepairDocument.path}`}
                      onUpdate={setSourceRepairContent}
                      editorSettings={editorSettings}
                      onEditorSettingsChange={handleEditorSettingsChange}
                    />
                  </div>
                ) : (
                  <p className="py-12 text-center text-xs text-slate-500">Select a Markdown source file.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {draftSession ? (
          <div className="min-h-0 flex-1 overflow-hidden p-4 w-full">
            <div className="h-full w-full">
              {draftSession.source_scene_numbers.length > 1 ? (
                <div className="mx-auto max-w-xl rounded-lg border border-amber-800/60 bg-amber-950/20 p-5 text-sm">
                  <div className="mb-2 font-semibold text-amber-200">Legacy chapter-wide draft preserved</div>
                  <p className="mb-4 text-xs leading-relaxed text-amber-100/80">
                    This draft was created before Draft Side became scene-scoped, so it is not being loaded into the editor. Choose a scene to open a new scene-only draft; the legacy session remains intact until you explicitly delete it.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={draftSessionBusy || !selectedScene}
                      onClick={() => {
                        if (!selectedScene) return;
                        void createSceneDraftSession(selectedScene, draftSession.mode);
                      }}
                      className="rounded border border-violet-600/60 bg-violet-800/40 px-3 py-1.5 text-xs text-violet-100 hover:bg-violet-700/50 disabled:opacity-50"
                    >
                      Start scene-only draft for {selectedScene?.title ?? "selected scene"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteLegacyDraftSession(draftSession.session_id)}
                      className="rounded border border-rose-700/70 bg-rose-950/30 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-900/50"
                    >
                      Abort / Delete legacy draft
                    </button>
                    <button
                      type="button"
                      onClick={() => setDraftSession(null)}
                      className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                    >
                      Close
                    </button>
                  </div>
                </div>
              ) : (
                <DraftSideWorkspace
                  apiBase={API_BASE}
                  projectId={activeProjectId ?? ""}
                  session={draftSession}
                  onClose={() => {
                    setDraftSession(null);
                    setDraftSessionError(null);
                  }}
                  onDeleted={handleDeleteDraftSession}
                  onResolved={handleResolveDraftSession}
                  editorSettings={editorSettings}
                  onEditorSettingsChange={handleEditorSettingsChange}
                />
              )}
            </div>
          </div>
        ) : editorViewMode === "preview" ? (
          <div className="min-h-0 flex-1 overflow-hidden w-full h-full">
            <LiveTypesetPreview
              projectTitle={currentProject?.title ?? "Untitled Manuscript"}
              author={currentProject?.author ?? "Author"}
              allScenes={liveScenesForPreview}
              selectedScene={liveSelectedSceneForPreview}
              formatProfileId={formatProfileId}
              onFormatProfileChange={setFormatProfileId}
              onTuningChange={handleLayoutTuningChange}
              scope={previewScope}
              onScopeChange={handlePreviewScopeChange}
            />
          </div>
        ) : editorViewMode === "split" ? (
          <div className="min-h-0 flex-1 flex flex-row divide-x divide-slate-800 overflow-hidden w-full h-full">
            {/* Left Column: Live Prose Editor */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <div className="mx-auto w-full max-w-2xl px-6 py-6 pb-16">
                {draftSessionError && (
                  <div className="mb-4 rounded border border-rose-800/50 bg-rose-950/20 px-3 py-2 text-xs text-rose-200">
                    {draftSessionError}
                  </div>
                )}

                {sceneLoaded ? (
                  <TiptapEditor
                    key={`scene-editor-${selectedSceneNumber}`}
                    initialContent={sceneContent}
                    documentLabel={selectedSceneLabel}
                    onUpdate={handleEditorUpdate}
                    editorSettings={editorSettings}
                    onEditorSettingsChange={handleEditorSettingsChange}
                    onAddAnnotation={handleAddAnnotation}
                    onSelectionChange={setSelectedPassage}
                    focusParagraphIndex={mapFocusParagraphIndex}
                    focusRequestId={mapFocusRequestId}
                    highlightParagraphIndex={mapFocusParagraphIndex}
                  />
                ) : (
                  <p className="py-12 text-center text-sm text-slate-500">
                    {activeProjectId && scenes.length > 0
                      ? "Loading scene from the project store…"
                      : "Import manuscript material to begin this project."}
                  </p>
                )}

                {evaluationResult && (
                  <div className="mt-8 p-4 bg-indigo-950/30 border border-indigo-800/50 rounded-lg text-sans text-sm">
                    <div className="font-semibold text-indigo-300 mb-1">
                      Latest Persona Analysis ({evaluationResult.persona_name})
                    </div>
                    <p className="text-slate-300 mb-2">
                      {evaluationResult.executive_reaction}
                    </p>
                    <div className="text-xs text-indigo-400">
                      Verdict: {evaluationResult.verdict}
                    </div>
                    {evaluationResult.focus_instruction && (
                      <div className="mt-2 text-[11px] text-slate-500">
                        Focus: {evaluationResult.focus_instruction}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Instant Live Typeset Preview */}
            <div className="min-h-0 flex-1 overflow-hidden h-full">
              <LiveTypesetPreview
                projectTitle={currentProject?.title ?? "Untitled Manuscript"}
                author={currentProject?.author ?? "Author"}
                allScenes={liveScenesForPreview}
                selectedScene={liveSelectedSceneForPreview}
                formatProfileId={formatProfileId}
                onFormatProfileChange={setFormatProfileId}
                onTuningChange={handleLayoutTuningChange}
                scope={previewScope}
                onScopeChange={handlePreviewScopeChange}
              />
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="mx-auto w-full max-w-3xl px-12 pb-12 pt-6">
              {draftSessionError && (
                <div className="mb-4 rounded border border-rose-800/50 bg-rose-950/20 px-3 py-2 text-xs text-rose-200">
                  {draftSessionError}
                </div>
              )}

              {sceneLoaded ? (
                    <TiptapEditor
                      key={`scene-editor-draft-${selectedSceneNumber}`}
                      initialContent={sceneContent}
                  documentLabel={selectedSceneLabel}
                  onUpdate={handleEditorUpdate}
                  editorSettings={editorSettings}
                  onEditorSettingsChange={handleEditorSettingsChange}
                  onAddAnnotation={handleAddAnnotation}
                  onSelectionChange={setSelectedPassage}
                  focusParagraphIndex={mapFocusParagraphIndex}
                  focusRequestId={mapFocusRequestId}
                  highlightParagraphIndex={mapFocusParagraphIndex}
                />
              ) : (
                <p className="py-12 text-center text-sm text-slate-500">
                  {activeProjectId && scenes.length > 0
                    ? "Loading scene from the project store…"
                    : "Import manuscript material to begin this project."}
                </p>
              )}

              {evaluationResult && (
                <div className="mt-8 p-4 bg-indigo-950/30 border border-indigo-800/50 rounded-lg text-sans text-sm">
                  <div className="font-semibold text-indigo-300 mb-1">
                    Latest Persona Analysis ({evaluationResult.persona_name})
                  </div>
                  <p className="text-slate-300 mb-2">
                    {evaluationResult.executive_reaction}
                  </p>
                  <div className="text-xs text-indigo-400">
                    Verdict: {evaluationResult.verdict}
                  </div>
                  {evaluationResult.focus_instruction && (
                    <div className="mt-2 text-[11px] text-slate-500">
                      Focus: {evaluationResult.focus_instruction}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ================= RIGHT COLUMN: ADVISORY & GOVERNANCE DECK ================= */}
      {inspectorOpen && (
        <aside className={`${activeTab === "graph" ? "w-1/2" : "w-[32rem] max-w-[42vw]"} min-w-0 shrink-0 bg-zinc-900/60 backdrop-blur-sm border-l border-zinc-800 flex flex-col transition-[width] duration-200`}>
          {/* Native Apple Segmented Control */}
          <div className="p-2.5 border-b border-zinc-800 flex items-center justify-center">
            <div className="mac-segmented-control w-full justify-between">
              <button
                type="button"
                onClick={() => requestTabChange("personas")}
                className={`mac-segmented-item flex-1 text-center ${activeTab === "personas" ? "active" : ""}`}
              >
                Critique
              </button>
              <button
                type="button"
                onClick={() => requestTabChange("governance")}
                className={`mac-segmented-item flex-1 text-center ${activeTab === "governance" ? "active" : ""}`}
              >
                <span>Desk</span>
                {manualChangeCount > 0 && (
                  <span className="ml-1 rounded-full bg-amber-500 text-white px-1.5 py-0.2 text-[9px] font-bold">
                    {manualChangeCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => requestTabChange("notes")}
                className={`mac-segmented-item flex-1 text-center ${activeTab === "notes" ? "active" : ""}`}
              >
                Notes
              </button>
              <button
                type="button"
                onClick={() => requestTabChange("orchestrator")}
                className={`mac-segmented-item flex-1 text-center ${activeTab === "orchestrator" ? "active" : ""}`}
              >
                Telemetry
              </button>
              <button
                type="button"
                onClick={() => requestTabChange("graph")}
                className={`mac-segmented-item flex-1 text-center ${activeTab === "graph" ? "active" : ""}`}
              >
                Map
              </button>
              <button
                type="button"
                onClick={() => requestTabChange("chat")}
                className={`mac-segmented-item flex-1 text-center ${activeTab === "chat" ? "active" : ""}`}
              >
                Roleplay
              </button>
            </div>
          </div>

        {/* Tab Content Body */}
        <div className={`p-4 flex-1 overflow-y-auto space-y-4 text-sm ${activeTab === "graph" ? "min-w-0" : ""}`}>
          {activeTab === "notes" && (
            <div className="space-y-3">
              <div className="rounded border border-indigo-800/50 bg-indigo-950/20 p-3">
                <div className="mb-1 text-xs font-semibold text-indigo-200">
                  Scene notes
                </div>
                <p className="text-[11px] text-slate-400">
                  Select a passage or place the cursor in a paragraph, then use Note in the editor toolbar.
                </p>
                <p className="mt-2 text-[11px] text-slate-500">
                  Ask the configured AI about any saved note for focused input and suggestions. Gemini is primary when configured; AGY is the terminal fallback. It only runs when you ask.
                </p>
              </div>

              {annotationDraft && (
                <div className="space-y-2 rounded border border-amber-800/50 bg-amber-950/20 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-amber-300">
                    Anchored passage
                  </div>
                  <p className="max-h-20 overflow-y-auto font-serif text-xs italic leading-relaxed text-slate-300">
                    “{annotationDraft.quoteText || "Paragraph anchor"}”
                  </p>
                  <select
                    aria-label="Note category"
                    value={annotationDraft.category}
                    onChange={(event) =>
                      setAnnotationDraft((current) =>
                        current ? { ...current, category: event.target.value } : current,
                      )
                    }
                    className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-indigo-500"
                  >
                    <option value="note">General note</option>
                    <option value="continuity">Continuity</option>
                    <option value="voice">Voice</option>
                    <option value="pacing">Pacing</option>
                    <option value="research">Research</option>
                  </select>
                  <textarea
                    aria-label="Note body"
                    value={annotationDraft.body}
                    onChange={(event) =>
                      setAnnotationDraft((current) =>
                        current ? { ...current, body: event.target.value } : current,
                      )
                    }
                    placeholder="Write a note for this passage…"
                    rows={4}
                    className="w-full resize-y rounded border border-slate-700 bg-slate-950 p-2 text-xs text-slate-200 outline-none focus:border-indigo-500"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSaveAnnotation()}
                      disabled={annotationSaving || !annotationDraft.body.trim()}
                      className="flex-1 rounded border border-indigo-500/50 bg-indigo-600/30 py-1.5 text-xs font-medium text-indigo-100 transition hover:bg-indigo-600/50 disabled:opacity-40"
                    >
                      {annotationSaving ? "Saving…" : "Save note"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAnnotationDraft(null)}
                      className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {annotationError && (
                <p className="rounded border border-rose-800/60 bg-rose-950/30 p-2 text-xs text-rose-200">
                  {annotationError}
                </p>
              )}

              {annotationLoading ? (
                <p className="text-xs text-slate-500">Loading scene notes…</p>
              ) : annotations.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500">
                  No notes on this scene yet.
                </p>
              ) : (
                annotations.map((annotation) => (
                  <div
                    key={annotation.annotation_id}
                    className={`rounded border p-3 ${annotation.status === "resolved" ? "border-slate-800 bg-slate-950/30 opacity-60" : "border-slate-700 bg-slate-800/40"}`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-[10px] uppercase tracking-wider text-indigo-300">
                        {annotation.category}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {annotation.status === "resolved" ? "Resolved" : annotation.anchor_present ? "Open" : "Anchor moved"}
                      </span>
                    </div>
                    <p className="mb-2 font-serif text-xs italic leading-relaxed text-slate-400">
                      “{annotation.quote_text || "Paragraph anchor"}”
                    </p>
                    <p className="text-xs leading-relaxed text-slate-200">{annotation.body}</p>
                    <div className="mt-3 border-t border-slate-700/70 pt-3">
                      <label className="sr-only" htmlFor={`annotation-question-${annotation.annotation_id}`}>
                        Question for AI about this note
                      </label>
                      <input
                        id={`annotation-question-${annotation.annotation_id}`}
                        aria-label={`Question for AI about ${annotation.quote_text || annotation.annotation_id}`}
                        value={annotationAdviceQuestion[annotation.annotation_id] ?? ""}
                        onChange={(event) =>
                          setAnnotationAdviceQuestion((previous) => ({
                            ...previous,
                            [annotation.annotation_id]: event.target.value,
                          }))
                        }
                        placeholder="Ask AI about this note…"
                        className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => void handleAskAnnotation(annotation)}
                        disabled={annotationAdviceLoading === annotation.annotation_id}
                        className="mt-2 rounded border border-indigo-500/50 bg-indigo-600/20 px-2 py-1 text-[10px] font-medium text-indigo-200 hover:bg-indigo-600/40 disabled:opacity-40"
                      >
                        {annotationAdviceLoading === annotation.annotation_id ? "Thinking…" : "Ask AI"}
                      </button>
                      {annotation.ai_advice && (
                        <div className="mt-3 rounded border border-indigo-800/50 bg-indigo-950/20 p-2">
                          <div className="mb-1 text-[10px] uppercase tracking-wider text-indigo-300">
                            AI input
                          </div>
                          <p className="text-xs leading-relaxed text-slate-200">
                            {annotation.ai_advice.response}
                          </p>
                          {annotation.ai_advice.suggestions.length > 0 && (
                            <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-slate-300">
                              {annotation.ai_advice.suggestions.map((suggestion, index) => (
                                <li key={`${annotation.annotation_id}-suggestion-${index}`}>{suggestion}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                    {annotation.status === "open" && (
                      <button
                        type="button"
                        onClick={() => void handleResolveAnnotation(annotation.annotation_id)}
                        className="mt-2 rounded border border-emerald-700/50 px-2 py-1 text-[10px] text-emerald-300 hover:bg-emerald-950/40"
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "personas" && (
            <div className="space-y-3">
              <div className="rounded border border-indigo-800/50 bg-indigo-950/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-indigo-200">Independent persona panel</div>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Separate editorial passes. Results are advisory and never change the manuscript.
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      After a run, analyses are saved to this project and appear below as the scene&apos;s stored profile history.
                    </p>
                  </div>
                  <span className="rounded border border-emerald-800 bg-emerald-950/60 px-2 py-0.5 text-[10px] text-emerald-300">
                    {personaRoster.length} source profiles
                  </span>
                </div>
                <label className="mt-3 block text-[10px] uppercase tracking-wide text-slate-500" htmlFor="persona-panel">
                  Panel
                </label>
                <select
                  id="persona-panel"
                  value={selectedPersonaPanelId}
                  onChange={(event) => setSelectedPersonaPanelId(event.target.value)}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
                >
                  {personaPanels.map((panel) => (
                    <option key={panel.panel_id} value={panel.panel_id}>
                      {panel.name} ({panel.persona_ids.length})
                    </option>
                  ))}
                </select>
                {selectedPersonaPanel && (
                  <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{selectedPersonaPanel.description}</p>
                )}
                <div className="mt-3 rounded border border-slate-700/80 bg-slate-950/60 p-2.5">
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                    Evaluation focus
                  </div>
                  <label className="block text-[10px] text-slate-400" htmlFor="evaluation-scope">
                    Scope
                    <select
                      id="evaluation-scope"
                      value={evaluationScope}
                      onChange={(event) => setEvaluationScope(event.target.value as EvaluationScope)}
                      className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200"
                    >
                      <option value="scene">Entire selected scene</option>
                      <option value="chapter" disabled={selectedScene?.chapter_number === null || selectedScene?.chapter_number === undefined}>
                        Entire chapter ({selectedScene?.chapter_number === 0 ? "Epigraph" : selectedScene?.chapter_number ? `Chapter ${selectedScene.chapter_number}` : "choose a manuscript scene"})
                      </option>
                      <option value="selection">Selected passage in editor</option>
                    </select>
                  </label>
                  <label className="mt-2 block text-[10px] text-slate-400" htmlFor="evaluation-focus">
                    What should this persona examine?
                    <textarea
                      id="evaluation-focus"
                      value={evaluationFocus}
                      onChange={(event) => setEvaluationFocus(event.target.value)}
                      rows={3}
                      placeholder="e.g. Focus on the subtext between the two characters and whether the turn feels earned."
                      className="mt-1 w-full resize-y rounded border border-slate-700 bg-slate-900 p-2 text-xs leading-relaxed text-slate-200 outline-none placeholder:text-slate-600 focus:border-emerald-500"
                    />
                  </label>
                {evaluationScope === "selection" ? (
                    selectedPassage ? (
                      <p className="mt-2 max-h-16 overflow-y-auto rounded border border-emerald-800/60 bg-emerald-950/20 p-2 text-[10px] italic leading-relaxed text-emerald-200">
                        Selected passage: “{selectedPassage.quoteText}”
                      </p>
                    ) : (
                      <p className="mt-2 rounded border border-amber-800/60 bg-amber-950/20 p-2 text-[10px] leading-relaxed text-amber-200">
                        Select text in the manuscript editor first.
                      </p>
                    )
                  ) : evaluationScope === "chapter" ? (
                    <p className="mt-2 rounded border border-indigo-800/60 bg-indigo-950/20 p-2 text-[10px] leading-relaxed text-indigo-200">
                      The complete chapter will be sent, scene by scene, with the active scene marked for orientation. The panel must analyze the chapter as a connected unit rather than recap it.
                    </p>
                  ) : (
                    <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                      Select text in the editor to make it available as a passage target, or leave scope set to the whole scene.
                    </p>
                  )}
                </div>
                {evaluationArchive.length > 0 && (
                  <div className="mt-3 rounded border border-emerald-800/50 bg-emerald-950/10 p-2.5">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <label className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300" htmlFor="saved-evaluation">
                        Saved evaluations
                      </label>
                      <span className="text-[10px] text-slate-500">{evaluationArchive.length} stored</span>
                    </div>
                    <select
                      id="saved-evaluation"
                      defaultValue=""
                      onChange={(event) => {
                        const result = evaluationArchive.find((item) => item.evaluation_id === event.target.value);
                        if (result) setEvaluationDocument(result);
                      }}
                      className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-[10px] text-slate-200"
                    >
                      <option value="">Open a saved evaluation…</option>
                      {evaluationArchive.map((result, index) => (
                        <option key={result.evaluation_id ?? `${result.persona_id}-${result.created_at}-${index}`} value={result.evaluation_id ?? ""}>
                          {formatArchiveDate(result.created_at)} · {result.persona_name} · {sceneLabelForNumber(result.scene_number)} · {result.focus_scope === "selection" ? "passage" : result.focus_scope === "chapter" ? `chapter ${result.focus_chapter_number ?? ""}` : "scene"}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[9px] text-slate-500">
                      The archive is project-scoped and survives scene changes and reloads.
                    </p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => void runAllPersonaEvaluations()}
                  disabled={panelRunning || !selectedPersonaPanel || !selectedScene}
                  className="mt-3 w-full rounded border border-indigo-500/40 bg-indigo-600/30 py-2 text-xs font-medium text-indigo-100 transition hover:bg-indigo-600/50 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                >
                  {panelRunning
                    ? "Running independent panel…"
                    : `Run ${selectedPersonaPanel?.name ?? "panel"}`}
                </button>
                {panelRunning && (
                  <p className="mt-2 text-center text-[10px] text-indigo-300">
                    Sending separate requests to each simulator. This can take a little while.
                  </p>
                )}
                <div className="mt-3 flex items-center justify-between gap-2">
                  <label className="text-[10px] uppercase tracking-wide text-slate-500" htmlFor="persona-category">
                    Browse profiles
                  </label>
                  <select
                    id="persona-category"
                    value={personaCategoryFilter}
                    onChange={(event) => setPersonaCategoryFilter(event.target.value)}
                    className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] text-slate-300"
                  >
                    <option value="all">All ({personaRoster.length})</option>
                    <option value="beta_reader">Beta reader avatars ({personaRoster.filter((persona) => persona.category === "beta_reader").length})</option>
                    <option value="literary_agent">Literary agents ({personaRoster.filter((persona) => persona.category === "literary_agent").length})</option>
                    <option value="prestige_editor">Prestige editors ({personaRoster.filter((persona) => persona.category === "prestige_editor").length})</option>
                    <option value="craft_agent">Craft agents ({personaRoster.filter((persona) => persona.category === "craft_agent").length})</option>
                    <option value="specialist">Specialists ({personaRoster.filter((persona) => persona.category === "specialist").length})</option>
                    <option value="author_agent">Author agents ({personaRoster.filter((persona) => persona.category === "author_agent").length})</option>
                    <option value="author_profile">Author profile lenses ({personaRoster.filter((persona) => persona.category === "author_profile").length})</option>
                  </select>
                </div>
                {analysisConversationArchive.length > 0 && (
                  <div className="mt-3 rounded border border-emerald-800/50 bg-emerald-950/10 p-2.5">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <label className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300" htmlFor="saved-analysis-thread">
                        Saved agent conversations
                      </label>
                      <span className="text-[10px] text-slate-500">{analysisConversationArchive.length} stored</span>
                    </div>
                    <select
                      id="saved-analysis-thread"
                      defaultValue=""
                      onChange={(event) => {
                        const summary = analysisConversationArchive.find((item) => item.conversation_id === event.target.value);
                        if (summary) void loadAnalysisConversation(summary.agent_id);
                      }}
                      className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-[10px] text-slate-200"
                    >
                      <option value="">Open a saved analysis conversation…</option>
                      {analysisConversationArchive.map((summary) => (
                        <option key={summary.conversation_id} value={summary.conversation_id}>
                          {formatArchiveDate(summary.updated_at)} · {personaNameForId(summary.agent_id)} · {summary.last_context_label ?? "current screen"} · {summary.message_count} messages
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[9px] text-slate-500">
                      Select one to load the full read-only transcript below its agent card.
                    </p>
                  </div>
                )}
                {panelError && (
                  <p className="mt-2 rounded border border-amber-800/60 bg-amber-950/30 p-2 text-xs text-amber-200">
                    {panelError}
                  </p>
                )}
                {evaluationError && (
                  <p className="mt-2 rounded border border-rose-800/60 bg-rose-950/30 p-2 text-xs text-rose-200">
                    {evaluationError}
                  </p>
                )}
              </div>

              {visiblePersonas.map((persona) => {
                const result = personaResults[persona.persona_id];
                return (
                  <div key={persona.persona_id} className="rounded border border-slate-700/60 bg-slate-800/40 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-indigo-200">{persona.name}</div>
                        <div className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-500">
                          {persona.category.replaceAll("_", " ")} · {persona.title_or_archetype}
                        </div>
                      </div>
                      {result && (
                        <span className="rounded bg-slate-950 px-1.5 py-0.5 text-[10px] text-emerald-300">
                          {result.verdict}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-slate-300">{persona.taste_summary}</p>
                    <div className="mt-2 text-[10px] text-slate-500">Focus: {persona.focus}</div>
                    <button
                      type="button"
                      onClick={() => void runPersonaEvaluation(persona.persona_id)}
                      disabled={loadingEval || panelRunning || !selectedScene}
                      className="mt-3 w-full rounded border border-slate-600 bg-slate-900/80 py-1.5 text-[11px] text-slate-200 transition hover:border-indigo-500 hover:text-indigo-200 disabled:cursor-not-allowed disabled:text-slate-600"
                    >
                      {evaluatingPersonaId === persona.persona_id ? "Running…" : "Run this simulator"}
                    </button>
                    <button
                      type="button"
                      onClick={() => analysisConversationPersonaId === persona.persona_id
                        ? setAnalysisConversationPersonaId(null)
                        : void loadAnalysisConversation(persona.persona_id)}
                      className="mt-2 w-full rounded border border-emerald-700/50 bg-emerald-950/20 py-1.5 text-[11px] text-emerald-200 transition hover:border-emerald-500 hover:bg-emerald-900/30"
                    >
                      {analysisConversationPersonaId === persona.persona_id
                        ? "Close persistent analysis thread"
                        : "Open persistent analysis thread"}
                    </button>
                    {result && (
                      <div className="mt-3 border-t border-slate-700/60 pt-2">
                        <p className="text-[11px] leading-relaxed text-slate-300">{result.executive_reaction}</p>
                        <div className="mt-2 flex justify-between text-[10px] text-slate-500">
                          <span>{result.provider ?? "provider unavailable"}</span>
                          <span>{result.independent ? "independent pass" : "legacy pass"}</span>
                        </div>
                      </div>
                    )}
                    {analysisConversationPersonaId === persona.persona_id && (
                      <div className="mt-3 border-t border-emerald-800/50 pt-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                            Saved analysis conversation
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {analysisConversationMessages.length} messages
                          </span>
                        </div>
                        {analysisConversationLoading ? (
                          <p className="text-[10px] text-slate-500">Loading this agent&apos;s thread…</p>
                        ) : (
                          <div className="max-h-52 space-y-2 overflow-y-auto rounded border border-slate-800 bg-slate-950/60 p-2">
                            {analysisConversationMessages.length === 0 ? (
                              <p className="text-[10px] leading-relaxed text-slate-500">
                                Ask a follow-up about the current scene or the evaluation focus. This thread is saved separately for this agent.
                              </p>
                            ) : (
                              analysisConversationMessages.map((message, index) => (
                                <div key={message.message_id ?? `${persona.persona_id}-analysis-${index}`} className={message.role === "user" ? "text-right" : "text-left"}>
                                  <div className={`inline-block max-w-[95%] rounded p-2 text-[11px] leading-relaxed ${message.role === "user" ? "bg-indigo-900/60 text-indigo-100" : "bg-slate-900 text-slate-200"}`}>
                                    {message.content}
                                  </div>
                                  {message.context_label && (
                                    <div className="mt-0.5 text-[9px] text-emerald-400/70">{message.context_label}</div>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        )}
                        {analysisConversationError && (
                          <p className="mt-2 rounded border border-rose-800/60 bg-rose-950/30 p-2 text-[10px] text-rose-200">
                            {analysisConversationError}
                          </p>
                        )}
                        <textarea
                          aria-label={`Follow-up for ${persona.name}`}
                          value={analysisConversationInput}
                          onChange={(event) => setAnalysisConversationInput(event.target.value)}
                          placeholder="Ask this agent a follow-up…"
                          rows={3}
                          className="mt-2 w-full resize-y rounded border border-slate-700 bg-slate-950 p-2 text-[11px] leading-relaxed text-slate-200 outline-none placeholder:text-slate-600 focus:border-emerald-500"
                        />
                        <button
                          type="button"
                          onClick={() => void sendAnalysisConversationMessage()}
                          disabled={analysisConversationSending || !analysisConversationInput.trim() || !selectedScene}
                          className="mt-2 rounded border border-emerald-500/50 bg-emerald-600/20 px-2 py-1 text-[10px] font-medium text-emerald-100 transition hover:bg-emerald-600/40 disabled:opacity-40"
                        >
                          {analysisConversationSending ? "Thinking…" : "Ask this agent"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {visiblePersonas.length === 0 && !panelError && (
                <div className="py-8 text-center text-xs text-slate-500">Loading persona roster…</div>
              )}
            </div>
          )}

          {activeTab === "governance" && (
            <div className="space-y-3">
              <div className="rounded border border-indigo-700/50 bg-indigo-950/20 p-3">
                <p className="text-xs font-semibold text-indigo-200">Saved editor changes</p>
                <p className="mt-1 text-[10px] leading-relaxed text-indigo-100/70">
                  Compare the latest Studio autosaves with their preserved intake baseline or exact Markdown source, then stage safe differences here for review.
                </p>
                {manualChangeCount > 0 && (
                  <p className="mt-2 rounded border border-amber-700/60 bg-amber-950/30 p-2 text-[10px] leading-relaxed text-amber-100">
                    {manualChangeCount} saved editor change{manualChangeCount === 1 ? " is" : "s are"} ready to prepare. Autosaves stay here until you explicitly prepare them.
                  </p>
                )}
                {manualChangeCount === 0 && (manualChangeSummary?.blocked_count ?? 0) > 0 && (
                  <p className="mt-2 rounded border border-amber-700/60 bg-amber-950/30 p-2 text-[10px] leading-relaxed text-amber-100">
                    No canonical Git changes are ready. {manualChangeSummary?.studio_only_count === 1 ? "1 saved edit is" : `${manualChangeSummary?.studio_only_count ?? 0} saved edits are`} from scratch or intake-only material, and {manualChangeSummary?.blocked_count === 1 ? "1 item is" : `${manualChangeSummary?.blocked_count ?? 0} items are`} blocked until their source boundaries are reviewed.
                  </p>
                )}
                <button
                  type="button"
                  disabled={manualSyncBusy}
                  onClick={() => void prepareManualChanges()}
                  className="mt-2 rounded border border-indigo-500/50 bg-indigo-600/30 px-2 py-1 text-[10px] font-medium text-indigo-100 transition hover:bg-indigo-600/50 disabled:opacity-50"
                >
                  {manualSyncBusy ? "Preparing diff…" : "Prepare saved editor changes"}
                </button>
                <button
                  type="button"
                  disabled={deskPushBusy}
                  onClick={() => void pushSavedDeskToGit()}
                  className="mt-2 ml-2 rounded border border-emerald-500/50 bg-emerald-600/30 px-2 py-1 text-[10px] font-medium text-emerald-100 transition hover:bg-emerald-600/50 disabled:opacity-50"
                >
                  {deskPushBusy ? "Pushing desk…" : "Push full desk to Git"}
                </button>
                <button
                  type="button"
                  disabled={deskPushBusy || !activeProjectId}
                  onClick={() => void pushSavedDeskToGit(true)}
                  className="mt-2 ml-2 rounded border border-amber-500/60 bg-amber-700/30 px-2 py-1 text-[10px] font-medium text-amber-100 transition hover:bg-amber-700/50 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Explicitly override the dirty-worktree guard; only files changed by the saved desk are committed"
                >
                  {deskPushBusy ? "Pushing desk…" : "Override dirty-tree guard"}
                </button>
                <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
                  The override is explicit: it commits only files changed by the saved desk. Unrelated dirty files remain untouched; same-file unrelated edits are included and require review. Suspected whole-scene erasures stay blocked for review.
                </p>
              </div>
              {governanceError && (
                <p className="rounded border border-rose-800/60 bg-rose-950/30 p-2 text-xs text-rose-200">
                  {governanceError}
                </p>
              )}
              {governanceNotice && (
                <p className="rounded border border-emerald-800/60 bg-emerald-950/30 p-2 text-xs text-emerald-200">
                  {governanceNotice}
                </p>
              )}
              {pendingCommitBatches.length > 0 && (
                <div className="rounded border border-amber-700/60 bg-amber-950/30 p-3">
                  <p className="text-xs font-semibold text-amber-200">
                    {pendingCommitBatches.length} approved batch{pendingCommitBatches.length === 1 ? "" : "es"} waiting for a branch decision.
                  </p>
                  <p className="mt-1 text-[10px] leading-relaxed text-amber-100/70">
                    The approved source edits are written safely but not committed yet.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setCommitPromptReason("leave");
                      setCommitPromptTarget(null);
                      setCommitPromptOpen(true);
                    }}
                    className="mt-2 rounded border border-amber-500/50 bg-amber-600/30 px-2 py-1 text-[10px] font-medium text-amber-100 transition hover:bg-amber-600/50"
                  >
                    Open branch handoff
                  </button>
                </div>
              )}
              {failedCommitBatches.length > 0 && (
                <div className="rounded border border-rose-800/60 bg-rose-950/20 p-3">
                  <p className="text-xs font-semibold text-rose-200">
                    {failedCommitBatches.length} historical commit failure{failedCommitBatches.length === 1 ? "" : "s"} needs review.
                  </p>
                  <p className="mt-1 text-[10px] leading-relaxed text-rose-100/75">
                    This does not mean the manuscript worktree is currently dirty and it no longer blocks leaving the desk. Re-prepare the affected saved change after reviewing the source file.
                  </p>
                  {failedCommitBatches.map((batch) => (
                    <div key={batch.batch_id} className="mt-2 rounded border border-rose-900/60 bg-slate-950/40 p-2 text-[10px] text-slate-300">
                      <div className="font-mono text-rose-200">{batch.files.join(", ")}</div>
                      {batch.commit_error?.message && <div className="mt-1 text-slate-400">{batch.commit_error.message}</div>}
                      <button
                        type="button"
                        disabled={Boolean(reconcilingBatchId)}
                        onClick={() => void reconcileFailedCommit(batch.batch_id)}
                        className="mt-2 rounded border border-rose-500/50 bg-rose-700/25 px-2 py-1 text-[10px] font-medium text-rose-100 transition hover:bg-rose-700/45 disabled:cursor-wait disabled:opacity-50"
                        title="Verify the exact approved replacement is already in the clean source and archive this stale failure record"
                      >
                        {reconcilingBatchId === batch.batch_id ? "Verifying source…" : "Reconcile if already committed"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {proposals.length > 0 ? (
                proposals.map((proposal) => (
                  <div
                    key={proposal.proposal_id}
                    className="p-3 rounded bg-amber-950/20 border border-amber-800/30"
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-semibold text-amber-300 capitalize">
                        {proposal.change_type.replaceAll("_", " ")}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] bg-amber-900/50 text-amber-200 px-1.5 py-0.5 rounded">
                          Staged by {proposal.proposed_by_name}
                        </span>
                        <button
                          type="button"
                          onClick={() => editingProposalId === proposal.proposal_id
                            ? cancelProposalEdit(proposal.proposal_id)
                            : beginProposalEdit(proposal)}
                          className="rounded border border-indigo-500/40 px-1.5 py-0.5 text-[10px] text-indigo-200 transition hover:bg-indigo-900/40"
                        >
                          {editingProposalId === proposal.proposal_id ? "Cancel edit" : "Edit"}
                        </button>
                      </div>
                    </div>
                    <p className="mb-1 text-[10px] text-slate-500">
                      {(() => {
                        const proposalScene = scenes.find(
                          (scene) => scene.scene_number === proposal.scene_number,
                        );
                        if (proposalScene?.chapter_number !== null && proposalScene?.chapter_number !== undefined && proposalScene.scene_number_in_chapter !== null && proposalScene.scene_number_in_chapter !== undefined) {
                          return `Chapter ${proposalScene.chapter_number} · Scene ${proposalScene.scene_number_in_chapter} (global ${proposal.scene_number})`;
                        }
                        return `Scene ${proposal.scene_number}`;
                      })()}
                      {proposal.validation?.source_path ? ` · ${proposal.validation.source_path}` : ""}
                    </p>
                    {editingProposalId === proposal.proposal_id && proposalDrafts[proposal.proposal_id] ? (
                      <div className="mb-2 space-y-2 rounded border border-indigo-700/50 bg-indigo-950/20 p-2">
                        <label className="block text-[10px] uppercase tracking-wide text-rose-300/80">
                          Original anchor
                          <textarea
                            value={proposalDrafts[proposal.proposal_id].original_verbatim_text}
                            onChange={(event) => updateProposalDraft(proposal.proposal_id, "original_verbatim_text", event.target.value)}
                            rows={4}
                            className="mt-1 w-full resize-y rounded border border-slate-700 bg-slate-950 p-2 text-xs leading-relaxed text-slate-200 outline-none focus:border-indigo-500"
                          />
                        </label>
                        <label className="block text-[10px] uppercase tracking-wide text-emerald-300/80">
                          Replacement text
                          <textarea
                            value={proposalDrafts[proposal.proposal_id].proposed_replacement_text}
                            onChange={(event) => updateProposalDraft(proposal.proposal_id, "proposed_replacement_text", event.target.value)}
                            rows={4}
                            className="mt-1 w-full resize-y rounded border border-slate-700 bg-slate-950 p-2 text-xs leading-relaxed text-slate-200 outline-none focus:border-indigo-500"
                          />
                        </label>
                        <label className="block text-[10px] uppercase tracking-wide text-slate-400">
                          Editorial rationale
                          <textarea
                            value={proposalDrafts[proposal.proposal_id].editorial_rationale}
                            onChange={(event) => updateProposalDraft(proposal.proposal_id, "editorial_rationale", event.target.value)}
                            rows={3}
                            className="mt-1 w-full resize-y rounded border border-slate-700 bg-slate-950 p-2 text-xs leading-relaxed text-slate-200 outline-none focus:border-indigo-500"
                          />
                        </label>
                        <label className="block text-[10px] uppercase tracking-wide text-slate-400">
                          Change type
                          <select
                            value={proposalDrafts[proposal.proposal_id].change_type}
                            onChange={(event) => updateProposalDraft(proposal.proposal_id, "change_type", event.target.value)}
                            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-indigo-500"
                          >
                            <option value="line_edit">Line edit</option>
                            <option value="continuity_fix">Continuity fix</option>
                            <option value="structure">Structure</option>
                            <option value="metadata">Metadata</option>
                            <option value="manual_editor_sync">Manual editor sync</option>
                            <option value="other">Other</option>
                          </select>
                        </label>
                        <p className="text-[10px] leading-relaxed text-indigo-200/80">
                          Approving this version will re-run anchor, formatting, prose-law, source, and staleness checks.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="mb-2 space-y-1 rounded bg-slate-950/50 p-2 text-xs leading-relaxed">
                          <p className="text-rose-300/90 line-through decoration-rose-400/60">
                            <span className="whitespace-pre-wrap">{proposal.original_verbatim_text}</span>
                          </p>
                          <p className="text-emerald-200 whitespace-pre-wrap">{proposal.proposed_replacement_text || "(delete this passage)"}</p>
                        </div>
                        <p className="text-xs text-slate-300 mb-2">
                          {proposal.editorial_rationale}
                        </p>
                      </>
                    )}
                    {proposal.validation && (
                      <p
                        className={`mb-2 text-[10px] ${proposal.validation.writeback?.available ? "text-emerald-400/80" : "text-amber-300"}`}
                      >
                        {proposal.validation.writeback?.available
                          ? `Accepting writes to ${proposal.validation.writeback.path} on ${proposal.source_branch ?? "the pinned branch"}`
                          : "Studio copy only: this change can't be written to the Markdown source"}
                      </p>
                    )}
                    {proposal.validation?.mechanical_review && (
                      <p className="mb-2 text-[10px] text-sky-300/80">
                        Mechanical pass: {proposal.validation.mechanical_review.applied_correction
                          ? (proposal.validation.mechanical_review.changed ? "standard corrections applied before staging" : "checked; no correction needed")
                          : "checked; author text preserved exactly"}
                        {proposal.validation.mechanical_review.issues?.length
                          ? ` · ${proposal.validation.mechanical_review.issues.length} finding${proposal.validation.mechanical_review.issues.length === 1 ? "" : "s"}`
                          : ""}
                      </p>
                    )}
                    {proposal.validation?.warnings?.length ? (
                      <ul className="mb-2 list-disc space-y-0.5 pl-4 text-[10px] text-amber-200/90">
                        {proposal.validation.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    ) : null}
                    {proposal.batch_id && (
                      <p className="mb-2 text-[10px] text-slate-500">
                        Batch {proposal.batch_id.slice(-8)} · baseline {proposal.source_commit_sha?.slice(0, 8) ?? "local"}
                      </p>
                    )}
                    {writebackBlocked[proposal.proposal_id] && (
                      <div className="mb-2 rounded border border-amber-700/60 bg-amber-950/40 p-2 text-[11px] text-amber-100">
                        <p className="mb-1.5">{writebackBlocked[proposal.proposal_id]}</p>
                        <button
                          type="button"
                          disabled={reviewingId === proposal.proposal_id}
                          onClick={() => handleReview(proposal, "accept", false, undefined, true)}
                          className="rounded border border-amber-500/50 bg-amber-600/30 px-2 py-0.5 text-amber-100 transition hover:bg-amber-600/50 disabled:opacity-50"
                        >
                          Apply to dirty Markdown worktree
                        </button>
                        <p className="mt-1.5 text-[10px] text-amber-200/80">
                          Applies only this exact anchored change, preserves other dirty text, and defers commit for review.
                        </p>
                      </div>
                    )}
                    <div className="flex space-x-2">
                      <button
                        type="button"
                        disabled={reviewingId === proposal.proposal_id}
                        onClick={() => handleReview(
                          proposal,
                          "accept",
                          proposal.validation?.writeback?.available === false,
                          proposalDrafts[proposal.proposal_id],
                        )}
                        className="flex-1 py-1 text-xs bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 rounded border border-emerald-500/40 transition font-medium disabled:opacity-50"
                      >
                        {editingProposalId === proposal.proposal_id ? "Approve edited proposal" : "Accept"}
                      </button>
                      <button
                        type="button"
                        disabled={reviewingId === proposal.proposal_id}
                        onClick={() => handleReview(proposal, "reject")}
                        className="flex-1 py-1 text-xs bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 rounded border border-rose-500/40 transition font-medium disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-xs text-slate-500">
                  No pending staged proposals in governance queue.
                </div>
              )}
            </div>
          )}

          {activeTab === "orchestrator" && (
            <div className="space-y-3 text-xs text-slate-300">
              <div className="p-3 rounded bg-slate-800/40 border border-slate-700/50 space-y-2">
                <div className="font-semibold text-slate-200">
                  Session Telemetry (Live API)
                </div>
                {telemetry ? (
                  <>
                    <div className="flex justify-between">
                      <span>Net Change:</span>{" "}
                      <span className="text-emerald-400">
                        {telemetry.net_word_change >= 0 ? "+" : ""}
                        {telemetry.net_word_change} words
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Added / deleted:</span>{" "}
                      <span>
                        {telemetry.words_added} / {telemetry.words_deleted}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Active Plot Tag:</span>{" "}
                      <span className="text-indigo-300">
                        {telemetry.active_plot_tags[0]}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Graph Status:</span>{" "}
                      <span className="text-emerald-400">
                        {telemetry.graph_status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-2 italic">
                      {telemetry.semantic_summary}
                    </p>
                  </>
                ) : (
                  <p className="text-slate-500">
                    Connecting to telemetry daemon...
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTab === "graph" && (
            <div className="space-y-3 pb-4">
              <StoryIntelligenceViewer
                projectId={activeProjectId}
                onSelectScene={handleSceneSelect}
              />
              <StoryGraphViewer projectId={activeProjectId} onSelectScene={handleSceneSelect} />
            </div>
          )}

          {activeTab === "chat" && (
            <div className="h-full pb-4">
              <InterrogationRoom
                projectId={activeProjectId}
                sceneNumber={selectedScene?.scene_number ?? null}
                currentSceneText={sceneContent}
                onProposalsStaged={() => void loadGovernanceProposals()}
              />
            </div>
          )}
        </div>
      </aside>
      )}

      {sourceStatusOpen && sourceStatusProjectId === activeProjectId && (
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="source-status-title"
        >
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-amber-700/60 bg-slate-900 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 p-4">
              <div>
                <h2 id="source-status-title" className="text-sm font-semibold text-slate-100">
                  Source worktree status
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  “Dirty” means these files differ from the last commit in the checkout. It does not mean you are on the wrong branch.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSourceStatusOpen(false)}
                className="px-2 py-1 text-xs text-slate-400 hover:text-slate-100"
              >
                Close
              </button>
            </div>
            {sourceStatusError ? (
              <div className="m-4 rounded border border-rose-800/60 bg-rose-950/30 p-3 text-xs text-rose-200">
                {sourceStatusError}
              </div>
            ) : sourceStatus ? (
              <div className="min-h-0 overflow-y-auto p-4 text-xs">
                <div className="grid gap-2 rounded border border-slate-800 bg-slate-950/50 p-3 sm:grid-cols-2">
                  <div><span className="text-slate-500">Branch:</span> <span className="font-mono text-indigo-200">{sourceStatus.branch ?? "detached"}</span></div>
                  <div><span className="text-slate-500">HEAD:</span> <span className="font-mono text-indigo-200">{sourceStatus.commit_sha?.slice(0, 12) ?? "unknown"}</span></div>
                  <div className="sm:col-span-2"><span className="text-slate-500">Source checkout:</span> <span className="break-all font-mono text-slate-300">{sourceStatus.source_root}</span></div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
                  <span className="rounded border border-amber-800/70 bg-amber-950/40 px-2 py-1 text-amber-200">{sourceStatus.counts.total} dirty file{sourceStatus.counts.total === 1 ? "" : "s"}</span>
                  <span className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-300">{sourceStatus.counts.unstaged} modified</span>
                  <span className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-300">{sourceStatus.counts.staged} staged</span>
                  <span className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-300">{sourceStatus.counts.untracked} untracked</span>
                </div>
                {sourceStatus.files.length === 0 ? (
                  <p className="mt-4 rounded border border-emerald-800/60 bg-emerald-950/30 p-3 text-emerald-200">The checkout is clean.</p>
                ) : (
                  <div className="mt-4 space-y-2">
                    {sourceStatus.files.map((file) => (
                      <div key={`${file.status_code}-${file.path}`} className="rounded border border-slate-800 bg-slate-950/50 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <span className="break-all font-mono text-[11px] leading-relaxed text-slate-200">{file.path}</span>
                          <span className={`shrink-0 rounded border px-2 py-0.5 text-[10px] ${file.untracked ? "border-sky-800/70 bg-sky-950/40 text-sky-200" : file.staged ? "border-amber-800/70 bg-amber-950/40 text-amber-200" : "border-rose-800/70 bg-rose-950/40 text-rose-200"}`}>
                            {file.label}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void viewSourceFile(file)}
                            disabled={sourceDiffLoading}
                            className="rounded border border-indigo-700/60 bg-indigo-950/40 px-2 py-1 text-[10px] text-indigo-200 transition hover:bg-indigo-900/50 disabled:opacity-50"
                          >
                            {sourceDiffLoading ? "Loading…" : file.untracked ? "Inspect file" : "View diff"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void openSourceFileInIde(file)}
                            className="rounded border border-emerald-700/60 bg-emerald-950/40 px-2 py-1 text-[10px] text-emerald-200 transition hover:bg-emerald-900/50"
                          >
                            Open in IDE
                          </button>
                          <button
                            type="button"
                            onClick={() => void copySourceFilePath(file)}
                            className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] text-slate-300 transition hover:bg-slate-800"
                          >
                            Copy path
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-4 text-[10px] leading-relaxed text-slate-500">
                  This panel is read-only. Accepting an exact proposal can write only its anchored change; a pending commit stays deferred when other dirty work is present.
                </p>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-500">Checking the source checkout…</div>
            )}
          </div>
        </div>
      )}

      {sourceDiff && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="source-diff-title"
        >
          <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-indigo-700/60 bg-slate-900 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 p-4">
              <div>
                <h2 id="source-diff-title" className="text-sm font-semibold text-slate-100">
                  {sourceDiff.label === "untracked" ? "Inspect untracked file" : "Source diff"}
                </h2>
                <p className="mt-1 break-all font-mono text-[10px] text-slate-400">{sourceDiff.path}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const file = sourceStatus?.files.find((item) => item.path === sourceDiff.path);
                    if (file) void openSourceFileInIde(file);
                  }}
                  className="rounded border border-emerald-700/60 bg-emerald-950/40 px-2 py-1 text-[10px] text-emerald-200 hover:bg-emerald-900/50"
                >
                  Open in IDE
                </button>
                <button
                  type="button"
                  onClick={() => setSourceDiff(null)}
                  className="px-2 py-1 text-xs text-slate-400 hover:text-slate-100"
                >
                  Close
                </button>
              </div>
            </div>
            <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-[11px] leading-relaxed text-slate-200">{sourceDiff.diff}</pre>
            {sourceDiff.truncated && <p className="border-t border-slate-800 px-4 py-2 text-[10px] text-amber-200">The displayed diff was truncated at 200 KB.</p>}
          </div>
        </div>
      )}

      {compilerError && (
        <div className="fixed bottom-4 right-4 z-[80] max-w-md rounded border border-rose-800/70 bg-rose-950/90 p-3 text-xs text-rose-100 shadow-xl">
          <div className="flex items-start gap-3">
            <span>{compilerError}</span>
            <button type="button" onClick={() => setCompilerError(null)} className="text-rose-300 hover:text-white" aria-label="Dismiss compiler error">
              ×
            </button>
          </div>
        </div>
      )}

      {compilerNotice && (
        <div className="fixed bottom-4 right-4 z-[80] max-w-md rounded border border-emerald-800/70 bg-emerald-950/90 p-3 text-xs text-emerald-100 shadow-xl">
          <div className="flex items-start gap-3">
            <span>{compilerNotice}</span>
            <button type="button" onClick={() => setCompilerNotice(null)} className="text-emerald-300 hover:text-white" aria-label="Dismiss compiler notice">
              ×
            </button>
          </div>
        </div>
      )}

      {previewUrl && (
        <div
          className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="compiler-preview-title"
        >
          <div className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-indigo-700/70 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 p-3">
              <div>
                <h2 id="compiler-preview-title" className="text-sm font-semibold text-slate-100">Formatted manuscript preview</h2>
                <p className="mt-1 text-[10px] text-slate-500">This is the same project-scoped PDF produced by the formatter and download button.</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewUrl(null)}
                className="px-2 py-1 text-xs text-slate-400 hover:text-slate-100"
              >
                Close
              </button>
            </div>
            <iframe
              title="Formatted manuscript PDF preview"
              src={previewUrl}
              className="min-h-0 flex-1 bg-slate-200"
            />
          </div>
        </div>
      )}

      {evaluationDocument && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/85 p-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="saved-evaluation-title"
        >
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-lg border border-emerald-700/60 bg-slate-900 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 p-4">
              <div>
                <h2 id="saved-evaluation-title" className="text-sm font-semibold text-slate-100">
                  Saved evaluation · {evaluationDocument.persona_name}
                </h2>
                <p className="mt-1 text-[10px] text-slate-400">
                  {formatArchiveDate(evaluationDocument.created_at)} · {sceneLabelForNumber(evaluationDocument.scene_number)} · {evaluationDocument.focus_scope === "selection" ? "selected passage" : evaluationDocument.focus_scope === "chapter" ? `entire chapter ${evaluationDocument.focus_chapter_number ?? ""}` : "entire scene"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEvaluationDocument(null)}
                className="px-2 py-1 text-xs text-slate-400 hover:text-slate-100"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 space-y-4 overflow-y-auto p-5 text-xs">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded border border-slate-800 bg-slate-950/50 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Verdict</div>
                  <div className="mt-1 font-semibold text-emerald-200">{evaluationDocument.verdict}</div>
                </div>
                <div className="rounded border border-slate-800 bg-slate-950/50 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Persona role</div>
                  <div className="mt-1 text-slate-200">{evaluationDocument.title_or_archetype ?? evaluationDocument.persona_role ?? "Independent simulator"}</div>
                </div>
              </div>
              <section>
                <h3 className="text-[10px] font-semibold uppercase tracking-wide text-indigo-300">Author focus</h3>
                <p className="mt-1 whitespace-pre-wrap leading-relaxed text-slate-300">{evaluationDocument.focus_instruction || "No additional focus supplied."}</p>
              </section>
              {evaluationDocument.focus_text && (
                <section>
                  <h3 className="text-[10px] font-semibold uppercase tracking-wide text-indigo-300">Exact passage analyzed</h3>
                  <blockquote className="mt-1 whitespace-pre-wrap rounded border border-indigo-800/50 bg-indigo-950/20 p-3 font-serif leading-relaxed text-indigo-100">
                    {evaluationDocument.focus_text}
                  </blockquote>
                </section>
              )}
              <section>
                <h3 className="text-[10px] font-semibold uppercase tracking-wide text-indigo-300">Executive reaction</h3>
                <p className="mt-1 whitespace-pre-wrap leading-relaxed text-slate-200">{evaluationDocument.executive_reaction}</p>
              </section>
              <section>
                <h3 className="text-[10px] font-semibold uppercase tracking-wide text-indigo-300">Margin annotations</h3>
                {evaluationDocument.margin_annotations?.length ? (
                  <div className="mt-2 space-y-2">
                    {evaluationDocument.margin_annotations.map((annotation, index) => (
                      <div key={`${annotation.exact_quote_anchor}-${index}`} className="rounded border border-slate-800 bg-slate-950/50 p-3">
                        <div className="text-[10px] text-amber-200">“{annotation.exact_quote_anchor}” · {annotation.severity}</div>
                        <p className="mt-1 leading-relaxed text-slate-300">{annotation.comment_body}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-slate-500">No margin annotations were recorded.</p>
                )}
              </section>
            </div>
          </div>
        </div>
      )}

      {analysisConversationDocumentOpen && analysisConversationPersonaId && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/85 p-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="saved-analysis-title"
        >
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-lg border border-emerald-700/60 bg-slate-900 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 p-4">
              <div>
                <h2 id="saved-analysis-title" className="text-sm font-semibold text-slate-100">
                  Saved analysis conversation · {personaNameForId(analysisConversationPersonaId)}
                </h2>
                <p className="mt-1 text-[10px] text-slate-400">
                  Project-scoped transcript · {analysisConversationMessages.length} messages · current screen context is retained with each reply
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAnalysisConversationDocumentOpen(false)}
                className="px-2 py-1 text-xs text-slate-400 hover:text-slate-100"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 space-y-3 overflow-y-auto p-5">
              {analysisConversationLoading ? (
                <p className="text-xs text-slate-500">Loading transcript…</p>
              ) : analysisConversationMessages.length === 0 ? (
                <p className="text-xs text-slate-500">No messages have been saved for this agent yet.</p>
              ) : (
                analysisConversationMessages.map((message, index) => (
                  <div key={message.message_id ?? `saved-analysis-${index}`} className={message.role === "user" ? "text-right" : "text-left"}>
                    <div className={`inline-block max-w-[95%] rounded p-3 text-xs leading-relaxed ${message.role === "user" ? "bg-indigo-900/60 text-indigo-100" : "bg-slate-950 text-slate-200"}`}>
                      <div className="mb-1 text-[9px] uppercase tracking-wide text-slate-500">{message.role === "user" ? "You" : personaNameForId(analysisConversationPersonaId)}</div>
                      <div className="whitespace-pre-wrap">{message.content}</div>
                    </div>
                    {message.context_label && <div className="mt-1 text-[9px] text-emerald-400/70">{message.context_label}</div>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {commitPromptOpen && pendingCommitBatches.length > 0 && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 p-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="commit-checkpoint-title"
        >
          <div className="w-full max-w-lg rounded-lg border border-amber-700/60 bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="commit-checkpoint-title" className="text-sm font-semibold text-amber-200">
                  Approval Desk checkpoint
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-300">
                  {commitPromptReason === "reminder"
                    ? "These approved changes have been waiting for 10 minutes. Do you want to commit them now?"
                    : "Approved source changes are ready. Commit them to the pinned current branch before leaving the desk?"}
                </p>
              </div>
              <span className="rounded border border-amber-800/60 bg-amber-950/40 px-2 py-1 text-[10px] text-amber-300">
                Author decision
              </span>
            </div>
            <div className="mt-4 space-y-2 rounded border border-slate-800 bg-slate-950/50 p-3">
              {pendingCommitBatches.map((batch) => (
                <div key={batch.batch_id} className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-slate-300">
                    {batch.proposal_count} approved {batch.proposal_count === 1 ? "edit" : "edits"} · {batch.files.length} {batch.files.length === 1 ? "file" : "files"}
                  </span>
                  <span className="font-mono text-[10px] text-indigo-300">{batch.branch ?? "current branch"}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
              This creates the governed Git commit on the verified branch. It does not silently merge or publish anything.
            </p>
            {governanceError && (
              <p className="mt-3 rounded border border-rose-800/60 bg-rose-950/30 p-2 text-xs text-rose-200">
                {governanceError}
              </p>
            )}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={commitBusy}
                onClick={() => void handleCommitPending()}
                className="flex-1 rounded border border-emerald-500/50 bg-emerald-600/30 px-3 py-2 text-xs font-medium text-emerald-100 transition hover:bg-emerald-600/50 disabled:cursor-wait disabled:opacity-50"
              >
                {commitBusy ? "Committing…" : "Push to current branch"}
              </button>
              <button
                type="button"
                disabled={commitBusy}
                onClick={() => void handleCommitPending(true)}
                className="flex-1 rounded border border-amber-500/60 bg-amber-700/30 px-3 py-2 text-xs font-medium text-amber-100 transition hover:bg-amber-700/50 disabled:cursor-wait disabled:opacity-50"
                title="Commit the approved batch even when its source file was already dirty"
              >
                {commitBusy ? "Committing…" : "Override dirty guard"}
              </button>
              <button
                type="button"
                disabled={commitBusy}
                onClick={handleWaitForCommit}
                className="flex-1 rounded border border-slate-600 bg-slate-800/70 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
              >
                Wait 10 minutes
              </button>
            </div>
          </div>
        </div>
      )}

      {historyOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="history-title"
        >
          <div className="w-full max-w-4xl max-h-[85vh] rounded-lg border border-slate-700 bg-slate-900 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <div>
                <h2 id="history-title" className="text-sm font-semibold text-slate-100">
                  Scene history · {selectedSceneLabel}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Persisted snapshots from the local studio store. Read-only for now.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="px-2 py-1 text-xs text-slate-400 hover:text-slate-100"
                aria-label="Close scene history"
              >
                Close
              </button>
            </div>

            {historyError && (
              <div className="m-4 rounded border border-rose-800/60 bg-rose-950/30 p-3 text-xs text-rose-200">
                {historyError}
              </div>
            )}

            {historyLoading ? (
              <div className="p-8 text-center text-xs text-slate-500">Loading revisions…</div>
            ) : history.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">No revisions recorded.</div>
            ) : (
              <div className="grid min-h-0 flex-1 grid-cols--[14rem_1fr] divide-x divide-slate-800">
                <div className="overflow-y-auto p-3 space-y-2">
                  {history.map((revision) => (
                    <button
                      type="button"
                      key={revision.revision_id}
                      onClick={() => setSelectedRevision(revision)}
                      className={`w-full text-left rounded border p-3 transition ${selectedRevision?.revision_id === revision.revision_id ? "border-indigo-500 bg-indigo-950/40" : "border-slate-800 bg-slate-950/40 hover:bg-slate-800/60"}`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-200">v{revision.version}</span>
                        <span className="text-[10px] uppercase text-indigo-300">{revision.source}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400">{revision.summary}</p>
                      <p className="mt-2 text-[10px] text-slate-600">
                        {new Date(revision.created_at).toLocaleString()}
                      </p>
                    </button>
                  ))}
                </div>
                <div className="overflow-y-auto p-5">
                  {selectedRevision ? (
                    <>
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                            Revision {selectedRevision.version}
                          </h3>
                          <span className="text-[10px] text-slate-500">{selectedRevision.source}</span>
                          <span className="ml-2 text-[10px] text-slate-500">
                            {selectedRevision.is_initial
                              ? "initial snapshot"
                              : `+${selectedRevision.word_delta?.added ?? 0} / −${selectedRevision.word_delta?.deleted ?? 0} words`}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleRestoreRevision(selectedRevision)}
                          disabled={selectedRevision.version === selectedScene?.version}
                          className="rounded border border-amber-700/60 bg-amber-950/40 px-3 py-1 text-xs text-amber-200 transition hover:bg-amber-900/50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {selectedRevision.version === selectedScene?.version
                            ? "Current revision"
                            : "Restore this revision"}
                        </button>
                      </div>
                      {!selectedRevision.is_initial && selectedRevision.changed_lines?.length ? (
                        <div className="mb-4 rounded border border-slate-800 bg-slate-950/70 p-3 font-mono text-xs leading-relaxed">
                          {selectedRevision.changed_lines.map((line, index) => (
                            <div
                              key={`${selectedRevision.revision_id}-${index}`}
                              className={line.startsWith("+ ") ? "bg-emerald-950/50 text-emerald-200" : line.startsWith("- ") ? "bg-rose-950/50 text-rose-200" : "text-slate-500"}
                            >
                              {line}
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <div className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-slate-200">
                        {selectedRevision.content_text}
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-slate-500">Select a revision to preview it.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {contextOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="context-package-title"
        >
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-lg border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 p-4">
              <div>
                <h2 id="context-package-title" className="text-sm font-semibold text-slate-100">
                  Share manuscript context
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Build a read-only package for Claude, AGY, or another LLM from this project’s current text.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setContextOpen(false)}
                className="px-2 py-1 text-xs text-slate-400 hover:text-slate-100"
              >
                Close
              </button>
            </div>

            <div className="min-h-0 space-y-4 overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-slate-400">
                  From chapter
                  <input
                    type="number"
                    min={1}
                    value={contextChapterStart}
                    onChange={(event) => setContextChapterStart(event.target.value)}
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500"
                  />
                </label>
                <label className="text-xs text-slate-400">
                  Through chapter
                  <input
                    type="number"
                    min={1}
                    value={contextChapterEnd}
                    onChange={(event) => setContextChapterEnd(event.target.value)}
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500"
                  />
                </label>
              </div>

              <div className="rounded border border-emerald-800/50 bg-emerald-950/20 p-3">
                <div className="mb-2 text-xs font-semibold text-emerald-200">Include with the manuscript</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {CONTEXT_OPTIONS.map((option) => (
                    <label key={option.value} className="flex cursor-pointer gap-2 rounded border border-slate-800 bg-slate-950/50 p-2 hover:border-emerald-700/60">
                      <input
                        type="checkbox"
                        checked={contextIncludes.includes(option.value)}
                        onChange={(event) =>
                          setContextIncludes((current) =>
                            event.target.checked
                              ? [...current, option.value]
                              : current.filter((value) => value !== option.value),
                          )
                        }
                        className="mt-0.5 accent-emerald-500"
                      />
                      <span>
                        <span className="block text-xs font-medium text-slate-200">{option.label}</span>
                        <span className="block text-[10px] leading-relaxed text-slate-500">{option.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {contextError && (
                <p className="rounded border border-rose-800/60 bg-rose-950/30 p-3 text-xs text-rose-200">
                  {contextError}
                </p>
              )}

              <button
                type="button"
                onClick={() => void handleGenerateContextPackage()}
                disabled={contextGenerating || !activeProjectId}
                className="w-full rounded border border-emerald-500/50 bg-emerald-600/30 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-600/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {contextGenerating ? "Building provenance-pinned package…" : "Build context package"}
              </button>

              {contextPackage && (
                <div className="space-y-3 rounded border border-indigo-800/50 bg-indigo-950/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-indigo-200">
                        Chapters {contextPackage.selected_chapters[0]}–{contextPackage.selected_chapters[contextPackage.selected_chapters.length - 1]} ready
                      </div>
                      <div className="mt-1 text-[10px] text-slate-500">
                        {contextPackage.manifest.branch ?? "project-local"} · {(contextPackage.manifest.commit_sha ?? "no commit").slice(0, 12)} · SHA {contextPackage.package_sha256.slice(0, 12)}
                      </div>
                    </div>
                    <span className={`rounded px-2 py-1 text-[10px] ${contextPackage.manifest.working_tree_dirty ? "bg-amber-950/50 text-amber-200" : "bg-emerald-950/50 text-emerald-200"}`}>
                      {contextPackage.manifest.working_tree_dirty ? "Snapshot includes unsaved Git changes" : "Commit-pinned"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCopyContextPackage()}
                      className="rounded border border-indigo-500/50 bg-indigo-600/30 px-3 py-1.5 text-xs text-indigo-100 hover:bg-indigo-600/50"
                    >
                      {contextCopied ? "Copied to clipboard" : "Copy full prompt"}
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadContextPackage}
                      className="rounded border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
                    >
                      Download Markdown
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleExportContextGoogleDoc()}
                      disabled={contextGoogleExporting}
                      className="rounded border border-emerald-500/50 bg-emerald-600/30 px-3 py-1.5 text-xs text-emerald-100 hover:bg-emerald-600/50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {contextGoogleExporting ? "Preparing Google Doc…" : "Export for Google Docs"}
                    </button>
                  </div>
                  {contextPackage.git_links.length > 0 && (
                    <div className="border-t border-indigo-900/60 pt-3">
                      <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Stable Git links</div>
                      {contextPackage.git_links.map((link) => (
                        <a key={link.url} href={link.url} target="_blank" rel="noreferrer" className="block truncate text-[10px] text-indigo-300 hover:text-indigo-200">
                          {link.label}
                        </a>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] leading-relaxed text-slate-500">
                    The prompt includes the manuscript and selected evidence. The DOCX export can be uploaded to Google Drive and opened with Google Docs; neither action grants write access to the repository.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {newPageOpen && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-slate-950/80 p-4 backdrop-blur-sm sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-page-title"
        >
          <form
            onSubmit={handleCreateNewPage}
            className="mx-auto my-6 flex max-h-[calc(100vh-3rem)] w-full max-w-xl flex-col rounded-lg border border-slate-700 bg-slate-900 shadow-2xl"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-slate-800 p-4">
              <div>
                <h2 id="new-page-title" className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <span className="text-emerald-400">✦</span> New Manuscript File / Blank Page
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Create a blank scratchpad or chapter file. Scratch files stay outside Git; chapter files are linked to the manuscript.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNewPageOpen(false)}
                className="px-2 py-1 text-xs text-slate-400 hover:text-slate-100"
              >
                Close
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              {newPageError && (
                <div className="rounded border border-rose-800/60 bg-rose-950/40 p-2.5 text-xs text-rose-300">
                  {newPageError}
                </div>
              )}

              {/* Mode Selection */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setNewPageType("scratch");
                    if (!newPageTitle.trim() || newPageTitle === "New Scene") {
                      setNewPageTitle("Scratchpad");
                    }
                  }}
                  className={`flex flex-col items-start rounded border p-3 text-left transition ${
                    newPageType === "scratch"
                      ? "border-emerald-500 bg-emerald-950/30 text-emerald-200"
                      : "border-slate-800 bg-slate-950/50 text-slate-400 hover:border-slate-700 hover:text-slate-300"
                  }`}
                >
                  <span className="font-medium text-xs flex items-center gap-1.5">
                    📝 Scratch File / Blank Page
                  </span>
                  <span className="mt-1 text-[11px] text-slate-400">
                    Freeform scratchpad or working draft. Saves to this project&apos;s ignored runtime scratch folder, outside the Git manuscript.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setNewPageType("chapter");
                    if (!newPageTitle.trim() || newPageTitle === "Scratchpad") {
                      setNewPageTitle("New Scene");
                    }
                  }}
                  className={`flex flex-col items-start rounded border p-3 text-left transition ${
                    newPageType === "chapter"
                      ? "border-indigo-500 bg-indigo-950/30 text-indigo-200"
                      : "border-slate-800 bg-slate-950/50 text-slate-400 hover:border-slate-700 hover:text-slate-300"
                  }`}
                >
                  <span className="font-medium text-xs flex items-center gap-1.5">
                    📖 Manuscript Scene
                  </span>
                  <span className="mt-1 text-[11px] text-slate-400">
                    Numbered scene linked to a chapter in the novel.
                  </span>
                </button>
              </div>

              {/* Title Input */}
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-300">
                  {newPageType === "scratch" ? "Scratch File Title" : "Scene Title"}
                </label>
                <input
                  type="text"
                  value={newPageTitle}
                  onChange={(e) => setNewPageTitle(e.target.value)}
                  placeholder={newPageType === "scratch" ? "e.g. Scratchpad, Opening Monologue, Act 3 Ideas" : "e.g. The Observation Deck"}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
                  autoFocus
                />
              </div>

              {/* Chapter Selection if Manuscript Scene */}
              {newPageType === "chapter" && (
                <div className="space-y-3 rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="flex items-center gap-4 text-xs text-slate-300">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="chapterMode"
                        checked={newPageChapterMode === "existing"}
                        onChange={() => setNewPageChapterMode("existing")}
                        className="text-indigo-600 focus:ring-0"
                      />
                      <span>Add to existing chapter</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="chapterMode"
                        checked={newPageChapterMode === "new"}
                        onChange={() => setNewPageChapterMode("new")}
                        className="text-indigo-600 focus:ring-0"
                      />
                      <span>Create new chapter</span>
                    </label>
                  </div>

                  {newPageChapterMode === "existing" ? (
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Select Chapter</label>
                      <select
                        value={newPageChapterNumber}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNewPageChapterNumber(val);
                          const found = existingChapters.find((c) => String(c.number) === val);
                          if (found) setNewPageChapterTitle(found.title);
                        }}
                        className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                      >
                        <option value="">-- Choose a chapter --</option>
                        {existingChapters.map((c) => (
                          <option key={c.number} value={c.number}>
                            Chapter {c.number} — {c.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Chapter #</label>
                        <input
                          type="number"
                          value={newPageChapterNumber}
                          onChange={(e) => setNewPageChapterNumber(e.target.value)}
                          placeholder="e.g. 11"
                          className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-[11px] text-slate-400 mb-1">Chapter Title</label>
                        <input
                          type="text"
                          value={newPageChapterTitle}
                          onChange={(e) => setNewPageChapterTitle(e.target.value)}
                          placeholder="e.g. The Second Horizon"
                          className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Source Path Preview / Customization */}
              <div className="space-y-1">
                <label className="block text-[11px] text-slate-400">
                  Custom Manuscript File Path (Optional)
                </label>
                <input
                  type="text"
                  value={newPageSourcePath}
                  onChange={(e) => setNewPageSourcePath(e.target.value)}
                  placeholder={
                    newPageType === "scratch"
                      ? "scratch/" + (newPageTitle.trim() ? newPageTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-") : "scratchpad") + ".md"
                      : "manuscript/chapter-" + (newPageChapterNumber || "XX") + ".md"
                  }
                  className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 font-mono text-xs text-slate-300 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
                />
                <p className="text-[10px] text-slate-500">
                  Scratch files are always forced into the ignored project-local scratch folder. Chapter files use the linked manuscript checkout.
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-800 p-4 bg-slate-900/50">
              <button
                type="button"
                onClick={() => setNewPageOpen(false)}
                className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={newPageBusy}
                className="rounded border border-emerald-600 bg-emerald-600/30 px-4 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-600/50 disabled:opacity-50 transition"
              >
                {newPageBusy ? "Creating Page…" : "Create & Open Blank Page"}
              </button>
            </div>
          </form>
        </div>
      )}

      {importOpen && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-slate-950/80 p-4 backdrop-blur-sm sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-title"
        >
          <form
            onSubmit={handleImportMaterial}
            className="mx-auto my-4 flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col rounded-lg border border-slate-700 bg-slate-900 shadow-2xl sm:my-6 sm:max-h-[calc(100vh-3rem)]"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-slate-800 p-4">
              <div>
                <h2 id="import-title" className="text-sm font-semibold text-slate-100">
                  Import manuscript material
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Paste a manuscript, or choose the checkout/worktree for the branch you want. Repository imports detect chapter files and their internal scene headings, preserve paragraph layout, and keep Act/Appendix provenance.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setImportOpen(false)}
                className="px-2 py-1 text-xs text-slate-400 hover:text-slate-100"
              >
                Close
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              <div className="rounded border border-indigo-800/50 bg-indigo-950/20 p-3">
                <label className="block text-xs text-indigo-200">
                  Current Git checkout or worktree path
                  <input
                    value={sourceRoot}
                    onChange={(event) => setSourceRoot(event.target.value)}
                    placeholder="/path/to/my-manuscript-repo"
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500"
                  />
                </label>
                <label className="mt-2 block text-xs text-indigo-200">
                  Manuscript subdirectory within checkout (optional)
                  <input
                    value={sourceSubpath}
                    onChange={(event) => setSourceSubpath(event.target.value)}
                    placeholder="fiction_git_system/manuscript_revised_draft"
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500"
                  />
                </label>
                <p className="mt-1 text-[11px] text-slate-500">
                  Reads the active branch and working tree without modifying Git. If supplied, only this subdirectory is imported; the repository root is still used for branch and commit provenance.
                </p>
                <button
                  type="button"
                  onClick={() => void handleSourceSnapshot()}
                  disabled={snapshotting || !sourceRoot.trim() || !activeProjectId}
                  className="mt-2 rounded border border-indigo-600/60 bg-indigo-900/40 px-3 py-1.5 text-xs font-medium text-indigo-200 transition hover:bg-indigo-800/50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {snapshotting ? "Snapshotting branch…" : "Snapshot current branch"}
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
                <label className="text-xs text-slate-400">
                  Material title
                  <input
                    value={importTitle}
                    onChange={(event) => setImportTitle(event.target.value)}
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500"
                  />
                </label>
                <label className="self-end rounded border border-slate-700 bg-slate-800 px-3 py-2 text-center text-xs text-slate-200 transition hover:bg-slate-700">
                  Choose .txt or .md
                  <input
                    type="file"
                    accept=".txt,.md,.markdown,text/plain,text/markdown"
                    onChange={(event) => void handleImportFile(event)}
                    className="hidden"
                  />
                </label>
                <label className="self-end rounded border border-emerald-700/60 bg-emerald-950/30 px-3 py-2 text-center text-xs text-emerald-200 transition hover:bg-emerald-900/40">
                  Choose repository folder
                  <input
                    type="file"
                    multiple
                    accept=".md,.markdown,text/markdown"
                    {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
                    onChange={(event) => void handleRepositoryFolder(event)}
                    className="hidden"
                  />
                </label>
              </div>
              {repositoryFiles.length > 0 && (
                <p className="rounded border border-emerald-800/50 bg-emerald-950/20 p-2 text-xs text-emerald-200">
                  {repositoryFiles.length} Markdown manuscript file{repositoryFiles.length === 1 ? "" : "s"} ready. Files are ordered by Act/Chapter/Appendix path; unrelated core Markdown files are excluded.
                </p>
              )}
              <label className="block text-xs text-slate-400">
                Manuscript text
                <textarea
                  value={importText}
                  onChange={(event) => setImportText(event.target.value)}
                  placeholder={`Chapter 1: Arrival\n\nPaste your prose here…`}
                  rows={14}
                  className="mt-1 w-full resize-y rounded border border-slate-700 bg-slate-950 p-3 font-serif text-sm leading-relaxed text-slate-200 outline-none focus:border-indigo-500"
                />
              </label>
              {repositoryFiles.length === 0 && (
                <label className="block text-xs text-slate-400">
                  Import structure
                  <select
                    value={importSplitMode}
                    onChange={(event) =>
                      setImportSplitMode(event.target.value as "single" | "headings")
                    }
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500"
                  >
                    <option value="single">Keep as one scene (recommended)</option>
                    <option value="headings">Split on explicit Chapter/Scene headings</option>
                  </select>
                  <span className="mt-1 block text-[11px] text-slate-500">
                    Heading mode ignores repeated page-header fragments such as “Title – 11” when they appear as tiny sections.
                  </span>
                </label>
              )}
              <div className="rounded border border-violet-800/50 bg-violet-950/20 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium text-violet-200">AI intake preview</div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Review boundaries and ingestion risks before importing. This does not import or modify anything.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleAnalyzeIntake()}
                    disabled={intakeAnalyzing || (!importText.trim() && repositoryFiles.length === 0)}
                    className="shrink-0 rounded border border-violet-500/50 bg-violet-600/20 px-3 py-1.5 text-xs font-medium text-violet-200 transition hover:bg-violet-600/40 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {intakeAnalyzing ? "Analyzing…" : "Analyze intake"}
                  </button>
                </div>
              {intakeAnalysis && (
                <div className="mt-3 max-h-56 overflow-y-auto rounded border border-violet-800/50 bg-slate-950/60 p-3 whitespace-pre-wrap text-xs leading-relaxed text-slate-300">
                  {intakeAnalysis}
                </div>
              )}
              {intakeAudit && intakeAudit.status !== "none" && (
                <div className="rounded border border-amber-800/50 bg-amber-950/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-medium text-amber-200">Intake oversight</div>
                      <p className="mt-1 text-[11px] text-slate-400">
                        Structural checks and AI story-bible candidates are review data only; no prose was silently changed.
                      </p>
                    </div>
                    <span className={`rounded border px-2 py-1 text-[10px] ${
                      intakeAudit.status === "complete"
                        ? "border-emerald-700/60 bg-emerald-950/40 text-emerald-200"
                        : "border-amber-700/60 bg-amber-950/40 text-amber-200"
                    }`}>
                      {intakeAudit.status === "complete" ? `AI · ${intakeAudit.ai?.provider ?? "local"}` : intakeAudit.status.replaceAll("_", " ")}
                    </span>
                  </div>
                  {intakeAudit.structural_audit && (
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div className="rounded border border-slate-800 bg-slate-950/60 p-2"><div className="text-lg text-slate-100">{intakeAudit.structural_audit.scene_count}</div><div className="text-[10px] text-slate-500">scenes</div></div>
                      <div className="rounded border border-slate-800 bg-slate-950/60 p-2"><div className="text-lg text-slate-100">{intakeAudit.structural_audit.chapter_count}</div><div className="text-[10px] text-slate-500">chapter groups</div></div>
                      <div className="rounded border border-slate-800 bg-slate-950/60 p-2"><div className="text-lg text-slate-100">{intakeAudit.structural_audit.graph.node_count}</div><div className="text-[10px] text-slate-500">graph nodes</div></div>
                      <div className="rounded border border-amber-800/50 bg-amber-950/30 p-2"><div className="text-lg text-amber-200">{intakeAudit.structural_audit.issues.length + (intakeAudit.corrections?.length ?? 0)}</div><div className="text-[10px] text-slate-500">review flags</div></div>
                    </div>
                  )}
                  {(intakeAudit.structural_audit?.issues.length || intakeAudit.corrections?.length) ? (
                    <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
                      {[...(intakeAudit.structural_audit?.issues ?? []), ...(intakeAudit.corrections ?? [])].slice(0, 12).map((item, index) => (
                        <div key={`${item.kind ?? "flag"}-${item.scene_number ?? "all"}-${index}`} className="rounded border border-slate-800 bg-slate-950/50 p-2 text-[11px]">
                          <div className="font-medium text-amber-200">{item.kind ?? "ai review"}{item.scene_number ? ` · scene ${item.scene_number}` : ""}{item.severity ? ` · ${item.severity}` : ""}</div>
                          <div className="mt-1 text-slate-300">{item.evidence ?? "AI identified a review item."}</div>
                          {item.recommendation && <div className="mt-1 text-slate-500">Recommendation: {item.recommendation}</div>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-[11px] text-emerald-200">No structural flags were raised by the intake pass.</p>
                  )}
                  {intakeAudit.story_bible && (
                    <div className="mt-3 flex flex-wrap gap-1 text-[10px] text-slate-400">
                      <span className="rounded border border-slate-700 px-1.5 py-0.5">{intakeAudit.story_bible.characters?.length ?? 0} character candidates</span>
                      <span className="rounded border border-slate-700 px-1.5 py-0.5">{intakeAudit.story_bible.plot_threads?.length ?? 0} plot threads</span>
                      <span className="rounded border border-slate-700 px-1.5 py-0.5">{intakeAudit.story_bible.subplots?.length ?? 0} subplot candidates</span>
                      <span className="rounded border border-slate-700 px-1.5 py-0.5">{intakeAudit.story_bible.key_objects?.length ?? 0} key objects</span>
                    </div>
                  )}
                </div>
              )}
            </div>
              {importError && (
                <p className="rounded border border-rose-800/60 bg-rose-950/30 p-2 text-xs text-rose-200">
                  {importError}
                </p>
              )}
              {importSuccess && (
                <p className="rounded border border-emerald-800/60 bg-emerald-950/30 p-2 text-xs text-emerald-200">
                  {importSuccess}
                </p>
              )}
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-slate-800 p-4">
              <button
                type="button"
                onClick={() => setImportOpen(false)}
                className="rounded border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={importing || (!importText.trim() && repositoryFiles.length === 0)}
                className="rounded bg-indigo-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-900"
              >
                {importing
                  ? "Importing…"
                  : repositoryFiles.length > 0
                    ? "Import repository chapters"
                    : "Import scenes"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
    </div>
  );
}
