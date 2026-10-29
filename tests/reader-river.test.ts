import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  CALIBRATION_BEATS,
  MANUSCRIPT_COMMIT,
  riverProperties,
  type CalibrationBeat,
} from "@/lib/reader-river/part-one";
import {
  GENERAL_QUESTIONS,
  FIVE_B_QUESTIONS,
  CHECKPOINTS,
  checkResponse,
  makeBlindReaderPrompt,
} from "@/lib/reader-river/blind-protocol";
import {
  READER_EVIDENCE,
  EVIDENCE_COMMIT,
  type FindingType,
} from "@/lib/reader-river/evidence-ledger";
import {
  STUDY_ID,
  STUDY_REVISION,
  TEST_WINDOWS,
  READER_QUESTIONS,
  makeFrictionPrompt,
  validateFrictionResponse,
} from "@/lib/reader-river/friction-protocol";

describe("Reader River Part One (part-one.ts)", () => {
  it("MANUSCRIPT_COMMIT is a 40-character hex string", () => {
    assert.match(MANUSCRIPT_COMMIT, /^[0-9a-f]{40}$/i);
    assert.equal(MANUSCRIPT_COMMIT.length, 40);
  });

  it("CALIBRATION_BEATS contains exactly 14 beats spanning chapters 1 through 5", () => {
    assert.equal(CALIBRATION_BEATS.length, 14);

    const chapters = new Set(CALIBRATION_BEATS.map((b) => b.chapter));
    assert.deepEqual(Array.from(chapters).sort(), [1, 2, 3, 4, 5]);
  });

  it("CALIBRATION_BEATS has all required properties and valid ranges on every beat", () => {
    const validLevels = new Set([1, 2, 3]);
    const validSyntheses = new Set(["invited", "at-risk", "unknown"]);
    const beatIds = new Set<string>();

    for (const b of CALIBRATION_BEATS) {
      assert.ok(typeof b.id === "string" && b.id.trim().length > 0, `Beat ${b.id} missing id`);
      assert.ok(!beatIds.has(b.id), `Duplicate beat id: ${b.id}`);
      beatIds.add(b.id);

      assert.ok(typeof b.chapter === "number" && b.chapter >= 1 && b.chapter <= 5);
      assert.ok(typeof b.event === "string" && b.event.trim().length > 0);
      assert.ok(typeof b.sourceLines === "string" && b.sourceLines.trim().length > 0);

      assert.ok(validLevels.has(b.uncertainty), `Beat ${b.id} invalid uncertainty: ${b.uncertainty}`);
      assert.ok(validLevels.has(b.urgency), `Beat ${b.id} invalid urgency: ${b.urgency}`);
      assert.ok(validLevels.has(b.stakes), `Beat ${b.id} invalid stakes: ${b.stakes}`);

      assert.ok(validSyntheses.has(b.synthesis), `Beat ${b.id} invalid synthesis: ${b.synthesis}`);
      assert.ok(typeof b.question === "string" && b.question.trim().length > 0);
    }
  });

  it("riverProperties maps uncertainty/urgency/stakes and sets rapids when urgency=3 and stakes=3", () => {
    // Test on all beats
    for (const b of CALIBRATION_BEATS) {
      const props = riverProperties(b);
      assert.equal(props.width, b.uncertainty);
      assert.equal(props.current, b.urgency);
      assert.equal(props.depth, b.stakes);
      assert.equal(props.rapids, b.urgency === 3 && b.stakes === 3);
    }

    // Explicit test for rapids = true (e.g. beat 2b or 2c: urgency=3, stakes=3)
    const rapidsBeat: CalibrationBeat = {
      id: "test-rapids",
      chapter: 2,
      event: "Test high stakes rush",
      sourceLines: "1-10",
      uncertainty: 2,
      urgency: 3,
      stakes: 3,
      synthesis: "invited",
      question: "Are rapids triggered?",
    };
    assert.deepEqual(riverProperties(rapidsBeat), {
      width: 2,
      current: 3,
      depth: 3,
      rapids: true,
    });

    // Explicit test for rapids = false when urgency < 3 or stakes < 3
    const calmBeat: CalibrationBeat = {
      id: "test-calm",
      chapter: 1,
      event: "Test calm reflection",
      sourceLines: "1-10",
      uncertainty: 1,
      urgency: 2,
      stakes: 2,
      synthesis: "invited",
      question: "Are rapids inactive?",
    };
    assert.deepEqual(riverProperties(calmBeat), {
      width: 1,
      current: 2,
      depth: 2,
      rapids: false,
    });
  });
});

