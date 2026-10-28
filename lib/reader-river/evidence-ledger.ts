/** Evidence-ledger v1. Interpretive coding of two supplied staged AI-reader responses.
 * The underlying responses remain in the supplied dataset; these are analyst-coded claims,
 * NOT human observations or objective narrative measurements.
 */
export type Elicitation="stage1_unprompted"|"stage2_targeted";
export type FindingType="recognition"|"interpretive_branch"|"friction"|"prediction";
export interface ReaderEvidence {
 id:string;checkpointId:"5b";manuscriptCommit:string;
 readerId:"reader-06"|"reader-07";model:string;
 elicitation:Elicitation;questionId:string;type:FindingType;
 scene:string;claim:string;responseEvidence:string;
 editorialStatus:"hypothesis"|"requires_verification";
}
export const EVIDENCE_COMMIT="6554b25e7399782fccb226a6b3b4c056e6bf7c29";
const meta={checkpointId:"5b" as const,manuscriptCommit:EVIDENCE_COMMIT,model:"Gemini 3.8 Flash",editorialStatus:"hypothesis" as const};
export const READER_EVIDENCE:ReaderEvidence[]=[
{...meta,id:"06-arthur",readerId:"reader-06",elicitation:"stage1_unprompted",questionId:"relationships",type:"recognition",scene:"Chapter 5 · Arthur's recital memory",claim:"Arthur communicates affection through technical criticism.",responseEvidence:"love was mediated through critique"},
{...meta,id:"07-arthur",readerId:"reader-07",elicitation:"stage1_unprompted",questionId:"relationships",type:"recognition",scene:"Chapter 5 · Arthur's recital memory",claim:"Arthur's approval was indirect; David continued seeking it.",responseEvidence:"withheld easy praise"},
{...meta,id:"06-celeste",readerId:"reader-06",elicitation:"stage1_unprompted",questionId:"moment",type:"recognition",scene:"Chapter 4 · Adagio",claim:"David converts Celeste's emotional outreach into mathematical analysis.",responseEvidence:"intellectualization as an involuntary defense mechanism"},
{...meta,id:"07-celeste",readerId:"reader-07",elicitation:"stage1_unprompted",questionId:"moment",type:"recognition",scene:"Chapter 4 · Adagio",claim:"David uses physics as a defense against emotional intimacy.",responseEvidence:"weaponizes physics against intimacy"},
{...meta,id:"06-balcony",readerId:"reader-06",elicitation:"stage1_unprompted",questionId:"friction",type:"friction",scene:"Chapter 1 · Balcony",claim:"Clock arithmetic and travel intervals briefly burden orientation.",responseEvidence:"exact pacing of elapsed time slightly confusing"},
{...meta,id:"07-balcony",readerId:"reader-07",elicitation:"stage1_unprompted",questionId:"friction",type:"friction",scene:"Chapter 1 · Balcony",claim:"Time discontinuity initially resembles an editing jump.",responseEvidence:"momentarily felt like an editing discontinuity or a daydream"},
{...meta,id:"06-rune",readerId:"reader-06",elicitation:"stage1_unprompted",questionId:"friction",type:"friction",scene:"Chapter 3 · Rune's office",claim:"Rune's dialogue register feels theatrical relative to the preceding crisis.",responseEvidence:"momentarily stylized and theatrical"},
{...meta,id:"07-rune",readerId:"reader-07",elicitation:"stage1_unprompted",questionId:"friction",type:"friction",scene:"Chapter 2 · Classroom",claim:"Rune's fluent lecture takeover feels theatrical during a medical crisis.",responseEvidence:"slightly theatrical and hyper-articulate"},
{...meta,id:"07-string",readerId:"reader-07",elicitation:"stage1_unprompted",questionId:"friction",type:"friction",scene:"Chapter 4 · Broken C string",claim:"String break risks familiar symbolism before laughter changes its effect.",responseEvidence:"slightly conventional as a metaphor"},
{...meta,id:"06-father",readerId:"reader-06",elicitation:"stage2_targeted",questionId:"david-knows",type:"interpretive_branch",scene:"Chapter 5 · Mirror and recital",claim:"David recognizes an unattainable kind of explicit validation and his inherited reserve.",responseEvidence:"approval would always remain confined to a technical critique"},
{...meta,id:"07-father",readerId:"reader-07",elicitation:"stage2_targeted",questionId:"david-knows",type:"interpretive_branch",scene:"Chapter 5 · Mirror and recital",claim:"Reader links academic safety to paternal validation and avoidance of vulnerability.",responseEvidence:"elaborate structure built to seek external validation"},
{...meta,id:"06-bench",readerId:"reader-06",elicitation:"stage1_unprompted",questionId:"prediction",type:"prediction",scene:"Chapter 2–5 · Bench",claim:"Predicts return to investigate the buried case.",responseEvidence:"return to the quad bench to unearth or investigate"},
{...meta,id:"07-bench",readerId:"reader-07",elicitation:"stage1_unprompted",questionId:"prediction",type:"prediction",scene:"Chapter 2–5 · Bench",claim:"Predicts David will confront the buried case and Celeste.",responseEvidence:"driven to confront what lies buried beneath the quad bench"}
];
