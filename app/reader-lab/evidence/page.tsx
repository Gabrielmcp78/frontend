"use client";
import {useMemo,useState} from "react";
import Link from "next/link";
import {READER_EVIDENCE,EVIDENCE_COMMIT,type FindingType} from "@/lib/reader-river/evidence-ledger";
export default function EvidenceLedgerPage(){
 const [reader,setReader]=useState("all");
 const [stage,setStage]=useState("all");
 const [kind,setKind]=useState("all");
 const rows=useMemo(()=>READER_EVIDENCE.filter(x=>(reader==="all"||x.readerId===reader)&&(stage==="all"||x.elicitation===stage)&&(kind==="all"||x.type===kind)),[reader,stage,kind]);
 return <main style={{maxWidth:1050,margin:"0 auto",padding:"30px 22px",fontFamily:"system-ui,sans-serif",lineHeight:1.5}}>
 <nav><Link href="/reader-lab/testing">← Blind Reader Lab</Link></nav>
 <h1>Reader Evidence Ledger · Part One</h1>
 <p><Link href="/reader-lab/friction" style={{textDecoration:"underline"}}>Open independent friction study →</Link></p>
 <p>Independent responses are kept separate, including their disagreements. All entries below are analyst-coded claims from the supplied staged AI responses, not human-reader measurements. Unprompted observations and targeted follow-ups are labeled separately.</p>
 <p><strong>Text revision:</strong> <code>{EVIDENCE_COMMIT}</code> · <strong>Checkpoint:</strong> 5b · <strong>Models:</strong> Gemini 3.8 Flash (two sessions)</p>
 <div style={{display:"flex",flexWrap:"wrap",gap:12,margin:"20px 0"}}>
 <label>Reader <select value={reader} onChange={e=>setReader(e.target.value)}><option value="all">Both</option><option>reader-06</option><option>reader-07</option></select></label>
 <label>Question stage <select value={stage} onChange={e=>setStage(e.target.value)}><option value="all">Both</option><option value="stage1_unprompted">Stage 1 — unprompted</option><option value="stage2_targeted">Stage 2 — prompted</option></select></label>
 <label>Evidence <select value={kind} onChange={e=>setKind(e.target.value)}><option value="all">All</option>{(["recognition","interpretive_branch","friction","prediction"] as FindingType[]).map(v=><option key={v} value={v}>{v.replaceAll("_"," ")}</option>)}</select></label>
 </div>
 <div style={{display:"grid",gap:12}}>
 {rows.map(r=><article key={r.id} style={{padding:16,border:"1px solid #77818a",borderRadius:8}}>
 <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
 <strong>{r.scene}</strong><small>{r.readerId} · {r.elicitation==="stage1_unprompted"?"Stage 1, unprompted":"Stage 2, targeted"}</small>
 </div><p style={{margin:"8px 0"}}>{r.claim}</p>
 <blockquote style={{borderLeft:"3px solid #8195a5",paddingLeft:12,margin:"12px 0"}}>“{r.responseEvidence}”</blockquote>
 <small>Reader answer: <code>{r.questionId}</code> · Category: {r.type.replaceAll("_"," ")} · Editorial coding: {r.editorialStatus}</small>
 </article>)}
 </div>
 <p style={{marginTop:24,fontSize:13}}>A shared observation is not proof of authorial intent, nor of human-reader response. No coordinates or river-bank distances have been inferred. The quoted fragments are excerpts from the submitted AI responses; consult full raw output for surrounding context.</p>
 </main>;
}
