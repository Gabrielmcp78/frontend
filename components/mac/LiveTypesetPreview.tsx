"use client";

import React, { useMemo, useState } from "react";
import katex from "katex";

export type PreviewScope = "scene" | "chapter" | "part" | "full";

export interface PreviewSceneData {
  scene_number: number;
  title?: string | null;
  content_html?: string | null;
  chapter_number?: number | null;
  chapter_title?: string | null;
  scene_number_in_chapter?: number | null;
  part_number?: number | null;
  part_title?: string | null;
}

export const CANONICAL_PARTS_METADATA: Record<
  number,
  {
    roman: string;
    title: string;
    subtitle?: string;
    descriptor?: string;
    instrumentation?: string;
    movements?: string[];
  }
> = {
  1: {
    roman: "PART ONE",
    title: "PART ONE",
    subtitle: "Opus No. 46 in D minor “Of Life”",
    descriptor: "A String Quartet in Five Movements",
    instrumentation: "for human, cello, chalkboard, and mantelpiece",
  },
  2: {
    roman: "PART TWO",
    title: "PART TWO",
    subtitle: "The Edge of Discovery",
    descriptor: "An Epistemic Fugue in Eight Parts",
    instrumentation: "for shuttle bus, beer bottle, travel brochure, and bonfire",
  },
  3: {
    roman: "PART THREE",
    title: "PART THREE",
    subtitle: "Fruitful Eve, False Dawn, Fateful Night",
    descriptor: "A Secular Passion in Eight Movements",
    instrumentation: "for cello, viola, five annotating hands, and blizzard",
    movements: [
      "I. Andante sostenuto, dolce e misurato",
      "II. Andante cantabile, liberamente",
      "III. Moderato, con moto; sempre più incalzando",
      "IV. Tempo giusto, severo, senza affrettare",
      "V. Mosso e inquieto, con passo irregolare",
      "VI. Allegro molto, marcato, senza respiro",
      "VII. Largo, sospeso, quasi senza tempo",
      "VIII. Lento e spoglio, con ostinata resistenza",
    ],
  },
  4: {
    roman: "PART FOUR",
    title: "PART FOUR",
    subtitle: "Exercises in Humanity",
    descriptor: "A Suite for Quartet, with Walking Interstitials",
    instrumentation: "for quartet, with walking interstitials",
  },
  5: {
    roman: "PART FIVE",
    title: "PART FIVE",
    subtitle: "Twin Primes on the Six & The Burdens of Knowing",
    descriptor: "A Liminal Symphony in Five Movements",
    instrumentation: "for monochord, charcoal, steel plate, prism and chair",
  },
  6: {
    roman: "PART SIX",
    title: "PART SIX",
    subtitle: "Horizons",
  },
  12: {
    roman: "APPENDIX",
    title: "APPENDIX",
    subtitle: "Field Protocol #47 & Reference Compendium",
    descriptor: "National Museum Installation & Reference Lexicon",
  },
};
export const CANONICAL_CHAPTER_METADATA: Record<
  number,
  {
    subtitle?: string;
    defaultTempo?: string;
  }
> = {
  1: { defaultTempo: "Andante sostenuto" },
  2: { defaultTempo: "Presto agitato" },
  3: { defaultTempo: "Moderato, ma non troppo" },
  4: { defaultTempo: "Andante con distanza" },
  5: { defaultTempo: "Adagio, con malinconia" },
  6: {
    subtitle: "Exposition",
    defaultTempo: "Andante inquieto",
  },
  7: {
    subtitle: "Development",
    defaultTempo: "Andante con moto",
  },
  8: {
    subtitle: "Counter-Subject & Suppression",
    defaultTempo: "Allegro agitato",
  },
  9: {
    subtitle: "Stretto & Recognition",
    defaultTempo: "Largo sospeso",
  },
  10: {
    subtitle: "An Oratorio in Eight Movements",
  },
  14: {
    subtitle: "A Liminal Symphony in Five Movements",
  },
};

export const CANONICAL_SCENE_TEMPOS: Record<string, string> = {
  "1": "Andante sostenuto",
  "1.1": "Andante sostenuto",
  "2": "Presto agitato",
  "2.1": "Presto agitato",
  "3": "Moderato, ma non troppo",
  "3.1": "Moderato, ma non troppo",
  "4": "Andante con distanza",
  "4.1": "Andante con distanza",
  "5": "Adagio, con malinconia",
  "5.1": "Adagio, con malinconia",
  "6": "Andante inquieto",
  "6.1": "Andante inquieto",
  "6.2": "Allegro agitato",
  "6.3": "Moderato risoluto",
  "6.4": "Allegro vivace",
  "7": "Andante con moto",
  "7.1": "Andante con moto",
  "8": "Allegro agitato",
  "8.1": "Allegro agitato",
  "9": "Largo sospeso",
  "9.1": "Largo sospeso",
  "9.4": "Tempo ordinario",
  "10.1": "Andante sostenuto",
  "10.2": "Adagio espressivo e misterioso",
  "10.3": "Allegro con fuoco",
  "10.4": "Moderato incisivo",
  "10.5": "Presto agitato",
  "10.6": "Tempo ordinario, pesante",
  "10.7": "Largo, sospeso, quasi senza tempo",
  "10.8": "Lento e spoglio, con ostinata resistenza",
  "14.1": "Adagio misterioso",
  "14.2": "Andante con grazia e logica",
  "14.3": "Presto distruttivo",
  "14.4": "Largo maestoso",
  "14.5": "Largo maestoso",
};

export const CANONICAL_SCENE_TITLES: Record<string, string> = {
  "6.1": "TRAVEL",
  "6.2": "CONSENSUS",
  "6.3": "THE EXHIBITOR HALL",
  "6.4": "PROJECTION",
};

function cleanTex(raw: string): string {
  return raw
    .replace(/<em[^>]*>(.*?)<\/em>/gi, "_$1")
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, "\\textbf{$1}")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function renderMathInHtml(html: string): string {
  if (!html.includes("$") && !html.includes("\\(") && !html.includes("\\[")) return html;

  // 1. Block display math inside <p> tags: <p>$$...$$</p> or <p>\[...\]</p>
  // Formatted with vertical border lines on the left and right as requested
  let processed = html.replace(/<p[^>]*>\s*(?:\$\$|\\\[)([\s\S]+?)(?:\$\$|\\\])\s*<\/p>/g, (_, tex) => {
    try {
      const cleaned = cleanTex(tex);
      const rendered = katex.renderToString(cleaned, { displayMode: true, throwOnError: false });
      return `<div class="typeset-math-display my-6 mx-auto max-w-fit px-8 py-2 border-l border-r border-[#2c2825]/50 text-center overflow-x-auto select-text">${rendered}</div>`;
    } catch {
      return `<p class="typeset-math-display my-4 text-center text-red-600 font-mono text-xs">[Math error: ${tex}]</p>`;
    }
  });

  // 2. Standalone display math: $$...$$ or \[...\]
  processed = processed.replace(/(?:\$\$|\\\[)([\s\S]+?)(?:\$\$|\\\])/g, (_, tex) => {
    try {
      const cleaned = cleanTex(tex);
      const rendered = katex.renderToString(cleaned, { displayMode: true, throwOnError: false });
      return `<div class="typeset-math-display my-6 mx-auto max-w-fit px-8 py-2 border-l border-r border-[#2c2825]/50 text-center overflow-x-auto select-text">${rendered}</div>`;
    } catch {
      return `$$${tex}$$`;
    }
  });

  // 3. LaTeX inline math: \( ... \)
  processed = processed.replace(/\\\(([\s\S]+?)\\\)/g, (_, tex) => {
    try {
      const cleaned = cleanTex(tex);
      const rendered = katex.renderToString(cleaned, { displayMode: false, throwOnError: false });
      return `<span class="typeset-math-inline mx-0.5 select-text">${rendered}</span>`;
    } catch {
      return `\\(${tex}\\)`;
    }
  });

  // 4. TeX inline math: $ ... $ (ignoring standalone currency figures like $4.00 or $100)
  processed = processed.replace(/(?<!\\)\$([^\$\n]+?)(?<!\\)\$/g, (full, tex) => {
    if (/^\s*\d+(?:\.\d{2})?\s*$/.test(tex)) {
      return full;
    }
    try {
      const cleaned = cleanTex(tex);
      const rendered = katex.renderToString(cleaned, { displayMode: false, throwOnError: false });
      return `<span class="typeset-math-inline mx-0.5 select-text">${rendered}</span>`;
    } catch {
      return full;
    }
  });

  return processed;
}

function isBlockLetterOrSign(text: string): boolean {
  const clean = text.replace(/<[^>]+>/g, "").trim();
  if (clean.length < 3 || clean.length > 120) return false;
  if (clean.startsWith("$$") || clean.startsWith("\\(") || clean.startsWith("\\[")) return false;
  const letters = clean.replace(/[^a-zA-Z]/g, "");
  if (letters.length < 3) return false;
  return letters === letters.toUpperCase();
}

function formatBlockLettersAndSigns(html: string): string {
  // 1. Transform blockquotes that contain all-caps signs/notices (e.g. bus signs in Ch 6)
  let processed = html.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (full, inner) => {
    if (isBlockLetterOrSign(inner)) {
      const cleanInner = inner.replace(/<[^>]+>/g, "").trim();
      return `<div class="typeset-sign-card my-4 py-2.5 px-6 border-y border-stone-300 text-center indent-0 not-italic font-serif tracking-[0.2em] text-[12px] font-semibold text-stone-900 uppercase select-text">${cleanInner}</div>`;
    }
    return full;
  });

  // 2. Transform paragraphs that are standalone signs/chalkboard text (e.g. Ch 2, Ch 6, Ch 7)
  processed = processed.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (full, inner) => {
    if (isBlockLetterOrSign(inner)) {
      const cleanInner = inner.replace(/<[^>]+>/g, "").trim();
      return `<div class="typeset-sign-block my-3 text-center indent-0 font-serif tracking-[0.2em] text-[12.5px] font-semibold text-stone-900 uppercase select-text">${cleanInner}</div>`;
    }
    return full;
  });

  return processed;
}

