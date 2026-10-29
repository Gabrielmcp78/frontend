"use client";
import {useState} from "react";
import Link from "next/link";
import {makeFrictionPrompt,TEST_WINDOWS,STUDY_REVISION,validateFrictionResponse,type FrictionResponse,type FrictionWindowId} from "@/lib/reader-river/friction-protocol";
export default function FrictionStudy(){
 const [windowId,setWindowId]=useState<FrictionWindowId>("ch01");
 const [raw,setRaw]=useState("");
 const [responses,setResponses]=useState<FrictionResponse[]>([]);
 const [notice,setNotice]=useState("");
 const prompt=makeFrictionPrompt(windowId);
 function add(){
  try{
   const parsed:unknown=JSON.parse(raw),errors=validateFrictionResponse(parsed);
   if(errors.length){setNotice(errors.join(" | "));return;}
   const r=parsed as FrictionResponse;
   if(responses.some(x=>x.readerId===r.readerId&&x.windowId===r.windowId)){setNotice("Duplicate reader and chapter. Remove earlier response first.");return;}
   setResponses(prev=>[...prev,r]);setRaw("");setNotice("Validated in memory. Export to retain.");
  }catch(e){setNotice("Invalid JSON: "+String(e))}
 }
 function exportData(){
  const blob=new Blob([JSON.stringify({protocol:"reader-river-friction-v1",manuscriptCommit:STUDY_REVISION,responses},null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="reader-river-friction-responses.json";a.click();URL.revokeObjectURL(url);
 }
 return <main style={{maxWidth:940,margin:"auto",padding:"28px 20px",fontFamily:"system-ui,sans-serif",lineHeight:1.5}}>
  <nav><Link href="/reader-lab/evidence">← Evidence ledger</Link></nav>
  <h1>Reader Friction Study</h1>
  <p>This independent follow-up measures reported rereading, reader orientation, and narrative attention without revealing suspected issues. Source SHA: <code>{STUDY_REVISION}</code>.</p>
  <p style={{padding:12,border:"1px solid #9e936d",borderRadius:8}}>Each agent gets only the selected complete chapter and the neutral questions. Do not supply the evidence ledger, previous results, or editorial hypotheses. Start a fresh session for each reader.</p>
  <label htmlFor="window">Chapter to assess</label>
  <select id="window" value={windowId} onChange={e=>setWindowId(e.target.value as FrictionWindowId)} style={{display:"block",margin:"8px 0 16px",padding:9}}>
   {TEST_WINDOWS.map(w=><option key={w.id} value={w.id}>{w.label}</option>)}
  </select>
  <h2>1 · Reader instructions</h2>
  <textarea aria-label="Blind reader instructions" readOnly value={prompt} rows={15} style={{width:"100%",padding:12,fontFamily:"monospace",fontSize:12}}/>
  <p><button onClick={()=>navigator.clipboard.writeText(prompt).then(()=>setNotice("Copied. Supply exact chapter separately.")).catch(()=>setNotice("Clipboard unavailable."))}>Copy blind prompt</button></p>
  <h2>2 · Import individual responses</h2>
  <textarea aria-label="Reader JSON response" value={raw} onChange={e=>setRaw(e.target.value)} placeholder="Paste one reader response as JSON" rows={9} style={{width:"100%",padding:12,fontFamily:"monospace",fontSize:12}}/>
  <p><button onClick={add}>Validate and add</button> <button disabled={responses.length===0} onClick={exportData}>Export {responses.length} responses</button></p>
  <p role="status">{notice}</p>
  <h2>Collected responses</h2>
  {responses.length===0?<p>No reader responses imported yet.</p>:<ul>{responses.map((r,i)=><li key={r.readerId+"-"+r.windowId}>{r.readerId} · {r.windowId} · {r.model??r.readerKind} <button onClick={()=>setResponses(prev=>prev.filter((_,j)=>j!==i))}>Remove</button></li>)}</ul>}
  <p style={{fontSize:13,opacity:.75}}>No API calls or permanent server storage. Browser refresh clears imported responses; export before leaving. This test cannot independently verify a reader&apos;s isolation or supplied files.</p>
 </main>;
}
