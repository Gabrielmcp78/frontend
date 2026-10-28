import {MANUSCRIPT_COMMIT} from "@/lib/reader-river/part-one";

/** Neutral rereading experiment. Reader sees ONLY readerPrompt, never assessorNotes. */
export const STUDY_ID="reader-river-friction-v1";
export const STUDY_REVISION=MANUSCRIPT_COMMIT;
export const READER_QUESTIONS=[
 {id:"retell",text:"In your own words, describe what happened in the passage, in chronological order."},
 {id:"uncertainty",text:"Which facts are clear to you, and which remain uncertain? Distinguish questions about what happened from questions about why."},
 {id:"reread",text:"Identify any exact sentence or transition you needed to reread. If none, say none. What caused the rereading?"},
 {id:"engagement",text:"Where, if anywhere, did your attention weaken or strengthen? Identify the passage and describe your experience without trying to diagnose the author's intention."},
 {id:"information",text:"Is there information you needed in order to follow the passage but did not have? If so, what?"},
 {id:"continue",text:"What question or feeling, if any, makes you want to continue reading?"}
] as const;
export const TEST_WINDOWS=[
 {id:"ch01",label:"Chapter 1 — complete chapter",file:"manuscript/act-1/ch01-the-ivy-league.md",assessorNotes:"Check balcony clock arithmetic and how readers distinguish abrupt chronology from intentional time loss."},
 {id:"ch02",label:"Chapter 2 — complete chapter",file:"manuscript/act-1/ch02-the-lecture.md",assessorNotes:"Check physical chronology of lecture, Polaroid, intervention, board writing and cognitive cost of theory."},
 {id:"ch03",label:"Chapter 3 — complete chapter",file:"manuscript/act-1/ch03-the-office.md",assessorNotes:"Check whether Rune's office dialogue sustains tension or repeats already known information."}
] as const;
export type FrictionWindowId=typeof TEST_WINDOWS[number]["id"];
export interface FrictionAnswer {questionId:string;answer:string;passageEvidence?:string}
export interface FrictionResponse {
 protocol:"reader-river-friction-v1";
 manuscriptCommit:string;
 readerId:string;
 readerKind:"ai"|"human";
 model?:string;
 windowId:FrictionWindowId;
 suppliedFile:string;
 completedAt:string;
 answers:FrictionAnswer[];
}
export function makeFrictionPrompt(windowId:FrictionWindowId):string{
 const w=TEST_WINDOWS.find(w=>w.id===windowId);
 if(!w)throw Error("Unknown window");
 return [
  "Independent first-reading session. You are receiving one complete chapter of a novel.",
  "Read only the supplied chapter. Do not access other chapters, editorial notes, prior reader reports, author intent, or future events.",
  "Answer candidly. Do not assume a passage has a problem. Specific praise, confusion or no friction are equally legitimate outcomes.",
  "Use the supplied text alone. Do not infer context from the name of this testing protocol.",
  "Manuscript revision: "+STUDY_REVISION,
  "Chapter file to supply separately: "+w.file,
  "After reading, answer each question in order:",
  ...READER_QUESTIONS.map((q,i)=>`${i+1}. [${q.id}] ${q.text}`),
  "Return JSON containing protocol, manuscriptCommit, readerId, readerKind, model, windowId, suppliedFile, completedAt and answers as questionId/answer/passageEvidence objects.",
  "Never invent quotations. If an answer is an inference, mark it as an inference."
 ].join("\n\n");
}
export function validateFrictionResponse(value:unknown):string[]{
 const errors:string[]=[];
 if(!value||typeof value!=="object")return ["Expected JSON object"];
 const r=value as Partial<FrictionResponse>;
 if(r.protocol!==STUDY_ID)errors.push("Unexpected protocol");
 if(r.manuscriptCommit!==STUDY_REVISION)errors.push("Manuscript SHA mismatch");
 const w=TEST_WINDOWS.find(w=>w.id===r.windowId);
 if(!w)errors.push("Unknown chapter window");
 else if(w.file!==r.suppliedFile)errors.push("File does not match chapter window");
 if(!r.readerId?.trim())errors.push("Missing readerId");
 if(!["ai","human"].includes(r.readerKind??""))errors.push("Invalid readerKind");
 if(!Array.isArray(r.answers))errors.push("Missing answers array");
 else for(const q of READER_QUESTIONS){
  const match=r.answers.find(a=>a?.questionId===q.id);
  if(!match||typeof match.answer!=="string"||!match.answer.trim())errors.push("Missing answer: "+q.id);
 }
 return errors;
}