function isDatelineParagraph(html: string): boolean {
  const text = html.replace(/<[^>]+>/g, "").trim();
  if (!text || text.length > 70) return false;
  if (/data-semantic-style=["'](?:dateline|location)["']/i.test(html)) return true;
  return /^(?:(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,\s+\d{4})?|\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+\d{4})?|\d{4})$/i.test(text);
}

function applyTypesetToProse(
  pHtml: string,
  isFirstSceneOfChapter: boolean,
  openingIndentInches: number = 1.5
): string {
  const m = pHtml.match(/^(\s*<p[^>]*>)([\s\S]*?)(<\/p>)$/i);
  if (!m) return pHtml;
  let pOpen = m[1];
  const pInner = m[2];
  const pClose = m[3];

  // Dynamic indent for each chapter opening line (replacing the drop cap)
  if (isFirstSceneOfChapter) {
    if (pOpen.includes('style="')) {
      pOpen = pOpen.replace(
        'style="',
        `style="text-indent: var(--typeset-opening-indent, ${openingIndentInches}in) !important; `
      );
    } else if (pOpen.includes("style='")) {
      pOpen = pOpen.replace(
        "style='",
        `style='text-indent: var(--typeset-opening-indent, ${openingIndentInches}in) !important; `
      );
    } else {
      pOpen = pOpen.replace(
        "<p",
        `<p style="text-indent: var(--typeset-opening-indent, ${openingIndentInches}in) !important;"`
      );
    }
  }

  const tokens = pInner.match(/(<[^>]+>)|([^<]+)/g) || [pInner];
  let wordCount = 0;
  let newInner = "";

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.startsWith("<")) {
      newInner += tok;
      continue;
    }

    if (wordCount >= 4) {
      newInner += tok;
      continue;
    }

    const segments = tok.split(/(\s+)/);
    let transformedText = "";

    for (let s = 0; s < segments.length; s++) {
      const seg = segments[s];
      if (/^\s+$/.test(seg)) {
        transformedText += seg;
        continue;
      }

      if (wordCount < 4) {
        wordCount++;
        // Lead ~4 words in tracked uppercase serif
        transformedText += `<span class="typeset-lead-caps font-serif font-semibold tracking-[0.16em] text-[12.5px] uppercase">${seg.toUpperCase()}</span>`;
      } else {
        transformedText += seg;
      }
    }
    newInner += transformedText;
  }

  return `${pOpen}${newInner}${pClose}`;
}

const FORMAL_STRUCTURES = new Set([
  "INTROIT",
  "KYRIE",
  "DIES IRAE",
  "OFFERTORY",
  "SEQUENCE",
  "SANCTUS",
  "BENEDICTUS",
  "AGNUS DEI",
  "LUX AETERNA",
  "LIBERA ME",
  "IN PARADISUM",
  "CHORALE",
  "ARIOSO",
  "RECITATIVUM",
  "TURBA",
  "VIA DOLOROSA",
  "CRUCIFIXIO",
  "DEPOSITIO",
  "DEPOSITIO / SEPULTURA",
  "RELIQUIAE",
  "SUBJECT",
  "ANSWER",
  "COUNTERSUBJECT",
  "EPISODE",
  "STRETTO",
  "CODA",
  "RECOGNITION",
  "RECOGNITION (CODA)",
]);

export interface ProcessedSceneResult {
  cleanTitle: string;
  formalStructure: string | null;
  dateline: string | null;
  tempoMarking: string | null;
  hasAuthoredTitle: boolean;
  renderedHtml: string;
}

function parseSceneTitle(rawTitle: string | null | undefined): {
  formalStructure: string | null;
  sceneTitle: string;
  dateline: string | null;
} {
  if (!rawTitle || rawTitle.trim().toUpperCase() === "SCENE") {
    return { formalStructure: null, sceneTitle: "", dateline: null };
  }

  let formalStructure: string | null = null;
  let sceneTitle = "";
  let dateline: string | null = null;

  let mainPart = rawTitle;
  if (rawTitle.includes("|")) {
    const parts = rawTitle.split("|");
    mainPart = parts[0].trim();
    dateline = parts
      .slice(1)
      .join(" · ")
      .trim()
      .replace(/\s{2,}/g, " · ")
      .replace(/\s*-\s*/g, " — ")
      .replace(/\s*·\s*/g, " · ");
  }

  if (mainPart.includes(":")) {
    const [alpha, ...rest] = mainPart.split(":");
    const trimmedAlpha = alpha.trim().toUpperCase();
    if (FORMAL_STRUCTURES.has(trimmedAlpha)) {
      formalStructure = trimmedAlpha;
      sceneTitle = rest.join(":").trim();
    } else {
      sceneTitle = mainPart.trim();
    }
  } else {
    const trimmedMain = mainPart.toUpperCase();
    if (FORMAL_STRUCTURES.has(trimmedMain)) {
      formalStructure = trimmedMain;
      if (
        dateline &&
        !/\b(?:19\d\d|20\d\d|morning|night|day|hall|quad|cambridge|buffalo|ithaca|massachusetts)\b/i.test(
          dateline
        )
      ) {
        sceneTitle = dateline;
        dateline = null;
      } else {
        sceneTitle = "";
      }
    } else {
      sceneTitle = mainPart;
    }
  }

  if (!formalStructure) {
    for (const fs of FORMAL_STRUCTURES) {
      if (mainPart.toUpperCase().startsWith(fs)) {
        formalStructure = fs;
        sceneTitle = mainPart.slice(fs.length).replace(/^[\s:—–-]+/, "").trim();
        break;
      }
    }
  }

  return { formalStructure, sceneTitle, dateline };
}

