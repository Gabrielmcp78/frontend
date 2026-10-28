"use client";
import {useState} from "react";
import Link from "next/link";
import {CHECKPOINTS,MANUSCRIPT_COMMIT,makeBlindReaderPrompt,checkResponse,type BlindResponse} from "@/lib/reader-river/blind-protocol";
export default function ReaderTestingPage(){
 const [selected,setSelected]=useState("5b");
 const [raw,setRaw]=useState("");
 const [results,setResults]=useState<BlindResponse[]>([]);
 const [notice,setNotice]=useState("");
 const checkpoint=CHECKPOINTS.find(c=>c.id===selected)??CHECKPOINTS[0];
 function saveResponse(){
  try{
   const parsed:unknown=JSON.parse(raw);
   const errs=checkResponse(parsed);
   if(errs.length){setNotice(errs.join(" | "));return;}
   const r=parsed as BlindResponse;
   if(results.some(x=>x.readerId===r.readerId&&x.checkpointId===r.checkpointId)){setNotice("Duplicate reader/checkpoint. Use another reader ID or remove the prior entry.");return;}
   setResults(prev=>[...prev,r]);setRaw("");setNotice("Validated in browser memory. Export the data to retain it.");
  }catch(e){setNotice("Invalid JSON: "+String(e))}
 }
 function exportResponses(){
  const blob=new Blob([JSON.stringify({protocol:"reader-river-blind-v1",manuscriptCommit:MANUSCRIPT_COMMIT,responses:results},null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="reader-river-blind-responses.json";a.click();URL.revokeObjectURL(url);
 }
 return <main style={{maxWidth:900,margin:"auto",padding:"32px 20px",fontFamily:"system-ui, sans-serif",lineHeight:1.5}}>
  <nav><Link href="/reader-lab/part-one">← River map</Link></nav>
  <h1>Blind Reader Lab · Part One</h1>
  <p>Create independent reader prompts and import responses. This manual tool does not invoke AI models or retrieve manuscript excerpts.</p>
  <p style={{border:"1px solid #b08a45",borderRadius:8,padding:12}}>Manuscript lock: <code>{MANUSCRIPT_COMMIT}</code>. Supply text separately and stop at the selected checkpoint. Keep editorial scores, future chapters and other readers' answers hidden from each reader agent.</p>
  <label htmlFor="checkpoint"><strong>Reading checkpoint</strong></label>
  <select id="checkpoint" value={selected} onChange={e=>setSelected(e.target.value)} style={{display:"block",padding:9,maxWidth:"100%",margin:"8px 0 16px"}}>
   {CHECKPOINTS.map(c=><option key={c.id} value={c.id}>Ch {c.chapter} · {c.id}: {c.title}</option>)}
  </select>
  <h2>1. Reader prompt</h2>
  <p>Copy this into a fresh reader-agent session, then provide the exact manuscript text up to the checkpoint. The broad questions are asked before any targeted follow-up.</p>
  <textarea readOnly value={makeBlindReaderPrompt(checkpoint.id)} rows={16} style={{width:"100%",fontFamily:"monospace",fontSize:12,padding:12}}/>
  <div><button onClick={()=>navigator.clipboard.writeText(makeBlindReaderPrompt(checkpoint.id)).then(()=>setNotice("Prompt copied. Provide manuscript text separately.")).catch(()=>setNotice("Clipboard unavailable; select text manually."))} style={{padding:10,cursor:"pointer"}}>Copy prompt</button></div>
  <h2>2. Import reader response</h2>
  <p>Paste the response JSON below. Validation enforces source version, checkpoint, and nonempty answers. No scores are invented.</p>
  <textarea value={raw} onChange={e=>setRaw(e.target.value)} rows={10} placeholder="Paste reader response JSON" style={{width:"100%",fontFamily:"monospace",fontSize:12,padding:12}}/>
  <div style={{display:"flex",gap:12,marginTop:8}}>
   <button onClick={saveResponse} style={{padding:10,cursor:"pointer"}}>Validate and add</button>
   <button onClick={exportResponses} disabled={!results.length} style={{padding:10,cursor:"pointer"}}>Export {results.length} responses</button>
  </div>
  <p role="status">{notice}</p>
  <h2>Collected responses ({results.length})</h2>
  <ul>{results.map((r,i)=><li key={r.readerId+"-"+r.checkpointId}>{r.readerId} · {r.checkpointId} · {r.readerKind} <button onClick={()=>setResults(prev=>prev.filter((_,j)=>j!==i))}>Remove</button></li>)}</ul>
  <p style={{fontSize:13,opacity:.75}}>Responses are held only in this page's memory until exported. Refreshing the browser clears them. Human reader observations and AI reader simulations must be analyzed separately.</p>
 </main>;
}
