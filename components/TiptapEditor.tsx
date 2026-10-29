"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Editor, Extension } from "@tiptap/core";
import CharacterCount from "@tiptap/extension-character-count";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Typography from "@tiptap/extension-typography";
import UniqueID from "@tiptap/extension-unique-id";
import React, { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import semanticStyles from "@/data/semanticStyles.json";

export interface SemanticStyleDefinition {
  id: string;
  label: string;
  kind: "heading" | "paragraph";
  level?: number;
  align?: "left" | "center" | "right";
  italic?: boolean;
  indent?: "1" | "2";
  description: string;
}

const SEMANTIC_STYLES = semanticStyles as SemanticStyleDefinition[];

/**
 * Semantic block styles are deliberately stored as HTML data attributes. The
 * backend converts those attributes to Markdown style directives on write-back,
 * so the editor's hierarchy survives reloads, imports, and formatting.
 */
const SemanticStyleExtension = Extension.create({
  name: "semanticStyle",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          semanticStyle: {
            default: null,
            keepOnSplit: false,
            parseHTML: (element: HTMLElement) => element.getAttribute("data-semantic-style"),
            renderHTML: (attributes: { semanticStyle?: string | null }) =>
              attributes.semanticStyle
                ? { "data-semantic-style": attributes.semanticStyle }
                : {},
          },
          styleLocked: {
            default: false,
            keepOnSplit: false,
            parseHTML: (element: HTMLElement) => element.getAttribute("data-style-locked") === "true",
            renderHTML: (attributes: { styleLocked?: boolean }) =>
              attributes.styleLocked ? { "data-style-locked": "true" } : {},
          },
        },
      },
    ];
  },
});

interface TiptapEditorProps {
  initialContent?: string;
  documentLabel?: string;
  onUpdate?: (content: string, documentJson?: Record<string, unknown>) => void;
  editorSettings?: EditorTypographySettings;
  onEditorSettingsChange?: (settings: EditorTypographySettings) => void;
  onAddAnnotation?: (anchor: AnnotationAnchor | null) => void;
  onSelectionChange?: (selection: AnnotationAnchor | null) => void;
  onParagraphChange?: (paragraphIndex: number | null) => void;
  highlightParagraphIndex?: number | null;
  focusParagraphIndex?: number | null;
  focusRequestId?: number;
}

interface ToolbarButtonProps {
  active?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  preserveSelection?: boolean;
  children: ReactNode;
}

interface TextMatch {
  from: number;
  to: number;
}

export interface AnnotationAnchor {
  paragraphId: string;
  quoteText: string;
}

export interface EditorTypographySettings {
  font_family: "literary-serif" | "palatino" | "system-sans" | "mono";
  font_size: number;
  line_height: number;
  paragraph_spacing: "compact" | "comfortable" | "airy";
  style_overrides?: Record<string, EditorStyleOverride>;
}

export interface EditorStyleOverride {
  font_family?: EditorTypographySettings["font_family"];
  font_size?: number;
  line_height?: number;
  align?: "left" | "center" | "right";
  italic?: boolean;
  font_weight?: 400 | 500 | 600 | 700;
  indent?: "0" | "1" | "2";
  letter_spacing?: number;
  text_transform?: "none" | "uppercase";
}

const DEFAULT_EDITOR_SETTINGS: EditorTypographySettings = {
  font_family: "literary-serif",
  font_size: 18,
  line_height: 1.7,
  paragraph_spacing: "comfortable",
};

