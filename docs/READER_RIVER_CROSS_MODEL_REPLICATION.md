# Reader River — Independent Model-Family Replication

## Purpose
Test whether Chapter 4's musical/emotional inference and Chapter 5's Arthur inference arise in a fresh, different model-family session, without stage-2 priming. This study tests AI reader simulations, **not human reception**.

## Fixed inputs
Manuscript Git SHA: `6554b25e7399782fccb226a6b3b4c056e6bf7c29`.
Five files, **in manuscript order**:
`manuscript/act-1/ch01-the-ivy-league.md`,
`manuscript/act-1/ch02-the-lecture.md`,
`manuscript/act-1/ch03-the-office.md`,
`manuscript/act-1/ch04-the-rehearsal.md`,
`manuscript/act-1/ch05-the-apartment.md`.

Do not provide prior reader JSON, this evidence ledger, manuscript synopsis/worldbook, editorial questions, our river model, or future chapters. Verify the file SHA/content actually match the pinned revision. Use a fresh isolated session and record model/provider/version, supplied content, prompt, time and stage outputs.

## Stage 1 — reveal only this
> Read Chapters 1–5 as a first-time reader. Do not assume access to any other chapters or commentary. Answer candidly and support interpretations with concrete passage details. It is legitimate to feel confused, to disagree with an apparent implication, or to decide not to continue.
>
> 1. What changed, if anything, in your understanding of David? When?
> 2. What do you understand about David's relationships? Which details led you there?
> 3. What do you believe is happening? What remains genuinely uncertain?
> 4. What might happen next, and why?
> 5. Which moment stayed with you most strongly, and why?
> 6. Where did you experience confusion, impatience, disengagement or excessive explanation, if anywhere?
> 7. Would you voluntarily continue reading? What makes you say so?

Save the **unaltered** Stage 1 response to an immutable file BEFORE releasing Stage 2. Record a checksum, UTC timestamp, unique reader ID and the exact prompt. Do not request a rewrite of Stage 1 after revealing Stage 2.

## Stage 2 — only after Stage 1 is locked
> 8. How would you describe Arthur's relationship with David? What led you there?
> 9. What might David understand about Arthur that he has difficulty accepting, if anything?

Save the Stage 2 answers separately. Never merge or backfill them into Stage 1.

## Output structure
A JSON object with `protocol: "reader-river-staged-v2"`, `manuscriptCommit`, `checkpointId: "5b"`, `readerId`, `readerKind: "ai"`, `model`, `suppliedFiles`, `stage1CompletedAt`, `stage1SHA256`, `stage1_answers`, `stage2CompletedAt`, and `stage2_answers`. Every answer has `questionId` and `answer`.

## Evaluation
Have an **independent assessor** compare the full verbatim responses, checking factual support against the manuscript, spontaneous vs prompted synthesis, alternate interpretations, specific friction points and possible overconfidence. The assessor must not claim that shared model responses prove human engagement. Preserve disagreements; no automatic numerical river-bank placement.

## Access
The independent reader should not see this instruction's discussion of expected Arthur/Chapter 4 outcomes. Give the reader **only the stage text above and the manuscript**; keep this research rationale with the operator.