describe("Reader River Blind Protocol (blind-protocol.ts)", () => {
  it("GENERAL_QUESTIONS contains 7 questions with the expected unique IDs", () => {
    assert.equal(GENERAL_QUESTIONS.length, 7);

    const expectedIds = ["changed", "relationships", "questions", "prediction", "moment", "friction", "continue"];
    const actualIds = GENERAL_QUESTIONS.map((q) => q.id);
    assert.deepEqual(actualIds, expectedIds);

    const uniqueIds = new Set(actualIds);
    assert.equal(uniqueIds.size, 7);

    for (const q of GENERAL_QUESTIONS) {
      assert.ok(typeof q.id === "string" && q.id.length > 0);
      assert.ok(typeof q.text === "string" && q.text.length > 0);
    }
  });

  it("FIVE_B_QUESTIONS contains targeted follow-ups with unique IDs", () => {
    assert.ok(FIVE_B_QUESTIONS.length >= 2);
    const expectedIds = ["arthur", "david-knows"];
    const actualIds = FIVE_B_QUESTIONS.map((q) => q.id);
    assert.deepEqual(actualIds, expectedIds);

    for (const q of FIVE_B_QUESTIONS) {
      assert.ok(typeof q.id === "string" && q.id.length > 0);
      assert.ok(typeof q.text === "string" && q.text.length > 0);
    }
  });

  it("CHECKPOINTS map matches CALIBRATION_BEATS and checkpoint 5b includes follow-up questions", () => {
    assert.equal(CHECKPOINTS.length, CALIBRATION_BEATS.length);

    const cp5b = CHECKPOINTS.find((c) => c.id === "5b");
    assert.ok(cp5b, "Checkpoint 5b must exist");
    assert.deepEqual(cp5b.followUp, FIVE_B_QUESTIONS);

    const non5b = CHECKPOINTS.filter((c) => c.id !== "5b");
    for (const cp of non5b) {
      assert.deepEqual(cp.followUp, []);
    }
  });

  it("makeBlindReaderPrompt formats a prompt and throws on invalid checkpoint", () => {
    const prompt = makeBlindReaderPrompt("5b");
    assert.ok(prompt.includes(MANUSCRIPT_COMMIT));
    assert.ok(prompt.includes("Checkpoint: 5b"));
    assert.ok(prompt.includes("[changed]"));
    assert.ok(prompt.includes("[arthur]"));

    assert.throws(() => makeBlindReaderPrompt("unknown-id"), /Invalid checkpoint/);
  });

  it("checkResponse validates protocol schema and detects errors", () => {
    assert.deepEqual(checkResponse(null), ["Expected a JSON object."]);

    const validResponse = {
      protocol: "reader-river-blind-v1",
      manuscriptCommit: MANUSCRIPT_COMMIT,
      checkpointId: "1a",
      readerId: "reader-06",
      readerKind: "ai",
      completedAt: "2026-10-28T12:00:00Z",
      answers: GENERAL_QUESTIONS.map((q) => ({ questionId: q.id, answer: "Substantive answer" })),
    };
    const errors = checkResponse(validResponse);
    assert.deepEqual(errors, []);

    const invalidResponse = {
      ...validResponse,
      manuscriptCommit: "wrong-sha",
      readerKind: "alien",
      answers: [],
    };
    const invalidErrors = checkResponse(invalidResponse);
    assert.ok(invalidErrors.some((e) => e.includes("Manuscript SHA mismatch")));
    assert.ok(invalidErrors.some((e) => e.includes("readerKind must be ai or human")));
    assert.ok(invalidErrors.some((e) => e.includes("Missing answer")));
  });
});