const EDITOR_FONT_VALUES: Record<EditorTypographySettings["font_family"], string> = {
  "literary-serif": "Georgia, Cambria, 'Times New Roman', serif",
  palatino: "'Palatino Linotype', 'Book Antiqua', Palatino, serif",
  "system-sans": "Inter, ui-sans-serif, system-ui, sans-serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};

function semanticStyleCss(styleOverrides: Record<string, EditorStyleOverride>): string {
  return Object.entries(styleOverrides)
    .filter(([styleId]) => /^[a-z0-9-]+$/i.test(styleId))
    .map(([styleId, override]) => {
      const declarations: string[] = [];
      if (override.font_family && EDITOR_FONT_VALUES[override.font_family]) {
        declarations.push(`font-family: ${EDITOR_FONT_VALUES[override.font_family]}`);
      }
      if (Number.isFinite(override.font_size)) declarations.push(`font-size: ${Math.max(8, Math.min(72, override.font_size as number))}px`);
      if (Number.isFinite(override.line_height)) declarations.push(`line-height: ${Math.max(0.8, Math.min(3, override.line_height as number))}`);
      if (override.align) declarations.push(`text-align: ${override.align}`);
      if (typeof override.italic === "boolean") declarations.push(`font-style: ${override.italic ? "italic" : "normal"}`);
      if (override.font_weight) declarations.push(`font-weight: ${override.font_weight}`);
      if (override.indent) declarations.push(`margin-left: ${Number(override.indent) * 2}rem`);
      if (Number.isFinite(override.letter_spacing)) declarations.push(`letter-spacing: ${Math.max(-0.1, Math.min(0.5, override.letter_spacing as number))}em`);
      if (override.text_transform) declarations.push(`text-transform: ${override.text_transform}`);
      return declarations.length > 0
        ? `.literary-editor [data-semantic-style="${styleId}"] { ${declarations.join("; ")} }`
        : "";
    })
    .filter(Boolean)
    .join("\n");
}

function styleDraftDefaults(
  style: SemanticStyleDefinition,
  typography: EditorTypographySettings,
): EditorStyleOverride {
  const headingSizes: Record<string, number> = {
    "hero-title": 36,
    title: 28,
    "part-title": 24,
    "chapter-title": 22,
    "scene-title": 18,
  };
  const letterSpacings: Record<string, number> = {
    "hero-title": 0.08,
    "part-title": 0.06,
    "scene-title": 0.04,
  };
  return {
    font_family: typography.font_family,
    font_size: headingSizes[style.id] ?? typography.font_size,
    line_height: typography.line_height,
    align: style.align ?? "left",
    italic: style.italic ?? false,
    font_weight: style.kind === "heading" ? 700 : 400,
    indent: style.indent ?? "0",
    letter_spacing: letterSpacings[style.id] ?? 0,
    text_transform: ["hero-title", "part-title", "scene-title"].includes(style.id) ? "uppercase" : "none",
  };
}

function getAnnotationAnchor(editor: Editor): AnnotationAnchor | null {
  const { from, to } = editor.state.selection;
  const { $from } = editor.state.selection;
  let paragraphId = "";
  let paragraphText = $from.parent.textContent.trim();

  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    const node = $from.node(depth);
    const nodeId = typeof node.attrs?.id === "string" ? node.attrs.id : "";
    if (nodeId) {
      paragraphId = nodeId;
      paragraphText = node.textContent.trim();
      break;
    }
  }

  if (!paragraphId) return null;
  const selectedText = editor.state.doc.textBetween(from, to, " ").trim();
  return {
    paragraphId,
    quoteText: (selectedText || paragraphText).slice(0, 500),
  };
}

function getSelectionAnchor(editor: Editor): AnnotationAnchor | null {
  const { from, to, $from } = editor.state.selection;
  if (from === to) return null;
  let paragraphId = "";
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    const node = $from.node(depth);
    const nodeId = typeof node.attrs?.id === "string" ? node.attrs.id : "";
    if (nodeId) {
      paragraphId = nodeId;
      break;
    }
  }
  const selectedText = editor.state.doc.textBetween(from, to, " ").trim();
  if (!selectedText) return null;
  return { paragraphId, quoteText: selectedText.slice(0, 20000) };
}

function getParagraphIndex(editor: Editor): number | null {
  const { from } = editor.state.selection;
  let paragraphIndex = 0;
  let activeIndex: number | null = null;
  editor.state.doc.descendants((node, offset) => {
    if (node.type.name !== "paragraph") return;
    if (from >= offset && from <= offset + node.nodeSize) {
      activeIndex = paragraphIndex;
    }
    paragraphIndex += 1;
  });
  return activeIndex;
}

function findTextMatches(editor: Editor, query: string): TextMatch[] {
  const normalizedQuery = query.toLocaleLowerCase();
  if (!normalizedQuery) return [];

  const matches: TextMatch[] = [];
  editor.state.doc.descendants((node, position) => {
    if (!node.isText || !node.text) return;
    const text = node.text.toLocaleLowerCase();
    let offset = text.indexOf(normalizedQuery);
    while (offset !== -1) {
      matches.push({
        from: position + offset,
        to: position + offset + query.length,
      });
      offset = text.indexOf(normalizedQuery, offset + normalizedQuery.length);
    }
  });
  return matches;
}

function currentSemanticStyleId(editor: Editor): string {
  const attrs = editor.state.selection.$from.parent.attrs as { semanticStyle?: string | null };
  return attrs.semanticStyle ?? "";
}

function renderMarkdownNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof HTMLElement)) return "";

  const content = Array.from(node.childNodes).map(renderMarkdownNode).join("");
  const tag = node.tagName.toLowerCase();
  const semanticStyle = node.getAttribute("data-semantic-style");
  const locked = node.getAttribute("data-style-locked") === "true" ? " locked" : "";
  const directive = semanticStyle ? `<!-- literary-style: ${semanticStyle}${locked} -->\n` : "";

  if (/^h[1-6]$/.test(tag)) return `${directive}${"#".repeat(Number(tag.slice(1)))} ${content.trim()}\n\n`;
  if (tag === "p") return `${directive}${content.trim()}\n\n`;
  if (tag === "blockquote") return `${directive}${content.trim().split("\n").map((line) => `> ${line}`).join("\n")}\n\n`;
  if (tag === "hr") return "* * *\n\n";
  if (tag === "strong" || tag === "b") return `**${content}**`;
  if (tag === "em" || tag === "i") return `*${content}*`;
  if (tag === "s" || tag === "del") return `~~${content}~~`;
  if (tag === "code") return `\`${content}\``;
  if (tag === "br") return "\n";
  if (tag === "a") return `[${content}](${node.getAttribute("href") ?? ""})`;
  if (tag === "li") return `- ${content.trim()}\n`;
  if (tag === "ul" || tag === "ol") return `${content}\n`;
  return content;
}