function processSceneContent(
  contentHtml: string,
  rawSceneTitle: string | null | undefined,
  coord: string,
  chapterNum: number | null,
  isFirstSceneOfChapter: boolean,
  openingIndentInches: number = 1.5
): ProcessedSceneResult {
  const hasAuthoredTitle = Boolean(
    rawSceneTitle &&
      rawSceneTitle.trim() &&
      rawSceneTitle.trim().toUpperCase() !== "SCENE"
  );

  const { formalStructure, sceneTitle, dateline: parsedDateline } = parseSceneTitle(
    rawSceneTitle
  );
  let cleanTitle = sceneTitle;
  let dateline: string | null = parsedDateline;
  let tempoMarking: string | null = null;

  // Tokenize top-level HTML blocks: <p...>, <h1-6...>, <blockquote...>, <div...>, <hr...>
  const blockRegex = /(<(?:p|h[1-6]|blockquote|div|hr)[^>]*>[\s\S]*?<\/(?:p|h[1-6]|blockquote|div)>|<hr[^>]*\/?>)/gi;
  const blocks = contentHtml.match(blockRegex) || [contentHtml];

  // Check if first block has thematic slug e.g. "| TRAVEL |"
  if (blocks.length > 0) {
    const slugMatch = blocks[0].replace(/<[^>]+>/g, "").trim().match(/^\|\s*([^|]+)\s*\|$/);
    if (slugMatch) {
      if (!cleanTitle) cleanTitle = slugMatch[1].trim();
      blocks.shift();
    }
  }

  // Fallback to canonical scene title if cleanTitle is still empty or redundant with formal structure
  if ((!cleanTitle || cleanTitle.toUpperCase() === formalStructure) && coord && CANONICAL_SCENE_TITLES[coord]) {
    cleanTitle = CANONICAL_SCENE_TITLES[coord];
  } else if (cleanTitle.toUpperCase() === formalStructure) {
    cleanTitle = "";
  }

  // 1. Check leading block for tempo marking
  if (blocks.length > 0) {
    const b0 = blocks[0];
    const text0 = b0.replace(/<[^>]+>/g, "").trim();
    if (
      /data-semantic-style=["']tempo-marking["']/i.test(b0) ||
      (/^(?:Andante|Adagio|Allegro|Moderato|Presto|Largo|Lento|Tempo\s+giusto|Mosso|Grave|Vivace|Maestoso)\b/i.test(text0) &&
        text0.length < 70)
    ) {
      tempoMarking = text0;
      blocks.shift();
    }
  }

  // 2. Check next leading block for dateline / date line (e.g. March 21, 2005)
  if (blocks.length > 0 && isDatelineParagraph(blocks[0])) {
    const dateText = blocks[0].replace(/<[^>]+>/g, "").trim();
    dateline = dateline ? `${dateline} · ${dateText}` : dateText;
    blocks.shift();
  }

  // Fallback to canonical tempo mapping if not found in blocks
  if (!tempoMarking) {
    tempoMarking =
      CANONICAL_SCENE_TEMPOS[coord] ||
      (chapterNum !== null ? CANONICAL_SCENE_TEMPOS[String(chapterNum)] : null) ||
      (chapterNum !== null ? CANONICAL_CHAPTER_METADATA[chapterNum]?.defaultTempo : null) ||
      null;
  }

  // Format block letters, chalkboards, and signs before math/prose detection
  const processedWithSigns = formatBlockLettersAndSigns(blocks.join(""));

  // Render LaTeX math across remaining blocks (with left & right vertical border rules)
  const processedWithMath = renderMathInHtml(processedWithSigns);
  const postMathBlocks = processedWithMath.match(blockRegex) || [processedWithMath];

  // Typeset first true prose paragraph (skip blockquotes, epigraphs, instrumentation, stage directions)
  let proseFound = false;
  for (let i = 0; i < postMathBlocks.length; i++) {
    const blk = postMathBlocks[i];
    if (
      /^<p\b/i.test(blk) &&
      !/data-semantic-style=["'](?:epigraph|instrumentation|stage-direction|block-1|block-2)["']/i.test(blk)
    ) {
      postMathBlocks[i] = applyTypesetToProse(blk, isFirstSceneOfChapter, openingIndentInches);
      proseFound = true;
      break;
    }
  }

  return {
    cleanTitle,
    formalStructure,
    dateline,
    tempoMarking,
    hasAuthoredTitle,
    renderedHtml: postMathBlocks.join(""),
  };
}

function getCleanChapterTitle(rawTitle: string | null | undefined, num: number | null): string {
  if (!rawTitle) return num !== null ? `${num}` : "";
  const cleaned = rawTitle
    .replace(/^Chapter\s*\d+\s*[:—|-]?\s*/i, "")
    .replace(/^(?:act|part)[-_\s]*\d+\s*[/|—:-]\s*/i, "")
    .replace(/^ch\d+\s*[-_—|:]*\s*/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const lower = cleaned.toLowerCase();
  const canonMap: Record<string, string> = {
    "the ivy league": "The Ivy League",
    "the lecture": "The Lecture",
    "the office": "The Office",
    "the rehearsal": "The Rehearsal",
    "the apartment": "The Apartment",
    "now then": "Now Then",
    "alteration finds": "Alteration Finds",
    "the firebirds": "The Firebirds",
    "remaining returns": "Remaining Returns",
    "fruitful eve false dawn fateful night": "Fruitful Eve, False Dawn, Fateful Night",
    "exercises in humanity": "Exercises in Humanity",
    "humanities": "Humanities",
    "twin primes on the six": "Twin Primes on the Six",
    "visions and burdens of knowing": "Visions and Burdens of Knowing",
    "the solar maximum connection": "The Solar Maximum Connection",
  };
  if (canonMap[lower]) return canonMap[lower];
  return cleaned;
}

export type StyleTarget =
  | "all"
  | "chapter-hero"
  | "chapter-title"
  | "chapter-subtitle"
  | "scene-header"
  | "prose"
  | "math"
  | "signs"
  | "running-header"
  | "scene-break";

export interface LayoutTuningParams {
  // 1. Chapter Opener Hero & Titles
  chapterHeroSize: number; // px, 32 to 96
  chapterHeroColor: string; // hex
  chapterHeroWeight: string; // "light" | "normal" | "semibold" | "bold"
  chapterHeroMarginBottom: number; // px, 0 to 32
  chapterTitleSize: number; // px, 12 to 28
  chapterTitleTracking: number; // em, 0.10 to 0.45
  runningHeaderSize: number; // px, 8 to 14
  runningHeaderTracking: number; // em, 0.15 to 0.55
  chapterSubtitleSize: number; // px, 10 to 16

  // 2. Scene Counterpoint Header
  ghostSize: number; // px, 40 to 130
  ghostYShift: number; // %, -60 to +30
  ghostXShift: number; // px, -40 to +20
  ghostOpacity: number; // 0.1 to 1.0
  ruleThickness: number; // px, 0.5 to 3.0
  titleGap: number; // px, 0 to 12
  sceneHeaderBottomGap: number; // px, 2 to 32
  titleSize: number; // px, 9 to 18
  titleTracking: number; // em, 0.05 to 0.35
  sceneNumSize: number; // px, 10 to 20
  formalSize: number; // px, 9 to 16
  formalTracking: number; // em, 0.10 to 0.35
  tempoSize: number; // px, 9 to 15

  // 3. Prose & Typography
  openingIndent: number; // in, 0.0 to 3.0
  bodyIndent: number; // px, 12 to 36
  bodyFontSize: number; // px, 13 to 18
  bodyLineHeight: number; // 1.4 to 2.2
  leadCapsSize: number; // px, 10 to 16
  leadCapsTracking: number; // em, 0.05 to 0.30

  // 4. Equations & Math Display
  mathBorderWidth: number; // px, 0 to 4
  mathPaddingX: number; // px, 8 to 64
  mathPaddingY: number; // px, 2 to 24

  // 5. Signs & Chalkboards
  signFontSize: number; // px, 10 to 16
  signTracking: number; // em, 0.10 to 0.40
  signBorderWidth: number; // px, 0 to 3

  // 6. Scene Break Ornament
  breakSize: number; // px, 9 to 20
  breakPaddingY: number; // px, 8 to 40
}

export const DEFAULT_LAYOUT_TUNING: LayoutTuningParams = {
  chapterHeroSize: 48,
  chapterHeroColor: "#8b3a2b",
  chapterHeroWeight: "normal",
  chapterHeroMarginBottom: 12,
  chapterTitleSize: 16,
  chapterTitleTracking: 0.25,
  runningHeaderSize: 10,
  runningHeaderTracking: 0.35,
  chapterSubtitleSize: 12,

  ghostSize: 72,
  ghostYShift: -17,
  ghostXShift: -12,
  ghostOpacity: 0.8,
  ruleThickness: 1,
  titleGap: 2,
  sceneHeaderBottomGap: 12,
  titleSize: 12,
  titleTracking: 0.2,
  sceneNumSize: 13,
  formalSize: 11,
  formalTracking: 0.25,
  tempoSize: 10.5,

  openingIndent: 1.5,
  bodyIndent: 24,
  bodyFontSize: 15,
  bodyLineHeight: 1.7,
  leadCapsSize: 12.5,
  leadCapsTracking: 0.16,

  mathBorderWidth: 1,
  mathPaddingX: 32,
  mathPaddingY: 8,

  signFontSize: 12.5,
  signTracking: 0.2,
  signBorderWidth: 1,

  breakSize: 12,
  breakPaddingY: 24,
};

const STYLE_TARGET_PILLS: { id: StyleTarget; label: string; icon: string }[] = [
  { id: "all", label: "All", icon: "📑" },
  { id: "chapter-hero", label: "Hero #", icon: "👑" },
  { id: "chapter-title", label: "Ch Title", icon: "🏷️" },
  { id: "scene-header", label: "Scene Header", icon: "📐" },
  { id: "prose", label: "Prose & Indents", icon: "📖" },
  { id: "math", label: "Math", icon: "∫" },
  { id: "signs", label: "Signs", icon: "🪧" },
  { id: "running-header", label: "Header", icon: "⬆️" },
  { id: "scene-break", label: "Break ❦", icon: "❦" },
];

const STYLE_TARGET_NAMES: Record<StyleTarget, string> = {
  all: "All Styles",
  "chapter-hero": "Chapter Hero Numeral",
  "chapter-title": "Chapter Title",
  "chapter-subtitle": "Chapter Subtitle & Instrumentation",
  "scene-header": "Counterpoint Scene Header",
  prose: "Prose, Indents & Small-Caps",
  math: "Display Equations",
  signs: "Signs, Chalkboards & Blocks",
  "running-header": "Top Running Header",
  "scene-break": "Scene Break Ornament (❦)",
};

interface LiveTypesetPreviewProps {
  projectTitle: string;
  author: string;
  allScenes: PreviewSceneData[];
  selectedScene: PreviewSceneData | null;
  formatProfileId: string;
  onFormatProfileChange: (profileId: string) => void;
  pdfUrl?: string | null;
  onCompilePdf?: () => void;
  isCompilingPdf?: boolean;
  onExportArtifact?: (format: "pdf" | "docx" | "markdown", scope: PreviewScope) => void;
  isExportingArtifact?: boolean;
}

export const LiveTypesetPreview: React.FC<LiveTypesetPreviewProps> = ({
  projectTitle,
  author,
  allScenes,
  selectedScene,
  formatProfileId,
  onFormatProfileChange,
  pdfUrl,
  onCompilePdf,
  isCompilingPdf = false,
  onExportArtifact,
  isExportingArtifact = false,
}) => {
  const [scope, setScope] = useState<PreviewScope>("chapter");
  const [renderMode, setRenderMode] = useState<"visual" | "pdf">("visual");
  const [showTuner, setShowTuner] = useState<boolean>(false);
  const [selectedTarget, setSelectedTarget] = useState<StyleTarget>("all");
  const [copiedTuning, setCopiedTuning] = useState<boolean>(false);

  const [tuning, setTuning] = useState<LayoutTuningParams>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("string_theories_typeset_tuning");
        if (saved) return { ...DEFAULT_LAYOUT_TUNING, ...JSON.parse(saved) };
      } catch (e) {
        /* ignore */
      }
    }
    return DEFAULT_LAYOUT_TUNING;
  });

  const getTargetOutline = (target: StyleTarget) => {
    if (!showTuner) return "";
    if (selectedTarget === target) {
      return "outline outline-2 outline-amber-500 rounded bg-amber-500/15 cursor-pointer ring-2 ring-amber-500/30 transition-all";
    }
    return "hover:outline hover:outline-1 hover:outline-dashed hover:outline-amber-400/70 hover:bg-amber-400/5 cursor-pointer rounded transition-all";
  };

  const updateTuning = (patch: Partial<LayoutTuningParams>) => {
    setTuning((prev) => {
      const updated = { ...prev, ...patch };
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("string_theories_typeset_tuning", JSON.stringify(updated));
        } catch (e) {
          /* ignore */
        }
      }
      return updated;
    });
  };

  const resetTuning = () => {
    setTuning(DEFAULT_LAYOUT_TUNING);
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("string_theories_typeset_tuning");
      } catch (e) {
        /* ignore */
      }
    }
  };

  const handleCopyTuningJson = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(JSON.stringify(tuning, null, 2));
      setCopiedTuning(true);
      setTimeout(() => setCopiedTuning(false), 2000);
    }
  };

  // Determine which scenes to display based on selected scope
  const targetScenes = useMemo(() => {
    if (!selectedScene && allScenes.length === 0) return [];
    if (!selectedScene) return allScenes;

    switch (scope) {
      case "scene":
        return [selectedScene];
      case "chapter": {
        const chNum = selectedScene.chapter_number;
        const chTitle = selectedScene.chapter_title;
        return allScenes.filter((s) => {
          if (chNum !== null && chNum !== undefined) {
            return s.chapter_number === chNum;
          }
          return s.chapter_title === chTitle;
        });
      }
      case "part": {
        const partNum = selectedScene.part_number;
        const partTitle = selectedScene.part_title;
        return allScenes.filter((s) => {
          if (partNum !== null && partNum !== undefined) {
            return s.part_number === partNum;
          }
          return s.part_title === partTitle;
        });
      }
      case "full":
      default:
        return allScenes;
    }
  }, [allScenes, selectedScene, scope]);

  // Group targeted scenes by Part -> Chapter for structured book layout
  const bookStructure = useMemo(() => {
    const partsMap = new Map<
      string,
      {
        partTitle: string;
        partNum: number | null;
        chapters: Map<
          string,
          {
            chapterTitle: string;
            cleanTitle: string;
            chapterNum: number | null;
            scenes: PreviewSceneData[];
          }
        >;
      }
    >();

    for (const scene of targetScenes) {
      const partKey = scene.part_title
        ? `part_${scene.part_title}`
        : scene.part_number !== null && scene.part_number !== undefined
        ? `part_${scene.part_number}`
        : "default_part";
      const partTitle =
        scene.part_title ||
        (scene.part_number !== null && scene.part_number !== undefined
          ? `Part ${scene.part_number}`
          : "");

      if (!partsMap.has(partKey)) {
        partsMap.set(partKey, {
          partTitle,
          partNum: scene.part_number ?? null,
          chapters: new Map(),
        });
      }

      const chapterNum = scene.chapter_number ?? null;
      const chapterKey =
        chapterNum !== null ? `ch_${chapterNum}` : `ch_${scene.chapter_title || "untitled"}`;
      const rawTitle = scene.chapter_title || "";
      const cleanTitle = getCleanChapterTitle(rawTitle, chapterNum);

      const part = partsMap.get(partKey)!;
      if (!part.chapters.has(chapterKey)) {
        part.chapters.set(chapterKey, {
          chapterTitle: rawTitle,
          cleanTitle,
          chapterNum,
          scenes: [],
        });
      }

      part.chapters.get(chapterKey)!.scenes.push(scene);
    }

    return Array.from(partsMap.entries()).map(([_, partData]) => ({
      partTitle: partData.partTitle,
      partNum: partData.partNum,
      chapters: Array.from(partData.chapters.entries()).map(([_, chapterData]) => ({
        chapterTitle: chapterData.chapterTitle,
        cleanTitle: chapterData.cleanTitle,
        chapterNum: chapterData.chapterNum,
        scenes: chapterData.scenes.sort((a, b) => {
          const aNum = a.scene_number_in_chapter ?? a.scene_number;
          const bNum = b.scene_number_in_chapter ?? b.scene_number;
          return aNum - bNum;
        }),
      })),
    }));
  }, [targetScenes]);

  const activeChapterLabel = selectedScene?.chapter_number
    ? `Chapter ${selectedScene.chapter_number}`
    : selectedScene?.chapter_title || "Chapter";

  const activePartLabel = selectedScene?.part_number
    ? `Part ${selectedScene.part_number}`
    : selectedScene?.part_title || "Part";

  const activeSceneCoord =
    selectedScene?.chapter_number !== null &&
    selectedScene?.scene_number_in_chapter !== null &&
    selectedScene?.chapter_number !== undefined &&
    selectedScene?.scene_number_in_chapter !== undefined
      ? `${selectedScene.chapter_number}.${selectedScene.scene_number_in_chapter}`
      : `${selectedScene?.scene_number ?? 1}`;

  return (
    <div className="flex flex-col h-full w-full min-w-0 bg-zinc-900 border-l border-zinc-800 select-none overflow-hidden relative">
      {/* Top Controls Bar */}
      <div className="p-2.5 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md flex flex-wrap items-center justify-between gap-2 shrink-0 z-10">
        {/* Scope Selector */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mr-1">
            Preview Scope:
          </span>
          <div className="mac-segmented-control">
            <button
              type="button"
              onClick={() => setScope("scene")}
              className={`mac-segmented-item ${scope === "scene" ? "active" : ""}`}
              title={`Preview current scene (${activeSceneCoord})`}
            >
              Scene {activeSceneCoord}
            </button>
            <button
              type="button"
              onClick={() => setScope("chapter")}
              className={`mac-segmented-item ${scope === "chapter" ? "active" : ""}`}
              title={`Preview current chapter (${activeChapterLabel})`}
            >
              {activeChapterLabel}
            </button>
            <button
              type="button"
              onClick={() => setScope("part")}
              className={`mac-segmented-item ${scope === "part" ? "active" : ""}`}
              title={`Preview current part cover & chapters (${activePartLabel})`}
            >
              {activePartLabel}
            </button>
            <button
              type="button"
              onClick={() => setScope("full")}
              className={`mac-segmented-item ${scope === "full" ? "active" : ""}`}
              title="Preview entire novel from Title Page to end"
            >
              Full Book
            </button>
          </div>
        </div>

        {/* Profile & Mode Selector */}
        <div className="flex items-center gap-2">
          <select
            value={formatProfileId}
            onChange={(e) => onFormatProfileChange(e.target.value)}
            className="text-xs bg-zinc-900 text-zinc-200 border border-zinc-700 rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
          >
            <option value="manuscript_submission">Standard Shunn (Submission)</option>
            <option value="trade_paperback_prh">Trade Paperback Literary (6×9)</option>
          </select>

          <div className="mac-segmented-control">
            <button
              type="button"
              onClick={() => setRenderMode("visual")}
              className={`mac-segmented-item ${renderMode === "visual" ? "active" : ""}`}
            >
              Instant Typeset
            </button>
            <button
              type="button"
              onClick={() => {
                setRenderMode("pdf");
                if (!pdfUrl && onCompilePdf) onCompilePdf();
              }}
              className={`mac-segmented-item ${renderMode === "pdf" ? "active" : ""}`}
            >
              Compiled PDF
            </button>
          </div>

          {renderMode === "pdf" && onCompilePdf && (
            <button
              type="button"
              onClick={onCompilePdf}
              disabled={isCompilingPdf}
              className="text-xs px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium disabled:opacity-50 flex items-center gap-1 transition-all"
            >
              {isCompilingPdf ? "Compiling…" : "Refresh PDF"}
            </button>
          )}

          {/* Export Actions Directly Connected to Current Scope & Preview */}
          <div className="flex items-center gap-1.5 border-l border-zinc-700 pl-2 ml-1 no-print">
            <button
              type="button"
              onClick={() => window.print()}
              title="Print or Save WYSIWYG 6×9 typeset layout directly to PDF"
              className="text-xs px-2.5 py-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 font-medium flex items-center gap-1 transition-all"
            >
              <span>🖨️</span> Print / Save PDF
            </button>

            {onExportArtifact && (
              <button
                type="button"
                onClick={() => onExportArtifact("pdf", scope)}
                disabled={isExportingArtifact}
                title={`Compile and download current ${scope} as PDF artifact`}
                className="text-xs px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium flex items-center gap-1.5 transition-all disabled:opacity-50"
              >
                {isExportingArtifact ? (
                  <>
                    <span className="w-3 h-3 rounded-full border border-white border-t-transparent animate-spin" />
                    <span>Exporting…</span>
                  </>
                ) : (
                  <>
                    <span>⬇</span> Export {scope.charAt(0).toUpperCase() + scope.slice(1)} PDF
                  </>
                )}
              </button>
            )}

            {/* Live Interactive Layout Tuner Toggle */}
            <button
              type="button"
              onClick={() => setShowTuner((v) => !v)}
              className={`text-xs px-2.5 py-1 rounded font-medium flex items-center gap-1.5 transition-all border ${
                showTuner
                  ? "bg-amber-600/30 text-amber-200 border-amber-500/60"
                  : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700"
              }`}
              title="Toggle interactive live layout tuner"
            >
              <span>🎛️</span>
              <span>Tune Layout</span>
            </button>
          </div>
        </div>
      </div>

            {/* Main Body Area: Preview on Left/Center + Docked Tuner on Right */}
      <div className="flex-1 flex min-h-0 w-full overflow-hidden relative">
        {/* Render Container */}
        <div className="flex-1 overflow-x-auto overflow-y-auto p-4 sm:p-8 bg-zinc-950 min-w-0 flex items-start justify-center">
        {renderMode === "pdf" ? (
          pdfUrl ? (
            <iframe
              src={pdfUrl}
              title="Compiled LaTeX PDF Preview"
              className="w-full h-full min-h-[75vh] rounded-lg shadow-2xl border border-zinc-800 bg-white"
            />
          ) : (
            <div className="flex flex-col items-center justify-center p-12 text-center text-zinc-400 gap-3">
              <span className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
              <p className="text-xs">Compiling real-time LaTeX PDF for selected scope…</p>
            </div>
          )
        ) : (
          /* ================= INSTANT TYPESET RENDERER ================= */
          <div className="w-full flex flex-col items-center gap-8 pb-16">
            {formatProfileId === "manuscript_submission" ? (
              /* --- STANDARD SHUNN MANUSCRIPT FORMAT --- */
              <div className="w-full max-w-3xl bg-[#fffefc] text-zinc-900 shadow-2xl rounded-sm p-12 sm:p-16 border border-zinc-300 font-mono text-sm leading-relaxed space-y-8 select-text">
                {/* Shunn Front Matter */}
                {(scope === "part" || scope === "full") && (
                  <div className="space-y-16 border-b-2 border-dashed border-zinc-300 pb-16">
                    <div className="flex justify-between items-start text-xs leading-normal">
                      <div>
                        <p className="font-bold">{author}</p>
                        <p>author@stringtheories.org</p>
                      </div>
                      <div className="text-right">
                        <p>About 85,000 words</p>
                      </div>
                    </div>

                    <div className="pt-24 text-center space-y-4">
                      <h1 className="text-xl font-bold tracking-widest uppercase">
                        {projectTitle}
                      </h1>
                      <p className="text-sm">by</p>
                      <p className="text-base font-bold">{author}</p>
                    </div>
                  </div>
                )}

                {/* Structured Book Parts & Chapters */}
                {bookStructure.map(({ partTitle, chapters }, pIdx) => (
                  <div key={pIdx} className="space-y-12">
                    {(scope === "part" || scope === "full") && partTitle && (
                      <div className="py-20 text-center border-b border-zinc-300">
                        <h2 className="text-lg font-bold tracking-widest uppercase">
                          {partTitle}
                        </h2>
                      </div>
                    )}

                    {chapters.map(({ cleanTitle, scenes: chScenes }, cIdx) => (
                      <div key={cIdx} className="space-y-8">
                        {scope !== "scene" && (
                          <div className="pt-8 pb-4 text-center">
                            <h3 className="text-base font-bold tracking-wider uppercase">
                              {cleanTitle}
                            </h3>
                          </div>
                        )}

                        {chScenes.map((sc, sIdx) => {
                          const coord =
                            sc.chapter_number && sc.scene_number_in_chapter
                              ? `${sc.chapter_number}.${sc.scene_number_in_chapter}`
                              : `${sc.scene_number}`;

                          return (
                            <article key={sc.scene_number} className="space-y-4">
                              {sc.title && sc.title.trim().toUpperCase() !== "SCENE" && (
                                <div className="pt-4 pb-2 border-b border-zinc-300 flex items-baseline justify-between text-xs font-bold tracking-wide">
                                  <span className="uppercase text-indigo-900">
                                    {coord} {sc.title}
                                  </span>
                                  <span className="text-zinc-400 font-normal">
                                    {author.toUpperCase()} / {projectTitle.toUpperCase()} / {coord}
                                  </span>
                                </div>
                              )}

                              <div
                                className="prose prose-sm max-w-none text-zinc-800 leading-loose text-justify font-mono space-y-4 [&>p]:indent-8"
                                dangerouslySetInnerHTML={{
                                  __html: sc.content_html || "<p>Empty scene content.</p>",
                                }}
                              />

                              {sIdx < chScenes.length - 1 && (
                                <div className="py-4 text-center font-bold text-zinc-400">
                                  #
                                </div>
                              )}
                            </article>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              /* --- TRADE PAPERBACK LITERARY (AUTHENTIC 6x9 PAGE SPREAD) --- */
              <div
                className="w-[560px] shrink-0 bg-[#fcfaf5] text-[#2c2825] shadow-2xl rounded-sm px-12 sm:px-14 py-16 border border-stone-300 font-serif text-[15px] leading-relaxed space-y-12 select-text"
                style={{
                  ["--typeset-opening-indent" as string]: `${tuning.openingIndent}in`,
                }}
              >
                <style>{`
                  .typeset-math-display {
                    border-left-width: ${tuning.mathBorderWidth}px !important;
                    border-right-width: ${tuning.mathBorderWidth}px !important;
                    padding-left: ${tuning.mathPaddingX}px !important;
                    padding-right: ${tuning.mathPaddingX}px !important;
                    padding-top: ${tuning.mathPaddingY}px !important;
                    padding-bottom: ${tuning.mathPaddingY}px !important;
                  }
                  .typeset-sign-card {
                    font-size: ${tuning.signFontSize}px !important;
                    letter-spacing: ${tuning.signTracking}em !important;
                    border-top-width: ${tuning.signBorderWidth}px !important;
                    border-bottom-width: ${tuning.signBorderWidth}px !important;
                  }
                  .typeset-sign-block {
                    font-size: ${tuning.signFontSize}px !important;
                    letter-spacing: ${tuning.signTracking}em !important;
                  }
                  .typeset-lead-caps {
                    font-size: ${tuning.leadCapsSize}px !important;
                    letter-spacing: ${tuning.leadCapsTracking}em !important;
                  }
                  .typeset-prose-body {
                    font-size: ${tuning.bodyFontSize}px !important;
                    line-height: ${tuning.bodyLineHeight} !important;
                  }
                  .typeset-prose-body > p {
                    text-indent: ${tuning.bodyIndent}px !important;
                  }
                `}</style>
                {/* Title Page */}
                {scope === "full" && (
                  <div className="text-center py-20 border-b border-stone-300 space-y-6">
                    <h1 className="text-2xl font-bold tracking-[0.3em] uppercase font-serif text-zinc-900">
                      {projectTitle}
                    </h1>
                    <p className="text-xs uppercase tracking-[0.3em] text-zinc-500 italic">
                      A Novel
                    </p>
                    <p className="text-sm font-semibold tracking-wider uppercase text-zinc-800 pt-12">
                      {author}
                    </p>
                  </div>
                )}

                {bookStructure.map(({ partTitle, partNum, chapters }, pIdx) => {
                  const partMeta =
                    partNum !== null && CANONICAL_PARTS_METADATA[partNum]
                      ? CANONICAL_PARTS_METADATA[partNum]
                      : null;

                  return (
                    <div key={pIdx} className="space-y-14">
                      {/* ================= PART COVER PAGE ================= */}
                      {(scope === "part" || scope === "full") && (partMeta || partTitle) && (
                        <div className="pt-24 pb-20 px-4 text-center border-b border-stone-300 space-y-5">
                          <p className="text-xs font-serif font-bold uppercase tracking-[0.3em] text-[#8b3a2b]">
                            {partMeta?.roman || (partNum !== null ? `PART ${partNum}` : partTitle)}
                          </p>
                          <h2 className="text-2xl sm:text-3xl font-serif italic text-zinc-950 font-normal">
                            {partMeta?.subtitle || partTitle}
                          </h2>
                          {partMeta?.descriptor && (
                            <p className="text-xs font-serif italic text-zinc-600">
                              {partMeta.descriptor}
                            </p>
                          )}

                          {/* Part Instrumentation */}
                          {partMeta?.instrumentation && (
                            <p className="text-xs font-serif italic text-zinc-700 pt-1">
                              {partMeta.instrumentation}
                            </p>
                          )}

                          {/* Center Divider Rule */}
                          <div className="w-48 mx-auto border-t border-[#2c2825] my-6" />

                          {/* Movements list if present */}
                          {partMeta?.movements && (
                            <div className="space-y-2 pt-2">
                              {partMeta.movements.map((mov, mIdx) => (
                                <p key={mIdx} className="text-xs font-serif italic text-zinc-800">
                                  {mov}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {chapters.map(({ cleanTitle, chapterNum, scenes: chScenes }, cIdx) => {
                        const chapterMeta =
                          chapterNum !== null && CANONICAL_CHAPTER_METADATA[chapterNum]
                            ? CANONICAL_CHAPTER_METADATA[chapterNum]
                            : null;

                        return (
                          <div key={cIdx} className="space-y-10">
                            {/* ================= CHAPTER OPENER ================= */}
                            {scope !== "scene" && (
                              <div className="pt-6 pb-6 text-center space-y-3">
                                {/* Top Running Header */}
                                <div
                                  onClick={(e) => {
                                    if (showTuner) {
                                      e.stopPropagation();
                                      setSelectedTarget("running-header");
                                    }
                                  }}
                                  style={{
                                    fontSize: `${tuning.runningHeaderSize}px`,
                                    letterSpacing: `${tuning.runningHeaderTracking}em`,
                                  }}
                                  className={`text-zinc-400 uppercase font-serif mb-6 select-none ${getTargetOutline(
                                    "running-header"
                                  )}`}
                                  title={showTuner ? "Click to tune Running Header style" : undefined}
                                >
                                  STRING THEORIES
                                </div>

                                {/* Bold Rust-Red Chapter Numeral */}
                                <div
                                  onClick={(e) => {
                                    if (showTuner) {
                                      e.stopPropagation();
                                      setSelectedTarget("chapter-hero");
                                    }
                                  }}
                                  style={{
                                    fontSize: `${tuning.chapterHeroSize}px`,
                                    color: tuning.chapterHeroColor,
                                    fontWeight:
                                      tuning.chapterHeroWeight === "light"
                                        ? 300
                                        : tuning.chapterHeroWeight === "bold"
                                        ? 700
                                        : tuning.chapterHeroWeight === "semibold"
                                        ? 600
                                        : 400,
                                    marginBottom: `${tuning.chapterHeroMarginBottom}px`,
                                  }}
                                  className={`font-serif tracking-tight leading-none select-none ${getTargetOutline(
                                    "chapter-hero"
                                  )}`}
                                  title={showTuner ? "Click to tune Chapter Hero Numeral style" : undefined}
                                >
                                  {chapterNum !== null ? chapterNum : ""}
                                </div>

                                {/* Spaced Chapter Title in Tracked Uppercase */}
                                <h3
                                  onClick={(e) => {
                                    if (showTuner) {
                                      e.stopPropagation();
                                      setSelectedTarget("chapter-title");
                                    }
                                  }}
                                  style={{
                                    fontSize: `${tuning.chapterTitleSize}px`,
                                    letterSpacing: `${tuning.chapterTitleTracking}em`,
                                  }}
                                  className={`font-serif font-semibold uppercase text-[#1a1715] select-none ${getTargetOutline(
                                    "chapter-title"
                                  )}`}
                                  title={showTuner ? "Click to tune Chapter Title style" : undefined}
                                >
                                  {cleanTitle}
                                </h3>

                                {/* Chapter Subtitle if present */}
                                {chapterMeta?.subtitle && (
                                  <p
                                    onClick={(e) => {
                                      if (showTuner) {
                                        e.stopPropagation();
                                        setSelectedTarget("chapter-subtitle");
                                      }
                                    }}
                                    style={{ fontSize: `${tuning.chapterSubtitleSize}px` }}
                                    className={`font-serif italic text-zinc-700 pt-1 select-none ${getTargetOutline(
                                      "chapter-subtitle"
                                    )}`}
                                    title={showTuner ? "Click to tune Chapter Subtitle style" : undefined}
                                  >
                                    {chapterMeta.subtitle}
                                  </p>
                                )}
                              </div>
                            )}

                            {/* Scenes */}
                            {chScenes.map((sc, sIdx) => {
                              const coord =
                                sc.chapter_number && sc.scene_number_in_chapter
                                  ? `${sc.chapter_number}.${sc.scene_number_in_chapter}`
                                  : `${sc.scene_number}`;

                              const isFirstSceneOfChapter = sIdx === 0;

                              const {
                                cleanTitle: sceneTitleText,
                                formalStructure,
                                dateline: sceneDateline,
                                tempoMarking: sceneTempo,
                                hasAuthoredTitle,
                                renderedHtml: formattedProseHtml,
                              } = processSceneContent(
                                sc.content_html || "<p>Empty scene content.</p>",
                                sc.title,
                                coord,
                                chapterNum,
                                isFirstSceneOfChapter,
                                tuning.openingIndent
                              );

                              const sceneNumInChapter =
                                sc.scene_number_in_chapter ?? (sIdx + 1);

                              return (
                                <article key={sc.scene_number}>
                                  {/* Counterpoint Scene Header — Exact Architectural Layout */}
                                  {hasAuthoredTitle ? (
                                    <div
                                      onClick={(e) => {
                                        if (showTuner) {
                                          e.stopPropagation();
                                          setSelectedTarget("scene-header");
                                        }
                                      }}
                                      style={{
                                        marginBottom: `${tuning.sceneHeaderBottomGap}px`,
                                      }}
                                      className={`mt-6 select-none relative ${getTargetOutline(
                                        "scene-header"
                                      )}`}
                                      title={showTuner ? "Click to tune Scene Header style" : undefined}
                                    >
                                      <div className="flex items-center relative">
                                        {/* Large Light-Stone Ghost Chapter Numeral: 2/3 above, 1/3 below, sitting BEHIND the rule & text */}
                                        <div
                                          style={{
                                            fontSize: `${tuning.ghostSize}px`,
                                            transform: `translateY(${tuning.ghostYShift}%) translateX(${tuning.ghostXShift}px)`,
                                            opacity: tuning.ghostOpacity,
                                          }}
                                          className="font-serif font-light text-stone-300 leading-none select-none shrink-0 tracking-tight z-0 pointer-events-none"
                                        >
                                          {chapterNum !== null ? chapterNum : ""}
                                        </div>

                                        {/* Header Title & Formal Structure Divided by Horizontal Rule in front */}
                                        <div className="flex-1 flex flex-col justify-center min-w-0 z-10">
                                          {/* Above the line: Scene number & Title on left, Formal Voice (SUBJECT/ANSWER) on right */}
                                          <div
                                            style={{ paddingBottom: `${tuning.titleGap}px` }}
                                            className="flex items-baseline justify-between pl-1 gap-2 leading-none"
                                          >
                                            <div className="flex items-baseline gap-2 leading-none min-w-0">
                                              <span
                                                style={{ fontSize: `${tuning.sceneNumSize}px` }}
                                                className="font-serif font-semibold tracking-[0.18em] text-[#1a1715] leading-none shrink-0"
                                              >
                                                {sceneNumInChapter}
                                              </span>
                                              {sceneTitleText && (
                                                <span
                                                  style={{
                                                    fontSize: `${tuning.titleSize}px`,
                                                    letterSpacing: `${tuning.titleTracking}em`,
                                                  }}
                                                  className="font-serif font-semibold uppercase text-[#1a1715] leading-none truncate"
                                                >
                                                  {sceneTitleText}
                                                </span>
                                              )}
                                            </div>
                                            {formalStructure && (
                                              <span
                                                style={{
                                                  fontSize: `${tuning.formalSize}px`,
                                                  letterSpacing: `${tuning.formalTracking}em`,
                                                }}
                                                className="font-serif font-semibold uppercase text-[#1a1715] shrink-0 leading-none"
                                              >
                                                {formalStructure}
                                              </span>
                                            )}
                                          </div>

                                          {/* Horizontal Divider Rule connecting across the numeral */}
                                          <div
                                            style={{ borderTopWidth: `${tuning.ruleThickness}px` }}
                                            className="w-full border-t border-[#2c2825]"
                                          />

                                          {/* Below the line: Tempo marking on left + Dateline / Temporal note on right */}
                                          <div className="flex items-baseline justify-between pt-1 pl-1 gap-2 leading-none">
                                            {sceneTempo ? (
                                              <span
                                                style={{ fontSize: `${tuning.tempoSize}px` }}
                                                className="italic font-serif text-[#4a423d] truncate leading-tight"
                                              >
                                                {sceneTempo}
                                              </span>
                                            ) : (
                                              <span />
                                            )}
                                            {sceneDateline ? (
                                              <span className="italic font-serif text-[11px] text-zinc-500 shrink-0 leading-tight">
                                                {sceneDateline}
                                              </span>
                                            ) : (
                                              <span />
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    /* Single continuous scene (Ch 1-5): Render tempo marking gracefully below chapter title */
                                    sceneTempo && (
                                      <div
                                        onClick={(e) => {
                                          if (showTuner) {
                                            e.stopPropagation();
                                            setSelectedTarget("scene-header");
                                          }
                                        }}
                                        style={{ fontSize: `${tuning.tempoSize}px` }}
                                        className={`text-center italic text-[#8b3a2b] font-serif tracking-wider py-2 -mt-4 mb-6 select-none ${getTargetOutline(
                                          "scene-header"
                                        )}`}
                                        title={showTuner ? "Click to tune Tempo Marking style" : undefined}
                                      >
                                        {sceneTempo}
                                      </div>
                                    )
                                  )}

                                  {/* Scene Prose HTML with Drop Cap only on scene 1, first 4 words capitalized, and full Semantic Styles + KaTeX math */}
                                  <div
                                    onClick={(e) => {
                                      if (showTuner) {
                                        e.stopPropagation();
                                        setSelectedTarget("prose");
                                      }
                                    }}
                                    className={`typeset-prose-body prose prose-base max-w-none text-[#2d2926] leading-relaxed text-justify font-serif space-y-0 ${getTargetOutline(
                                      "prose"
                                    )} [&>p]:indent-6 [&>p:first-of-type]:indent-0 [&_[data-semantic-style='block-1']]:ml-8 [&_[data-semantic-style='block-1']]:indent-0 [&_[data-semantic-style='block-2']]:ml-14 [&_[data-semantic-style='block-2']]:indent-0 [&_[data-semantic-style='stage-direction']]:italic [&_[data-semantic-style='stage-direction']]:text-stone-600 [&_[data-semantic-style='stage-direction']]:ml-8 [&_[data-semantic-style='stage-direction']]:indent-0 [&_[data-semantic-style='interior-italic-1']]:italic [&_[data-semantic-style='interior-italic-1']]:ml-8 [&_[data-semantic-style='interior-italic-1']]:indent-0 [&_[data-semantic-style='interior-italic-2']]:italic [&_[data-semantic-style='interior-italic-2']]:ml-14 [&_[data-semantic-style='interior-italic-2']]:indent-0 [&_[data-semantic-style='epigraph']]:text-center [&_[data-semantic-style='epigraph']]:italic [&_[data-semantic-style='epigraph']]:my-4 [&_[data-semantic-style='epigraph']]:indent-0 [&_[data-semantic-style='instrumentation']]:text-center [&_[data-semantic-style='instrumentation']]:italic [&_[data-semantic-style='instrumentation']]:text-xs [&_[data-semantic-style='instrumentation']]:text-stone-600 [&_[data-semantic-style='instrumentation']]:indent-0 [&_[data-semantic-style='tempo-marking']]:text-center [&_[data-semantic-style='tempo-marking']]:italic [&_[data-semantic-style='tempo-marking']]:text-[#8b3a2b] [&_[data-semantic-style='tempo-marking']]:text-xs [&_[data-semantic-style='tempo-marking']]:my-3 [&_[data-semantic-style='tempo-marking']]:indent-0 [&_[data-semantic-style='dateline']]:text-right [&_[data-semantic-style='dateline']]:text-xs [&_[data-semantic-style='dateline']]:text-stone-500 [&_[data-semantic-style='dateline']]:indent-0 [&_[data-semantic-style='location']]:italic [&_[data-semantic-style='location']]:text-xs [&_[data-semantic-style='location']]:text-stone-600 [&_[data-semantic-style='location']]:indent-0 [&_[data-semantic-style='scene-title']]:text-xs [&_[data-semantic-style='scene-title']]:font-semibold [&_[data-semantic-style='scene-title']]:uppercase [&_[data-semantic-style='scene-title']]:tracking-[0.18em] [&_[data-semantic-style='scene-title']]:indent-0 [&_[data-semantic-style='music-formal-1']]:text-center [&_[data-semantic-style='music-formal-1']]:italic [&_[data-semantic-style='music-formal-1']]:text-[#8b3a2b] [&_[data-semantic-style='music-formal-1']]:text-xs [&_[data-semantic-style='music-formal-1']]:my-2 [&_[data-semantic-style='music-formal-1']]:indent-0 [&_[data-semantic-style='music-formal-2']]:text-center [&_[data-semantic-style='music-formal-2']]:italic [&_[data-semantic-style='music-formal-2']]:text-stone-600 [&_[data-semantic-style='music-formal-2']]:text-xs [&_[data-semantic-style='music-formal-2']]:my-1 [&_[data-semantic-style='music-formal-2']]:indent-0 [&_[data-semantic-style='movement']]:italic [&_[data-semantic-style='movement']]:text-xs [&_[data-semantic-style='movement']]:text-stone-700 [&_[data-semantic-style='movement']]:my-1 [&_[data-semantic-style='movement']]:indent-0 [&_[data-semantic-style='scene-secondary']]:italic [&_[data-semantic-style='scene-secondary']]:text-xs [&_[data-semantic-style='scene-secondary']]:text-stone-600 [&_[data-semantic-style='scene-secondary']]:my-1 [&_[data-semantic-style='scene-secondary']]:indent-0 [&_blockquote]:border-l-0 [&_blockquote]:italic [&_blockquote]:text-center [&_blockquote]:my-5 [&_blockquote]:text-stone-700 [&_blockquote>p]:indent-0 [&_.typeset-math-display]:my-4 [&_.typeset-math-display]:text-center [&_.typeset-math-display]:indent-0 [&_.typeset-math-display]:text-stone-900`}
                                    title={showTuner ? "Click to tune Prose & Opening Indent style" : undefined}
                                    dangerouslySetInnerHTML={{
                                      __html: formattedProseHtml,
                                    }}
                                  />

                                  {/* Scene Break Ornament */}
                                  {sIdx < chScenes.length - 1 && (
                                    <div
                                      onClick={(e) => {
                                        if (showTuner) {
                                          e.stopPropagation();
                                          setSelectedTarget("scene-break");
                                        }
                                      }}
                                      style={{
                                        fontSize: `${tuning.breakSize}px`,
                                        paddingTop: `${tuning.breakPaddingY}px`,
                                        paddingBottom: `${tuning.breakPaddingY}px`,
                                      }}
                                      className={`text-center text-stone-400 tracking-widest ${getTargetOutline(
                                        "scene-break"
                                      )}`}
                                      title={showTuner ? "Click to tune Scene Break Ornament style" : undefined}
                                    >
                                      ❦
                                    </div>
                                  )}
                                </article>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        </div>

        {/* Docked Layout Tuner Panel (Side-by-Side: never covers manuscript) */}
        {/* Floating Interactive Layout Tuner Panel (Stationary - Outside Scroll Viewport) */}
      {showTuner && (
        <aside className="w-80 sm:w-96 shrink-0 h-full bg-zinc-900/95 backdrop-blur-xl border-l border-zinc-800 shadow-2xl p-4 text-zinc-200 no-print flex flex-col gap-3.5 overflow-y-auto z-20">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-base">🎛️</span>
              <div>
                <h4 className="text-xs font-semibold text-white tracking-wide uppercase">
                  Layout Tuner
                </h4>
                <p className="text-[10px] text-zinc-400">Live Visual Calibration</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={resetTuning}
                title="Reset all settings to canonical defaults"
                className="text-[10.5px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
              >
                ↺ Reset
              </button>
              <button
                type="button"
                onClick={() => setShowTuner(false)}
                className="text-xs w-6 h-6 rounded flex items-center justify-center hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Target Selector Pills */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar text-[11px]">
            {STYLE_TARGET_PILLS.map((p) => {
              const active = selectedTarget === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedTarget(p.id)}
                  className={`px-2 py-1 rounded-md shrink-0 flex items-center gap-1 font-medium transition-all ${
                    active
                      ? "bg-amber-500 text-stone-950 font-semibold shadow-sm"
                      : "bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300"
                  }`}
                >
                  <span>{p.icon}</span>
                  <span>{p.label}</span>
                </button>
              );
            })}
          </div>

          {/* Active Target Banner */}
          {selectedTarget !== "all" ? (
            <div className="flex items-center justify-between bg-amber-500/15 border border-amber-500/30 px-2.5 py-1.5 rounded-lg text-xs text-amber-200">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span>
                  Editing: <strong>{STYLE_TARGET_NAMES[selectedTarget]}</strong>
                </span>
              </span>
              <button
                type="button"
                onClick={() => setSelectedTarget("all")}
                className="text-[10.5px] px-1.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/40 text-amber-100 transition-colors"
              >
                View All ✕
              </button>
            </div>
          ) : (
            <div className="text-[10.5px] text-zinc-400 bg-zinc-800/50 px-2.5 py-1.5 rounded border border-zinc-800">
              💡 <strong>Click to Inspect:</strong> Click any element in the text frame to jump directly to its style controls.
            </div>
          )}

          {/* Quick Presets */}
          <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
            <span className="text-zinc-500 text-[10px] uppercase font-semibold">Presets:</span>
            <button
              type="button"
              onClick={() =>
                updateTuning({
                  chapterHeroSize: 48,
                  chapterHeroColor: "#8b3a2b",
                  chapterHeroWeight: "normal",
                  ghostSize: 72,
                  ghostYShift: -17,
                  ghostXShift: -12,
                  ghostOpacity: 0.8,
                  ruleThickness: 1,
                  titleGap: 2,
                  openingIndent: 1.5,
                  bodyIndent: 24,
                  bodyFontSize: 15,
                  bodyLineHeight: 1.7,
                })
              }
              className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10.5px]"
            >
              PRH Canonical
            </button>
            <button
              type="button"
              onClick={() =>
                updateTuning({
                  chapterHeroSize: 40,
                  chapterHeroColor: "#1a1715",
                  chapterHeroWeight: "semibold",
                  ghostSize: 64,
                  ghostYShift: -12,
                  ghostXShift: -8,
                  ghostOpacity: 0.7,
                  ruleThickness: 1,
                  titleGap: 1,
                  openingIndent: 1.0,
                  bodyIndent: 18,
                  bodyFontSize: 14.5,
                  bodyLineHeight: 1.6,
                })
              }
              className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10.5px]"
            >
              Tight
            </button>
            <button
              type="button"
              onClick={() =>
                updateTuning({
                  chapterHeroSize: 64,
                  chapterHeroColor: "#8b3a2b",
                  chapterHeroWeight: "light",
                  ghostSize: 84,
                  ghostYShift: -22,
                  ghostXShift: -14,
                  ghostOpacity: 0.85,
                  ruleThickness: 1.5,
                  titleGap: 3,
                  openingIndent: 2.0,
                  bodyIndent: 28,
                  bodyFontSize: 15.5,
                  bodyLineHeight: 1.8,
                })
              }
              className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10.5px]"
            >
              Monumental
            </button>
          </div>

          {/* 1. CHAPTER HERO & TITLES */}
          {(selectedTarget === "all" ||
            selectedTarget === "chapter-hero" ||
            selectedTarget === "chapter-title" ||
            selectedTarget === "chapter-subtitle" ||
            selectedTarget === "running-header") && (
            <div className="space-y-3 border-t border-zinc-800 pt-2.5">
              <span className="text-[10px] font-semibold tracking-wider text-rose-400 uppercase flex items-center justify-between">
                <span>Chapter Opener & Hero</span>
                <span className="text-[9px] text-zinc-500 font-normal">Click hero to focus</span>
              </span>

              {/* Hero Size */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-zinc-300">Chapter Hero Numeral Size</span>
                  <span className="font-mono text-zinc-400 text-[10.5px]">{tuning.chapterHeroSize}px</span>
                </div>
                <input
                  type="range"
                  min={28}
                  max={96}
                  step={2}
                  value={tuning.chapterHeroSize}
                  onChange={(e) => updateTuning({ chapterHeroSize: Number(e.target.value) })}
                  className="w-full accent-rose-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                />
              </div>

              {/* Hero Color Tint */}
              <div className="space-y-1">
                <span className="text-[10.5px] text-zinc-300">Hero Color Tint</span>
                <div className="flex items-center gap-1.5 pt-0.5">
                  {[
                    { label: "Rust Red", color: "#8b3a2b" },
                    { label: "Inky Black", color: "#1a1715" },
                    { label: "Warm Stone", color: "#57534e" },
                    { label: "Amber Ochre", color: "#b45309" },
                  ].map((c) => (
                    <button
                      key={c.color}
                      type="button"
                      onClick={() => updateTuning({ chapterHeroColor: c.color })}
                      className={`text-[10px] px-2 py-1 rounded flex items-center gap-1 transition-all border ${
                        tuning.chapterHeroColor === c.color
                          ? "border-amber-400 bg-zinc-800 text-white font-medium"
                          : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                      <span>{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Hero Font Weight */}
              <div className="space-y-1">
                <span className="text-[10.5px] text-zinc-300">Hero Font Weight</span>
                <div className="grid grid-cols-4 gap-1 pt-0.5">
                  {(["light", "normal", "semibold", "bold"] as const).map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => updateTuning({ chapterHeroWeight: w })}
                      className={`text-[10px] py-1 rounded text-center capitalize transition-all border ${
                        tuning.chapterHeroWeight === w
                          ? "border-rose-400 bg-rose-500/20 text-rose-200 font-semibold"
                          : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chapter Title Size & Tracking */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10.5px]">
                    <span className="text-zinc-300">Chapter Title Size</span>
                    <span className="font-mono text-zinc-400">{tuning.chapterTitleSize}px</span>
                  </div>
                  <input
                    type="range"
                    min={12}
                    max={28}
                    step={1}
                    value={tuning.chapterTitleSize}
                    onChange={(e) => updateTuning({ chapterTitleSize: Number(e.target.value) })}
                    className="w-full accent-rose-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10.5px]">
                    <span className="text-zinc-300">Title Tracking</span>
                    <span className="font-mono text-zinc-400">{tuning.chapterTitleTracking}em</span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={0.45}
                    step={0.01}
                    value={tuning.chapterTitleTracking}
                    onChange={(e) => updateTuning({ chapterTitleTracking: Number(e.target.value) })}
                    className="w-full accent-rose-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                  />
                </div>
              </div>

              {/* Running Header Size & Tracking */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10.5px]">
                    <span className="text-zinc-300">Header Size</span>
                    <span className="font-mono text-zinc-400">{tuning.runningHeaderSize}px</span>
                  </div>
                  <input
                    type="range"
                    min={8}
                    max={14}
                    step={0.5}
                    value={tuning.runningHeaderSize}
                    onChange={(e) => updateTuning({ runningHeaderSize: Number(e.target.value) })}
                    className="w-full accent-rose-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10.5px]">
                    <span className="text-zinc-300">Header Tracking</span>
                    <span className="font-mono text-zinc-400">{tuning.runningHeaderTracking}em</span>
                  </div>
                  <input
                    type="range"
                    min={0.15}
                    max={0.55}
                    step={0.02}
                    value={tuning.runningHeaderTracking}
                    onChange={(e) => updateTuning({ runningHeaderTracking: Number(e.target.value) })}
                    className="w-full accent-rose-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 2. SCENE COUNTERPOINT HEADER */}
          {(selectedTarget === "all" || selectedTarget === "scene-header") && (
            <div className="space-y-2 border-t border-zinc-800 pt-2.5">
              <span className="text-[10px] font-semibold tracking-wider text-amber-400 uppercase flex items-center justify-between">
                <span>Scene Counterpoint Header</span>
                <span className="text-[9px] text-zinc-500 font-normal">Click scene header to focus</span>
              </span>

              {/* Ghost Size */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-zinc-300">Ghost Numeral Scale</span>
                  <span className="font-mono text-zinc-400 text-[10.5px]">{tuning.ghostSize}px</span>
                </div>
                <input
                  type="range"
                  min={40}
                  max={130}
                  step={2}
                  value={tuning.ghostSize}
                  onChange={(e) => updateTuning({ ghostSize: Number(e.target.value) })}
                  className="w-full accent-amber-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                />
              </div>

              {/* Ghost Elevation */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-zinc-300">Ghost Elevation across rule</span>
                  <span className="font-mono text-zinc-400 text-[10.5px]">
                    {tuning.ghostYShift}% {tuning.ghostYShift === -17 ? "(2/3 above line)" : ""}
                  </span>
                </div>
                <input
                  type="range"
                  min={-60}
                  max={30}
                  step={1}
                  value={tuning.ghostYShift}
                  onChange={(e) => updateTuning({ ghostYShift: Number(e.target.value) })}
                  className="w-full accent-amber-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-zinc-500">
                  <span>Higher (2/3 above: -17%)</span>
                  <span>Lower (centered: 0%)</span>
                </div>
              </div>

              {/* Ghost Horizontal Shift & Opacity */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10.5px]">
                    <span className="text-zinc-300">Ghost X-Shift</span>
                    <span className="font-mono text-zinc-400">{tuning.ghostXShift}px</span>
                  </div>
                  <input
                    type="range"
                    min={-40}
                    max={20}
                    step={1}
                    value={tuning.ghostXShift}
                    onChange={(e) => updateTuning({ ghostXShift: Number(e.target.value) })}
                    className="w-full accent-amber-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10.5px]">
                    <span className="text-zinc-300">Ghost Opacity</span>
                    <span className="font-mono text-zinc-400">{Math.round(tuning.ghostOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={1.0}
                    step={0.05}
                    value={tuning.ghostOpacity}
                    onChange={(e) => updateTuning({ ghostOpacity: Number(e.target.value) })}
                    className="w-full accent-amber-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                  />
                </div>
              </div>

              {/* Baseline Gap to Rule */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-zinc-300">Scene Title Baseline Gap to Rule</span>
                  <span className="font-mono text-zinc-400 text-[10.5px]">{tuning.titleGap}px</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={12}
                  step={1}
                  value={tuning.titleGap}
                  onChange={(e) => updateTuning({ titleGap: Number(e.target.value) })}
                  className="w-full accent-amber-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                />
              </div>

              {/* Rule Thickness */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-zinc-300">Horizontal Rule Thickness</span>
                  <span className="font-mono text-zinc-400 text-[10.5px]">{tuning.ruleThickness}px</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={3.0}
                  step={0.5}
                  value={tuning.ruleThickness}
                  onChange={(e) => updateTuning({ ruleThickness: Number(e.target.value) })}
                  className="w-full accent-amber-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                />
              </div>

              {/* Space from Scene Header to First Prose Line */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-zinc-300">Space to First Prose Line</span>
                  <span className="font-mono text-zinc-400 text-[10.5px]">{tuning.sceneHeaderBottomGap}px</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={28}
                  step={1}
                  value={tuning.sceneHeaderBottomGap}
                  onChange={(e) => updateTuning({ sceneHeaderBottomGap: Number(e.target.value) })}
                  className="w-full accent-amber-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                />
              </div>

              {/* Scene Title Size & Tracking */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10.5px]">
                    <span className="text-zinc-300">Scene Title Size</span>
                    <span className="font-mono text-zinc-400">{tuning.titleSize}px</span>
                  </div>
                  <input
                    type="range"
                    min={9}
                    max={16}
                    step={1}
                    value={tuning.titleSize}
                    onChange={(e) => updateTuning({ titleSize: Number(e.target.value) })}
                    className="w-full accent-amber-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10.5px]">
                    <span className="text-zinc-300">Scene Title Tracking</span>
                    <span className="font-mono text-zinc-400">{tuning.titleTracking}em</span>
                  </div>
                  <input
                    type="range"
                    min={0.05}
                    max={0.35}
                    step={0.01}
                    value={tuning.titleTracking}
                    onChange={(e) => updateTuning({ titleTracking: Number(e.target.value) })}
                    className="w-full accent-amber-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                  />
                </div>
              </div>

              {/* Formal Structure Size & Tracking */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10.5px]">
                    <span className="text-zinc-300">Formal Music Size</span>
                    <span className="font-mono text-zinc-400">{tuning.formalSize}px</span>
                  </div>
                  <input
                    type="range"
                    min={8}
                    max={15}
                    step={1}
                    value={tuning.formalSize}
                    onChange={(e) => updateTuning({ formalSize: Number(e.target.value) })}
                    className="w-full accent-amber-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10.5px]">
                    <span className="text-zinc-300">Formal Tracking</span>
                    <span className="font-mono text-zinc-400">{tuning.formalTracking}em</span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={0.4}
                    step={0.01}
                    value={tuning.formalTracking}
                    onChange={(e) => updateTuning({ formalTracking: Number(e.target.value) })}
                    className="w-full accent-amber-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 3. PROSE & TYPOGRAPHY */}
          {(selectedTarget === "all" || selectedTarget === "prose") && (
            <div className="space-y-2 border-t border-zinc-800 pt-2.5">
              <span className="text-[10px] font-semibold tracking-wider text-emerald-400 uppercase flex items-center justify-between">
                <span>Prose, Indents & Leading</span>
                <span className="text-[9px] text-zinc-500 font-normal">Click prose to focus</span>
              </span>

              {/* Chapter Opening Indent */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-zinc-300">Chapter Opening First-Line Indent</span>
                  <span className="font-mono text-zinc-400 text-[10.5px] font-bold text-emerald-400">
                    {tuning.openingIndent.toFixed(1)} in
                  </span>
                </div>
                <input
                  type="range"
                  min={0.0}
                  max={3.0}
                  step={0.1}
                  value={tuning.openingIndent}
                  onChange={(e) => updateTuning({ openingIndent: Number(e.target.value) })}
                  className="w-full accent-emerald-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-zinc-500">
                  <span>0 in (Flush)</span>
                  <span>1.5 in (Target)</span>
                  <span>3.0 in (Deep)</span>
                </div>
              </div>

              {/* Standard Paragraph Indent & Body Text Size */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10.5px]">
                    <span className="text-zinc-300">Body Indent</span>
                    <span className="font-mono text-zinc-400">{tuning.bodyIndent}px</span>
                  </div>
                  <input
                    type="range"
                    min={12}
                    max={36}
                    step={2}
                    value={tuning.bodyIndent}
                    onChange={(e) => updateTuning({ bodyIndent: Number(e.target.value) })}
                    className="w-full accent-emerald-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10.5px]">
                    <span className="text-zinc-300">Body Font Size</span>
                    <span className="font-mono text-zinc-400">{tuning.bodyFontSize}px</span>
                  </div>
                  <input
                    type="range"
                    min={13}
                    max={18}
                    step={0.5}
                    value={tuning.bodyFontSize}
                    onChange={(e) => updateTuning({ bodyFontSize: Number(e.target.value) })}
                    className="w-full accent-emerald-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                  />
                </div>
              </div>

              {/* Line Height (Leading) & Lead Small-Caps */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10.5px]">
                    <span className="text-zinc-300">Leading (Line-Height)</span>
                    <span className="font-mono text-zinc-400">{tuning.bodyLineHeight}</span>
                  </div>
                  <input
                    type="range"
                    min={1.4}
                    max={2.2}
                    step={0.05}
                    value={tuning.bodyLineHeight}
                    onChange={(e) => updateTuning({ bodyLineHeight: Number(e.target.value) })}
                    className="w-full accent-emerald-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10.5px]">
                    <span className="text-zinc-300">Lead Caps Size</span>
                    <span className="font-mono text-zinc-400">{tuning.leadCapsSize}px</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={16}
                    step={0.5}
                    value={tuning.leadCapsSize}
                    onChange={(e) => updateTuning({ leadCapsSize: Number(e.target.value) })}
                    className="w-full accent-emerald-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 4. DISPLAY EQUATIONS */}
          {(selectedTarget === "all" || selectedTarget === "math") && (
            <div className="space-y-2 border-t border-zinc-800 pt-2.5">
              <span className="text-[10px] font-semibold tracking-wider text-sky-400 uppercase flex items-center justify-between">
                <span>Equation Framing</span>
                <span className="text-[9px] text-zinc-500 font-normal">Click equation to focus</span>
              </span>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10.5px]">
                    <span className="text-zinc-300">Side Rules</span>
                    <span className="font-mono text-zinc-400">{tuning.mathBorderWidth}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={3}
                    step={0.5}
                    value={tuning.mathBorderWidth}
                    onChange={(e) => updateTuning({ mathBorderWidth: Number(e.target.value) })}
                    className="w-full accent-sky-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10.5px]">
                    <span className="text-zinc-300">Side Pad</span>
                    <span className="font-mono text-zinc-400">{tuning.mathPaddingX}px</span>
                  </div>
                  <input
                    type="range"
                    min={8}
                    max={64}
                    step={4}
                    value={tuning.mathPaddingX}
                    onChange={(e) => updateTuning({ mathPaddingX: Number(e.target.value) })}
                    className="w-full accent-sky-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10.5px]">
                    <span className="text-zinc-300">Vert Pad</span>
                    <span className="font-mono text-zinc-400">{tuning.mathPaddingY}px</span>
                  </div>
                  <input
                    type="range"
                    min={2}
                    max={24}
                    step={2}
                    value={tuning.mathPaddingY}
                    onChange={(e) => updateTuning({ mathPaddingY: Number(e.target.value) })}
                    className="w-full accent-sky-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 5. SIGNS & CHALKBOARDS */}
          {(selectedTarget === "all" || selectedTarget === "signs") && (
            <div className="space-y-2 border-t border-zinc-800 pt-2.5">
              <span className="text-[10px] font-semibold tracking-wider text-purple-400 uppercase flex items-center justify-between">
                <span>Signs, Chalkboards & Blocks</span>
                <span className="text-[9px] text-zinc-500 font-normal">Ch 2, 6, 7</span>
              </span>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10.5px]">
                    <span className="text-zinc-300">Font Size</span>
                    <span className="font-mono text-zinc-400">{tuning.signFontSize}px</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={16}
                    step={0.5}
                    value={tuning.signFontSize}
                    onChange={(e) => updateTuning({ signFontSize: Number(e.target.value) })}
                    className="w-full accent-purple-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10.5px]">
                    <span className="text-zinc-300">Tracking</span>
                    <span className="font-mono text-zinc-400">{tuning.signTracking}em</span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={0.4}
                    step={0.01}
                    value={tuning.signTracking}
                    onChange={(e) => updateTuning({ signTracking: Number(e.target.value) })}
                    className="w-full accent-purple-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10.5px]">
                    <span className="text-zinc-300">Border W</span>
                    <span className="font-mono text-zinc-400">{tuning.signBorderWidth}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={3}
                    step={0.5}
                    value={tuning.signBorderWidth}
                    onChange={(e) => updateTuning({ signBorderWidth: Number(e.target.value) })}
                    className="w-full accent-purple-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 6. SCENE BREAK ORNAMENT */}
          {(selectedTarget === "all" || selectedTarget === "scene-break") && (
            <div className="space-y-2 border-t border-zinc-800 pt-2.5">
              <span className="text-[10px] font-semibold tracking-wider text-teal-400 uppercase flex items-center justify-between">
                <span>Scene Break Ornament (❦)</span>
                <span className="text-[9px] text-zinc-500 font-normal">Between scenes</span>
              </span>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10.5px]">
                    <span className="text-zinc-300">Ornament Size</span>
                    <span className="font-mono text-zinc-400">{tuning.breakSize}px</span>
                  </div>
                  <input
                    type="range"
                    min={9}
                    max={20}
                    step={1}
                    value={tuning.breakSize}
                    onChange={(e) => updateTuning({ breakSize: Number(e.target.value) })}
                    className="w-full accent-teal-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10.5px]">
                    <span className="text-zinc-300">Vertical Space</span>
                    <span className="font-mono text-zinc-400">{tuning.breakPaddingY}px</span>
                  </div>
                  <input
                    type="range"
                    min={8}
                    max={40}
                    step={2}
                    value={tuning.breakPaddingY}
                    onChange={(e) => updateTuning({ breakPaddingY: Number(e.target.value) })}
                    className="w-full accent-teal-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Footer with Copy JSON button */}
          <div className="border-t border-zinc-800 pt-3">
            <button
              type="button"
              onClick={handleCopyTuningJson}
              className="w-full py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors border border-zinc-700"
            >
              <span>{copiedTuning ? "✓" : "📋"}</span>
              <span>{copiedTuning ? "Copied Tuning JSON!" : "Copy Tuning JSON to Clipboard"}</span>
            </button>
          </div>
        </aside>
        )}
      </div>
    </div>
  );
};