describe("Reader River Evidence Ledger (evidence-ledger.ts)", () => {
  it("EVIDENCE_COMMIT matches MANUSCRIPT_COMMIT", () => {
    assert.equal(EVIDENCE_COMMIT, MANUSCRIPT_COMMIT);
  });

  it("READER_EVIDENCE records have valid reader IDs, question IDs, finding types, and non-empty claims", () => {
    assert.ok(READER_EVIDENCE.length > 0);

    const validReaderIds = new Set(["reader-06", "reader-07"]);
    const validFindingTypes: Set<FindingType> = new Set([
      "recognition",
      "friction",
      "interpretive_branch",
      "prediction",
    ]);

    const allQuestionIds = new Set([
      ...GENERAL_QUESTIONS.map((q) => q.id),
      ...FIVE_B_QUESTIONS.map((q) => q.id),
    ]);

    for (const record of READER_EVIDENCE) {
      assert.ok(record.id && record.id.trim().length > 0, `Record missing id`);
      assert.ok(validReaderIds.has(record.readerId), `Invalid readerId: ${record.readerId}`);
      assert.equal(record.manuscriptCommit, MANUSCRIPT_COMMIT, `Commit mismatch in record ${record.id}`);
      assert.ok(typeof record.claim === "string" && record.claim.trim().length > 0, `Empty claim in ${record.id}`);
      assert.ok(
        typeof record.responseEvidence === "string" && record.responseEvidence.trim().length > 0,
        `Empty responseEvidence in ${record.id}`
      );
      assert.ok(
        allQuestionIds.has(record.questionId),
        `Unknown questionId '${record.questionId}' in record ${record.id}`
      );
      assert.ok(
        validFindingTypes.has(record.type),
        `Invalid finding type '${record.type}' in record ${record.id}`
      );
    }
  });
});

describe("Reader River Friction Protocol (friction-protocol.ts)", () => {
  it("TEST_WINDOWS contains unique windows with IDs ch01, ch02, ch03", () => {
    assert.equal(TEST_WINDOWS.length, 3);

    const expectedIds = ["ch01", "ch02", "ch03"];
    const actualIds = TEST_WINDOWS.map((w) => w.id);
    assert.deepEqual(actualIds, expectedIds);

    const uniqueIds = new Set(actualIds);
    assert.equal(uniqueIds.size, 3);

    for (const w of TEST_WINDOWS) {
      assert.ok(w.file.startsWith("manuscript/act-1/"));
      assert.ok(w.label.length > 0);
      assert.ok(w.assessorNotes.length > 0);
    }
  });

  it("STUDY_REVISION matches MANUSCRIPT_COMMIT", () => {
    assert.equal(STUDY_REVISION, MANUSCRIPT_COMMIT);
  });

  it("makeFrictionPrompt produces prompt with chapter file and questions, and throws on unknown window ID", () => {
    for (const w of TEST_WINDOWS) {
      const prompt = makeFrictionPrompt(w.id);
      assert.ok(prompt.includes(w.file), `Prompt missing file path ${w.file}`);
      assert.ok(prompt.includes(STUDY_REVISION), `Prompt missing STUDY_REVISION`);
      for (const q of READER_QUESTIONS) {
        assert.ok(prompt.includes(`[${q.id}]`), `Prompt missing question ID ${q.id}`);
      }
    }

    assert.throws(
      () => makeFrictionPrompt("invalid-window" as unknown as Parameters<typeof makeFrictionPrompt>[0]),
      /Unknown window/
    );
  });

  it("validateFrictionResponse validates correctly", () => {
    assert.deepEqual(validateFrictionResponse(null), ["Expected JSON object"]);

    const validResponse = {
      protocol: STUDY_ID,
      manuscriptCommit: STUDY_REVISION,
      readerId: "reader-06",
      readerKind: "ai" as const,
      windowId: "ch01" as const,
      suppliedFile: "manuscript/act-1/ch01-the-ivy-league.md",
      completedAt: "2026-10-28T12:00:00Z",
      answers: READER_QUESTIONS.map((q) => ({
        questionId: q.id,
        answer: "Detailed reading response",
      })),
    };

    assert.deepEqual(validateFrictionResponse(validResponse), []);

    const invalid = {
      ...validResponse,
      protocol: "bad-protocol",
      manuscriptCommit: "wrong-commit",
      suppliedFile: "wrong-file.md",
    };
    const errors = validateFrictionResponse(invalid);
    assert.ok(errors.some((e) => e.includes("Unexpected protocol")));
    assert.ok(errors.some((e) => e.includes("Manuscript SHA mismatch")));
    assert.ok(errors.some((e) => e.includes("File does not match chapter window")));
  });
});