function editorMarkdown(editor: Editor): string {
  const parsed = new DOMParser().parseFromString(editor.getHTML(), "text/html");
  return Array.from(parsed.body.childNodes)
    .map(renderMarkdownNode)
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function writeClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const fallback = document.createElement("textarea");
  fallback.value = value;
  fallback.setAttribute("readonly", "true");
  fallback.style.position = "fixed";
  fallback.style.opacity = "0";
  document.body.appendChild(fallback);
  fallback.select();
  const copied = document.execCommand("copy");
  fallback.remove();
  if (!copied) throw new Error("Clipboard access is unavailable in this browser.");
}

function ToolbarButton({
  active = false,
  disabled = false,
  label,
  onClick,
  preserveSelection = false,
  children,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      onMouseDown={preserveSelection ? (event) => event.preventDefault() : undefined}
      disabled={disabled}
      className={`px-2 py-1 rounded border text-xs transition ${
        active
          ? "text-indigo-300 border-indigo-500 bg-indigo-950/60"
          : "text-slate-300 border-slate-800 bg-slate-900 hover:bg-slate-800"
      } disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

export default function TiptapEditor({
  initialContent,
  documentLabel,
  onUpdate,
  editorSettings,
  onEditorSettingsChange,
  onAddAnnotation,
  onSelectionChange,
  onParagraphChange,
  highlightParagraphIndex = null,
  focusParagraphIndex = null,
  focusRequestId = 0,
}: TiptapEditorProps) {
  const typography = { ...DEFAULT_EDITOR_SETTINGS, ...editorSettings };
  const handledFocusRequest = useRef<number | null>(null);
  const [stats, setStats] = useState({ words: 0, characters: 0 });
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  const [semanticMenuOpen, setSemanticMenuOpen] = useState(false);
  const [semanticMenuPoint, setSemanticMenuPoint] = useState<{ x: number; y: number } | null>(null);
  const [selectedSemanticStyle, setSelectedSemanticStyle] = useState("");
  const [styleEditorOpen, setStyleEditorOpen] = useState(false);
  const [styleDraft, setStyleDraft] = useState<EditorStyleOverride | null>(null);
  const [clipboardStatus, setClipboardStatus] = useState<"idle" | "markdown" | "text" | "downloaded">("idle");
  const styleOverrides = typography.style_overrides ?? {};

  const updateStats = (updatedEditor: Editor) => {
    setStats({
      words: updatedEditor.storage.characterCount.words(),
      characters: updatedEditor.storage.characterCount.characters(),
    });
  };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        link: {
          autolink: true,
          linkOnPaste: true,
          openOnClick: false,
        },
        horizontalRule: {
          HTMLAttributes: { class: "scene-break" },
        },
      }),
      CharacterCount,
      Color,
      Highlight.configure({ multicolor: true }),
      Placeholder.configure({
        placeholder: "Begin writing this scene…",
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
        alignments: ["left", "center", "right"],
        defaultAlignment: "left",
      }),
      TextStyle,
      Typography,
      SemanticStyleExtension,
      UniqueID.configure({
        types: ["paragraph", "heading", "blockquote", "listItem"],
      }),
    ],
    content: initialContent ?? "<p></p>",
    editorProps: {
      attributes: {
        class:
          "literary-editor prose prose-invert max-w-none focus:outline-none min-h-[400px] font-serif text-slate-200 leading-relaxed text-lg",
        spellcheck: "true",
      },
    },
    onCreate: ({ editor: createdEditor }) => {
      updateStats(createdEditor);
      setSelectedSemanticStyle(currentSemanticStyleId(createdEditor));
      onParagraphChange?.(getParagraphIndex(createdEditor));
      const normalizedContent = createdEditor.getHTML();
      if (initialContent !== undefined && normalizedContent !== initialContent) {
        onUpdate?.(normalizedContent, createdEditor.getJSON() as Record<string, unknown>);
      }
    },
    onUpdate: ({ editor: updatedEditor }) => {
      updateStats(updatedEditor);
      onUpdate?.(updatedEditor.getHTML(), updatedEditor.getJSON() as Record<string, unknown>);
    },
    onSelectionUpdate: ({ editor: updatedEditor }) => {
      onSelectionChange?.(getSelectionAnchor(updatedEditor));
      onParagraphChange?.(getParagraphIndex(updatedEditor));
      setSelectedSemanticStyle(currentSemanticStyleId(updatedEditor));
    },
  });

  useEffect(() => {
    if (!editor || initialContent === undefined) return;
    if (editor.getHTML() !== initialContent) {
      editor.commands.setContent(initialContent, { emitUpdate: false });
    }
  }, [editor, initialContent]);

  useEffect(() => {
    if (!editor || focusParagraphIndex === null || focusParagraphIndex === undefined || handledFocusRequest.current === focusRequestId) return;
    let paragraphNumber = 0;
    let targetPosition: number | null = null;
    editor.state.doc.descendants((node, position) => {
      if (node.type.name !== "paragraph") return;
      if (paragraphNumber === focusParagraphIndex) targetPosition = position + 1;
      paragraphNumber += 1;
    });
    if (targetPosition !== null) {
      editor.chain().focus().setTextSelection(targetPosition).scrollIntoView().run();
      handledFocusRequest.current = focusRequestId;
    }
  }, [editor, focusParagraphIndex, focusRequestId, initialContent]);

  useLayoutEffect(() => {
    if (!editor) return;
    const applyHighlight = () => {
      const blocks = Array.from(editor.view.dom.querySelectorAll("p"));
      blocks.forEach((block, index) => {
        block.classList.toggle("tether-paragraph-active", index === highlightParagraphIndex);
      });
    };
    applyHighlight();
    const frame = window.requestAnimationFrame(applyHighlight);
    const timeout = window.setTimeout(applyHighlight, 80);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [editor, highlightParagraphIndex, initialContent]);

  const matches = editor ? findTextMatches(editor, searchQuery.trim()) : [];
  const activeMatch = matches.length > 0 ? matches[searchIndex % matches.length] : null;

  useEffect(() => {
    if (!editor || !activeMatch) return;
    editor.chain().focus().setTextSelection(activeMatch).scrollIntoView().run();
  }, [activeMatch, editor]);

  const selectSearchMatch = (direction: 1 | -1) => {
    if (matches.length === 0) return;
    setSearchIndex((current) => (current + direction + matches.length) % matches.length);
  };

  const replaceCurrentMatch = () => {
    if (!editor || !activeMatch) return;
    editor.chain().focus().insertContentAt(activeMatch, replaceText).run();
  };

  const replaceAllMatches = () => {
    if (!editor || matches.length === 0) return;
    editor.chain().focus().run();
    for (const match of [...matches].reverse()) {
      editor.commands.insertContentAt(match, replaceText);
    }
    setSearchIndex(0);
  };

  const clearSemanticStyle = () => {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .setNode("paragraph", { semanticStyle: null, styleLocked: false })
      .setTextAlign("left")
      .unsetItalic()
      .run();
    setSelectedSemanticStyle("");
    setSemanticMenuOpen(false);
    setSemanticMenuPoint(null);
  };

  const applySemanticStyle = (styleId: string) => {
    if (!editor) return;
    if (!styleId || styleId === "normal-prose" || styleId === "narrative") {
      clearSemanticStyle();
      return;
    }
    const style = SEMANTIC_STYLES.find((candidate) => candidate.id === styleId);
    if (!style) return;
    const attributes = {
      semanticStyle: style.id,
      styleLocked: true,
    };
    const chain = editor.chain().focus();
    if (style.kind === "heading") {
      chain.setNode("heading", { level: style.level ?? 2, ...attributes });
    } else {
      chain.setNode("paragraph", attributes);
    }
    if (style.align) chain.setTextAlign(style.align);
    chain.run();
    setSelectedSemanticStyle(style.id);
    setSemanticMenuOpen(false);
    setSemanticMenuPoint(null);
  };

  const openSemanticMenu = (event?: React.MouseEvent) => {
    if (event) {
      event.preventDefault();
      setSemanticMenuPoint({
        x: Math.min(event.clientX, window.innerWidth - 320),
        y: Math.min(event.clientY, window.innerHeight - 420),
      });
    }
    setSemanticMenuOpen(true);
  };

  const selectedStyleDefinition = SEMANTIC_STYLES.find((style) => style.id === selectedSemanticStyle);
  const selectedStyleLabel = selectedSemanticStyle
    ? (selectedStyleDefinition?.label ?? selectedSemanticStyle)
    : "Normal Prose";

  const isBlockSemanticItalic = Boolean(
    selectedStyleDefinition?.italic ||
    [
      "interior-italic-1",
      "interior-italic-2",
      "stage-direction",
      "tempo-marking",
      "location",
      "epigraph",
      "movement",
      "music-formal-1",
      "music-formal-2",
      "scene-secondary",
    ].includes(selectedSemanticStyle)
  );

  const openStyleEditor = () => {
    if (!selectedStyleDefinition) return;
    setStyleDraft({
      ...styleDraftDefaults(selectedStyleDefinition, typography),
      ...(styleOverrides[selectedSemanticStyle] ?? {}),
    });
    setStyleEditorOpen(true);
    setSemanticMenuOpen(false);
    setSemanticMenuPoint(null);
  };

  const saveStyleProjectWide = () => {
    if (!selectedSemanticStyle || !styleDraft) return;
    onEditorSettingsChange?.({
      ...typography,
      style_overrides: {
        ...styleOverrides,
        [selectedSemanticStyle]: styleDraft,
      },
    });
    setStyleEditorOpen(false);
  };

  const resetStyleProjectWide = () => {
    if (!selectedSemanticStyle) return;
    const nextOverrides = { ...styleOverrides };
    delete nextOverrides[selectedSemanticStyle];
    onEditorSettingsChange?.({ ...typography, style_overrides: nextOverrides });
    setStyleEditorOpen(false);
  };

  const copyLiveEditor = async (format: "markdown" | "text") => {
    try {
      const value = format === "markdown"
        ? editorMarkdown(editor as Editor)
        : (editor as Editor).getText({ blockSeparator: "\n\n" });
      await writeClipboard(value);
      setClipboardStatus(format);
      window.setTimeout(() => setClipboardStatus("idle"), 1800);
    } catch (error) {
      console.error(`Failed to copy ${format} editor content:`, error);
      setClipboardStatus("idle");
    }
  };

  const downloadLiveMarkdown = () => {
    const blob = new Blob([editorMarkdown(editor as Editor)], { type: "text/markdown;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(documentLabel || "scene").replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "scene"}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
    setClipboardStatus("downloaded");
    window.setTimeout(() => setClipboardStatus("idle"), 1800);
  };

  if (!editor) {
    return null;
  }

  const styleCss = semanticStyleCss(styleOverrides);

  return (
    <div
      className="relative w-full"
      data-map-focus-paragraph={focusParagraphIndex ?? ""}
      onContextMenu={(event) => {
        if (editor.view.dom.contains(event.target as Node)) openSemanticMenu(event);
      }}
      onKeyDown={(event) => {
        if (semanticMenuOpen && event.key.length === 1) setSemanticMenuOpen(false);
      }}
    >
      {styleCss && <style>{styleCss}</style>}
      <div className="sticky top-0 z-50 -mx-12 mb-6 border-b border-slate-800 bg-slate-950/95 px-12 pt-3 pb-3 font-sans text-xs text-slate-400 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <ToolbarButton label="Undo" onClick={() => editor.chain().focus().undo().run()}>
            ↶
          </ToolbarButton>
          <ToolbarButton label="Redo" onClick={() => editor.chain().focus().redo().run()}>
            ↷
          </ToolbarButton>
          <ToolbarButton
            label="Find and replace"
            active={searchOpen}
            onClick={() => setSearchOpen((open) => !open)}
          >
            Find
          </ToolbarButton>
          <ToolbarButton
            label="Add note to selected paragraph"
            preserveSelection
            onClick={() => onAddAnnotation?.(getAnnotationAnchor(editor))}
          >
            Note
          </ToolbarButton>
          <span
            className="rounded border border-emerald-800/70 bg-emerald-950/40 px-2 py-1 text-[10px] text-emerald-300"
            title="Browser spellcheck is enabled in the manuscript editor"
          >
            Spelling: On
          </span>
          {semanticMenuOpen && !semanticMenuPoint ? (
            <div className="semantic-style-control flex items-center gap-1 rounded border border-indigo-700/70 bg-indigo-950/80 px-1 py-0.5">
              <span className="px-1 text-[10px] uppercase tracking-wide text-indigo-300">Block style</span>
              <select
                aria-label="Choose semantic block style"
                value={selectedSemanticStyle || "normal-prose"}
                onChange={(event) => {
                  const val = event.target.value;
                  if (!val || val === "normal-prose" || val === "narrative") {
                    clearSemanticStyle();
                  } else {
                    applySemanticStyle(val);
                  }
                }}
                onMouseDown={(event) => event.stopPropagation()}
                className="max-w-48 rounded border border-indigo-700 bg-slate-950 px-1.5 py-1 text-xs text-slate-200 outline-none"
              >
                <option value="normal-prose">Normal Prose / Body Text</option>
                <option disabled>──────────</option>
                {SEMANTIC_STYLES.map((style) => (
                  <option key={style.id} value={style.id} title={style.description}>
                    {style.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label="Clear semantic block style"
                title="Reset to Normal Prose"
                onMouseDown={(event) => event.preventDefault()}
                onClick={clearSemanticStyle}
                className="px-1 text-slate-400 hover:text-rose-300"
              >
                ×
              </button>
            </div>
          ) : (
            <button
              type="button"
              aria-label="Open semantic block style menu"
              title="Choose or change the Markdown-backed block hierarchy"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => openSemanticMenu()}
              className="rounded border border-indigo-800 bg-indigo-950/50 px-2 py-1 text-xs text-indigo-200 transition hover:bg-indigo-900/70"
            >
              Style: {selectedStyleLabel} ▾
            </button>
          )}
          <ToolbarButton
            label="Update the selected style"
            disabled={!selectedStyleDefinition}
            onClick={openStyleEditor}
          >
            Update style
          </ToolbarButton>
          <label className="flex items-center gap-1 rounded border border-slate-800 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-400">
            <span className="sr-only">Editor font family</span>
            <select
              aria-label="Editor font family"
              value={typography.font_family}
              onChange={(event) => onEditorSettingsChange?.({ ...typography, font_family: event.target.value as EditorTypographySettings["font_family"] })}
              onMouseDown={(event) => event.stopPropagation()}
              className="max-w-28 bg-transparent text-[10px] text-slate-300 outline-none"
            >
              <option value="literary-serif">Literary serif</option>
              <option value="palatino">Palatino</option>
              <option value="system-sans">System sans</option>
              <option value="mono">Monospace</option>
            </select>
          </label>
          <label className="flex items-center gap-1 rounded border border-slate-800 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-400">
            <span className="sr-only">Editor font size</span>
            <select
              aria-label="Editor font size"
              value={String(typography.font_size)}
              onChange={(event) => onEditorSettingsChange?.({ ...typography, font_size: Number(event.target.value) })}
              onMouseDown={(event) => event.stopPropagation()}
              className="bg-transparent text-[10px] text-slate-300 outline-none"
            >
              {[14, 16, 18, 20, 22, 24, 26].map((size) => <option key={size} value={size}>{size}px</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1 rounded border border-slate-800 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-400">
            <span className="sr-only">Editor paragraph spacing</span>
            <select
              aria-label="Editor paragraph spacing"
              value={typography.paragraph_spacing}
              onChange={(event) => onEditorSettingsChange?.({ ...typography, paragraph_spacing: event.target.value as EditorTypographySettings["paragraph_spacing"] })}
              onMouseDown={(event) => event.stopPropagation()}
              className="max-w-24 bg-transparent text-[10px] text-slate-300 outline-none"
            >
              <option value="compact">Compact</option>
              <option value="comfortable">Comfortable</option>
              <option value="airy">Airy</option>
            </select>
          </label>
          <label className="flex items-center gap-1 rounded border border-slate-800 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-400">
            <span className="sr-only">Editor line spacing</span>
            <select
              aria-label="Editor line spacing"
              value={String(typography.line_height)}
              onChange={(event) => onEditorSettingsChange?.({ ...typography, line_height: Number(event.target.value) })}
              onMouseDown={(event) => event.stopPropagation()}
              className="bg-transparent text-[10px] text-slate-300 outline-none"
            >
              {[1.4, 1.6, 1.7, 1.8, 2].map((spacing) => (
                <option key={spacing} value={spacing}>{spacing}× line</option>
              ))}
            </select>
          </label>
          <span className="mx-1 h-5 w-px bg-slate-800" />
          <ToolbarButton label="Copy live editor as Markdown" onClick={() => void copyLiveEditor("markdown")}>
            {clipboardStatus === "markdown" ? "Copied MD" : "Copy MD"}
          </ToolbarButton>
          <ToolbarButton label="Copy live editor as plain text" onClick={() => void copyLiveEditor("text")}>
            {clipboardStatus === "text" ? "Copied text" : "Copy text"}
          </ToolbarButton>
          <ToolbarButton label="Download a disposable Markdown copy" onClick={downloadLiveMarkdown}>
            {clipboardStatus === "downloaded" ? "Saved .md" : "Save .md"}
          </ToolbarButton>
          <span className="mx-1 h-5 w-px bg-slate-800" />
          <ToolbarButton
            label="Bold"
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            B
          </ToolbarButton>
          <ToolbarButton
            label="Italic"
            active={editor.isActive("italic") || isBlockSemanticItalic}
            onClick={() => {
              if (isBlockSemanticItalic) {
                // If block is styled with an italic semantic style, clear semantic style AND strip italic mark
                editor
                  .chain()
                  .focus()
                  .setNode("paragraph", { semanticStyle: null, styleLocked: false })
                  .unsetItalic()
                  .run();
                setSelectedSemanticStyle("");
              } else if (editor.isActive("italic")) {
                editor.chain().focus().unsetItalic().run();
              } else {
                editor.chain().focus().setItalic().run();
              }
            }}
          >
            <em>I</em>
          </ToolbarButton>
          <ToolbarButton
            label="Underline"
            active={editor.isActive("underline")}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <u>U</u>
          </ToolbarButton>
          <ToolbarButton
            label="Strikethrough"
            active={editor.isActive("strike")}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <s>S</s>
          </ToolbarButton>
          <ToolbarButton
            label="Highlight"
            active={editor.isActive("highlight")}
            onClick={() => editor.chain().focus().toggleHighlight({ color: "#facc15" }).run()}
          >
            <span className="bg-yellow-300 px-0.5 text-slate-950">H</span>
          </ToolbarButton>
          <span className="mx-1 h-5 w-px bg-slate-800" />
          <ToolbarButton
            label="Heading 2"
            active={editor.isActive("heading", { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            H2
          </ToolbarButton>
          <ToolbarButton
            label="Heading 3"
            active={editor.isActive("heading", { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          >
            H3
          </ToolbarButton>
          <ToolbarButton
            label="Block quote"
            active={editor.isActive("blockquote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            “
          </ToolbarButton>
          <ToolbarButton
            label="Bulleted list"
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            • List
          </ToolbarButton>
          <ToolbarButton
            label="Numbered list"
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            1. List
          </ToolbarButton>
          <ToolbarButton
            label="Insert line break"
            onClick={() => editor.chain().focus().setHardBreak().run()}
          >
            ↵
          </ToolbarButton>
          <ToolbarButton
            label="Insert scene break"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
          >
            * * *
          </ToolbarButton>
          <span className="mx-1 h-5 w-px bg-slate-800" />
          <ToolbarButton
            label="Align left"
            active={editor.isActive({ textAlign: "left" })}
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
          >
            ←
          </ToolbarButton>
          <ToolbarButton
            label="Align center"
            active={editor.isActive({ textAlign: "center" })}
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
          >
            ↔
          </ToolbarButton>
          <ToolbarButton
            label="Add or edit link"
            active={editor.isActive("link")}
            onClick={() => {
              const previousUrl = editor.getAttributes("link").href as string | undefined;
              const url = window.prompt("Link URL", previousUrl ?? "https://");
              if (url === null) return;
              if (url.trim() === "") {
                editor.chain().focus().unsetLink().run();
              } else {
                editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
              }
            }}
          >
            Link
          </ToolbarButton>
          <ToolbarButton
            label="Remove formatting"
            onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
          >
            Clear
          </ToolbarButton>
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-500">
          <span>Rich text manuscript editor</span>
          <span>{stats.words.toLocaleString()} words · {stats.characters.toLocaleString()} characters</span>
        </div>
        {searchOpen && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded border border-slate-800 bg-slate-950/70 p-2 text-xs">
            <input
              aria-label="Find text"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setSearchIndex(0);
              }}
              placeholder="Find…"
              className="min-w-32 flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 outline-none focus:border-indigo-500"
            />
            <span className="min-w-12 text-center text-[10px] text-slate-500">
              {matches.length > 0 ? `${(searchIndex % matches.length) + 1}/${matches.length}` : "0 matches"}
            </span>
            <ToolbarButton label="Previous match" disabled={matches.length === 0} onClick={() => selectSearchMatch(-1)}>
              ↑
            </ToolbarButton>
            <ToolbarButton label="Next match" disabled={matches.length === 0} onClick={() => selectSearchMatch(1)}>
              ↓
            </ToolbarButton>
            <input
              aria-label="Replace with"
              value={replaceText}
              onChange={(event) => setReplaceText(event.target.value)}
              placeholder="Replace with…"
              className="min-w-32 flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 outline-none focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={replaceCurrentMatch}
              disabled={!activeMatch}
              className="rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-800 disabled:opacity-40"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={replaceAllMatches}
              disabled={matches.length === 0}
              className="rounded border border-indigo-700 px-2 py-1 text-[10px] text-indigo-300 hover:bg-indigo-950 disabled:opacity-40"
            >
              Replace all
            </button>
          </div>
        )}
        {styleEditorOpen && styleDraft && selectedStyleDefinition && (
          <div className="mt-3 rounded border border-indigo-700/60 bg-indigo-950/40 p-3 text-[10px] text-slate-300">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold uppercase tracking-wider text-indigo-200">Update style · {selectedStyleDefinition.label}</div>
                <div className="mt-0.5 text-slate-500">Changes apply to every block using this style in the active project.</div>
              </div>
              <button type="button" onClick={() => setStyleEditorOpen(false)} className="text-slate-500 hover:text-slate-200" aria-label="Close style editor">×</button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="flex flex-col gap-1">
                <span>Font</span>
                <select
                  aria-label="Style font family"
                  value={styleDraft.font_family}
                  onChange={(event) => setStyleDraft((current) => current ? { ...current, font_family: event.target.value as EditorTypographySettings["font_family"] } : current)}
                  className="rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-200"
                >
                  <option value="literary-serif">Literary serif</option>
                  <option value="palatino">Palatino</option>
                  <option value="system-sans">System sans</option>
                  <option value="mono">Monospace</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span>Size</span>
                <select
                  aria-label="Style font size"
                  value={String(styleDraft.font_size)}
                  onChange={(event) => setStyleDraft((current) => current ? { ...current, font_size: Number(event.target.value) } : current)}
                  className="rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-200"
                >
                  {[10, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 42, 48].map((size) => <option key={size} value={size}>{size}px</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span>Line spacing</span>
                <select
                  aria-label="Style line spacing"
                  value={String(styleDraft.line_height)}
                  onChange={(event) => setStyleDraft((current) => current ? { ...current, line_height: Number(event.target.value) } : current)}
                  className="rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-200"
                >
                  {[1, 1.2, 1.4, 1.6, 1.7, 1.8, 2, 2.2, 2.4].map((spacing) => <option key={spacing} value={spacing}>{spacing}×</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span>Align</span>
                <select
                  aria-label="Style alignment"
                  value={styleDraft.align}
                  onChange={(event) => setStyleDraft((current) => current ? { ...current, align: event.target.value as EditorStyleOverride["align"] } : current)}
                  className="rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-200"
                >
                  <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span>Weight</span>
                <select
                  aria-label="Style font weight"
                  value={String(styleDraft.font_weight)}
                  onChange={(event) => setStyleDraft((current) => current ? { ...current, font_weight: Number(event.target.value) as EditorStyleOverride["font_weight"] } : current)}
                  className="rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-200"
                >
                  {[400, 500, 600, 700].map((weight) => <option key={weight} value={weight}>{weight}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span>Indent</span>
                <select
                  aria-label="Style indent"
                  value={styleDraft.indent}
                  onChange={(event) => setStyleDraft((current) => current ? { ...current, indent: event.target.value as EditorStyleOverride["indent"] } : current)}
                  className="rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-200"
                >
                  <option value="0">None</option><option value="1">One level</option><option value="2">Two levels</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span>Letter spacing</span>
                <select
                  aria-label="Style letter spacing"
                  value={String(styleDraft.letter_spacing)}
                  onChange={(event) => setStyleDraft((current) => current ? { ...current, letter_spacing: Number(event.target.value) } : current)}
                  className="rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-200"
                >
                  {[0, 0.02, 0.04, 0.06, 0.08, 0.12].map((spacing) => <option key={spacing} value={spacing}>{spacing}em</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 self-end rounded border border-slate-700 bg-slate-900 px-2 py-1.5">
                <input
                  aria-label="Style italic"
                  type="checkbox"
                  checked={Boolean(styleDraft.italic)}
                  onChange={(event) => setStyleDraft((current) => current ? { ...current, italic: event.target.checked } : current)}
                />
                Italic
              </label>
              <label className="flex flex-col gap-1">
                <span>Capitalization</span>
                <select
                  aria-label="Style capitalization"
                  value={styleDraft.text_transform}
                  onChange={(event) => setStyleDraft((current) => current ? { ...current, text_transform: event.target.value as EditorStyleOverride["text_transform"] } : current)}
                  className="rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-200"
                >
                  <option value="none">As written</option><option value="uppercase">Uppercase</option>
                </select>
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={saveStyleProjectWide} className="rounded border border-emerald-600/60 bg-emerald-700/40 px-2 py-1 text-[10px] font-semibold text-emerald-100 hover:bg-emerald-700/60">Apply project-wide</button>
              <button type="button" onClick={resetStyleProjectWide} className="rounded border border-rose-700/60 bg-rose-950/30 px-2 py-1 text-[10px] text-rose-200 hover:bg-rose-900/50">Reset style defaults</button>
              <span className="text-slate-500">Saved in this project’s editor settings; no prose is rewritten.</span>
            </div>
          </div>
        )}
        {documentLabel && (
          <div className="mt-3 border-t border-slate-800/80 pt-3 font-sans text-xs uppercase tracking-widest text-indigo-400">
            {documentLabel}
          </div>
        )}
      </div>

      <EditorContent
        editor={editor}
        className="editor-content-shell"
        data-paragraph-spacing={typography.paragraph_spacing}
        style={{
          fontFamily: EDITOR_FONT_VALUES[typography.font_family],
          fontSize: `${typography.font_size}px`,
          lineHeight: typography.line_height,
        }}
      />
      {semanticMenuOpen && semanticMenuPoint && (
        <div
          className="fixed z-50 w-72 rounded-lg border border-indigo-700/70 bg-slate-950 p-2 shadow-2xl shadow-black/40"
          style={{ left: semanticMenuPoint.x, top: semanticMenuPoint.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="mb-2 flex items-center justify-between px-1 text-[10px] uppercase tracking-wider text-indigo-300">
            <span>Assign Markdown block style</span>
            <button type="button" onClick={() => setSemanticMenuOpen(false)} className="text-slate-500 hover:text-slate-200">×</button>
          </div>
          <select
            autoFocus
            aria-label="Choose semantic block style from context menu"
            value={selectedSemanticStyle || "normal-prose"}
            onChange={(event) => {
              const val = event.target.value;
              if (!val || val === "normal-prose" || val === "narrative") {
                clearSemanticStyle();
              } else {
                applySemanticStyle(val);
              }
            }}
            className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-indigo-500"
          >
            <option value="normal-prose">Normal Prose / Body Text</option>
            <option disabled>──────────</option>
            {SEMANTIC_STYLES.map((style) => (
              <option key={style.id} value={style.id}>
                {style.label}
              </option>
            ))}
          </select>
          <p className="px-1 pt-2 text-[10px] leading-relaxed text-slate-500">
            The selection is stored on this block and written back as a Markdown style directive.
          </p>
          <button
            type="button"
            onClick={clearSemanticStyle}
            className="mt-1 w-full rounded border border-slate-800 px-2 py-1 text-left text-[10px] text-slate-300 hover:bg-slate-900 hover:text-white"
          >
            Reset to Normal Prose / Clear style
          </button>
        </div>
      )}
    </div>
  );
}
