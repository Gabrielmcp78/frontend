import {CALIBRATION_BEATS,MANUSCRIPT_COMMIT} from "@/lib/reader-river/part-one";

export type ReaderKind="ai"|"human";
export interface BlindResponse {
  protocol:"reader-river-blind-v1";
  manuscriptCommit:string;
  checkpointId:string;
  readerId:string;
  readerKind:ReaderKind;
  model?:string;
  completedAt:string;
  answers:{questionId:string;answer:string}[];
  passagesNoticed?:string[];
}
export interface BlindAssessment {
 responseId:string; assessorId:string;
 comprehension:0|1|2|3|null;
 independentSynthesis:0|1|2|3|null;
 emotionalInference:0|1|2|3|null;
 productiveUncertainty:0|1|2|3|null;
 engagement:0|1|2|3|null;
 evidence:string[]; alternativeInterpretations:string[];
 notes:string;
}
export const GENERAL_QUESTIONS=[
 {id:"changed",text:"What changed, if anything, in your understanding of David? Point to the moment that changed it."},
 {id:"relationships",text:"What do you understand about David's relationships? Which details led you there?"},
 {id:"questions",text:"What do you believe is happening? What remains genuinely uncertain?"},
 {id:"prediction",text:"What do you expect might happen next, and why?"},
 {id:"moment",text:"Which moment has stayed with you most strongly? What did you make of it?"},
 {id:"friction",text:"Where, if anywhere, did you feel confused, impatient, disengaged, or over-explained? Be specific."},
 {id:"continue",text:"Would you choose to continue reading now? What makes you say that?"}
];
export const FIVE_B_QUESTIONS=[
 {id:"arthur",text:"How would you describe Arthur's relationship with David? What led you to that interpretation?"},
 {id:"david-knows",text:"What might David understand about Arthur that he has difficulty accepting, if anything?"}
];
export const CHECKPOINTS=CALIBRATION_BEATS.map((b,i)=>({
 id:b.id,chapter:b.chapter,ordinal:i+1,title:b.event,
 sourceLines:b.sourceLines,questions:GENERAL_QUESTIONS,
 followUp:b.id==="5b"?FIVE_B_QUESTIONS:[],
}));
export const RESPONSE_SCHEMA_EXAMPLE:BlindResponse={
 protocol:"reader-river-blind-v1",manuscriptCommit:MANUSCRIPT_COMMIT,
 checkpointId:"5b",readerId:"reader-01",readerKind:"ai",
 model:"enter exact provider/model if AI",completedAt:"",
 answers:GENERAL_QUESTIONS.map(q=>({questionId:q.id,answer:""})).concat(FIVE_B_QUESTIONS.map(q=>({questionId:q.id,answer:""}))),
 passagesNoticed:[]
};
export function checkResponse(x:unknown):string[]{
 const e:string[]=[];
 if(!x||typeof x!=="object")return ["Expected a JSON object."];
 const r=x as Partial<BlindResponse>;
 if(r.protocol!=="reader-river-blind-v1")e.push("Protocol must be reader-river-blind-v1.");
 if(r.manuscriptCommit!==MANUSCRIPT_COMMIT)e.push("Manuscript SHA mismatch; don't mix manuscript revisions.");
 const cp=CHECKPOINTS.find(c=>c.id===r.checkpointId);
 if(!cp)e.push("Unknown checkpoint ID.");
 if(!r.readerId?.trim())e.push("readerId required.");
 if(!["ai","human"].includes(r.readerKind??""))e.push("readerKind must be ai or human.");
 if(!Array.isArray(r.answers))e.push("answers must be an array.");
 else {
  for(const q of [...GENERAL_QUESTIONS,...(cp?.followUp??[])]){
   const a=r.answers.find(a=>a.questionId===q.id);
   if(!a||typeof a.answer!=="string"||!a.answer.trim())e.push("Missing answer: "+q.id);
  }
 }
 return e;
}
export function makeBlindReaderPrompt(checkpointId:string){
 const cp=CHECKPOINTS.find(c=>c.id===checkpointId);
 if(!cp)throw Error("Invalid checkpoint");
 const questions=[...cp.questions,...cp.followUp];
 return [
  "BLIND READER SESSION — Reader River Protocol v1",
  "Read the supplied manuscript excerpt as a first-time reader, without knowledge of future chapters.",
  "Do not use or request editorial targets, author notes, river scores, or any existing analysis.",
  "Answer from your immediate reading experience. Admit uncertainty; do not guess what the author wants.",
  "First read the text. Then answer the following in order. Do not see later chapters.",
  "Manuscript commit: "+MANUSCRIPT_COMMIT,
  "Checkpoint: "+cp.id+" (Chapter "+cp.chapter+")",
  "STOP RULE: Include only manuscript material up to this checkpoint; supply its exact excerpt separately.",
  ...questions.map((q,i)=>(i+1)+". ["+q.id+"] "+q.text),
  "Include specific textual details where possible. Avoid claims of measured human emotion.",
  "Return one JSON object matching: "+JSON.stringify({...RESPONSE_SCHEMA_EXAMPLE,checkpointId:cp.id,answers:questions.map(q=>({questionId:q.id,answer:"YOUR RESPONSE"}))}),
 ].join("\n\n");
}
