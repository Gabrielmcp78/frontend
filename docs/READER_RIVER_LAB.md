# Reader River Laboratory — initial implementation

## Scope
`components/ReaderRiverLab.tsx` is a deliberately isolated client-side visualization component. It has **not** been wired into `app/page.tsx` and does not change editor/formatter/governance paths.

## Usage
Supply `observations` and `bridges` plus `manuscriptCommit` and optionally `onSelectScene`. Observations explicitly carry `sourceId`, `manuscriptCommit`, `assessedAt`, `dimension`, `evidence`, `order`, and David/reader values. Missing scores are null. No sample values are fabricated.

## Research guardrails
- David and reader are separate curves. Reader minus David is a computed difference, not the primary measure.
- Target corridor is editorial intent; **it is not a statistical confidence interval**.
- Human-reader, simulated-panel, and editorial estimates remain distinct; no combined average is computed.
- Bridge events can represent shared recognition, misunderstanding, delayed comprehension, or reader-only understanding.
- Each observation is linked to a source and immutable manuscript commit for reproducibility.
- Never treat empty or partial evidence as negative reader feedback.
- A future reader survey must collect voluntary, informed responses without implying simulation equals empirical data.

## Integration checklist
1. Typecheck with `npx tsc --noEmit` in the exact checked-out frontend commit, then run `npm run build`.
2. Review keyboard accessibility and narrow screen layout; verify pointer and keyboard scene selection.
3. Add FastAPI read-only endpoints to serve pin-verified scene IDs and observations from per-project SQLite.
4. Write rubrics for each dimension rather than averaging distinct scales into one vaguely defined 'knowledge' number.
5. Define persisted bridge annotations and source provenance. Test missing-data and stale-commit behavior.
6. Mount in the existing Story Intelligence workspace **after** verification; avoid editing the monolithic `app/page.tsx` until the latest local studio changes are reconciled.
7. Only then build beta-reader authenticated input and scientifically described intervals / hierarchical estimators where data warrants them.

## Manuscript authority
`Gabrielmcp78/string-theories-v11` on `main`; local source directory `/Volumes/Ready500/string-theories-v11/manuscript`. Analyses must pin the exact read commit per session. The manuscript is not a submodule of `LITSTUDIO_MASTER`.
