"use client";
import { useState } from "react";
import { CALIBRATION_BEATS, MANUSCRIPT_COMMIT, riverProperties } from "@/lib/reader-river/part-one";
import type { CalibrationBeat } from "@/lib/reader-river/part-one";
import Link from "next/link";

const PAD=56, WIDTH=850, STEP=74, HEIGHT=1120;
const lvl=(x:number)=>x===1?"Low":x===2?"Moderate":"High";

export default function PartOneRiverPage(){
 const [active,setActive]=useState(CALIBRATION_BEATS[0].id);
 const [showStakes,setShowStakes]=useState(true);
 const [showPressure,setShowPressure]=useState(true);
 const [showQuestions,setShowQuestions]=useState(true);
 const selected=CALIBRATION_BEATS.find(b=>b.id===active)??CALIBRATION_BEATS[0];
 const positions=CALIBRATION_BEATS.map((b,i)=>{const center=WIDTH/2,half=72+b.uncertainty*42;return {...b,cy:PAD+i*STEP,left:center-half,right:center+half};});
 const bank=(side:"left"|"right")=>positions.map((p,i)=>(i?"L":"M")+(side==="left"?p.left:p.right)+" "+p.cy).join(" ");
 return <main style={{maxWidth:1170,margin:"0 auto",padding:"26px clamp(12px,4vw,40px)",fontFamily:"system-ui, sans-serif",color:"#e5ebe8",background:"#141c22",minHeight:"100vh"}}>
   <nav><Link href="/reader-lab" style={{color:"#a7dbdc"}}>← Trajectory graph</Link></nav>
   <h1>Part One: The River</h1>
   <p><Link href="/reader-lab/testing" style={{color:"#a7dbdc",textDecoration:"underline"}}>Open blind reader testing lab →</Link></p>
   <p style={{maxWidth:850,color:"#b9c7c8"}}>A preliminary editorial calibration of the first five chapters. The river widens with unresolved alternatives, the flow marks urgency, and hazard marks the stakes. These are interpretive assessments—not observed human responses.</p>
   <div style={{display:"flex",gap:16,flexWrap:"wrap",marginBottom:12}}>
     <label><input type="checkbox" checked={showStakes} onChange={e=>setShowStakes(e.target.checked)}/> Show stakes / rapids</label>
     <label><input type="checkbox" checked={showPressure} onChange={e=>setShowPressure(e.target.checked)}/> Show urgency</label>
     <label><input type="checkbox" checked={showQuestions} onChange={e=>setShowQuestions(e.target.checked)}/> Show editorial risk</label>
   </div>
   <div style={{display:"grid",gridTemplateColumns:"minmax(0,1.7fr) minmax(240px,1fr)",gap:14,alignItems:"start"}}>
    <div style={{overflowX:"auto",background:"#e8ece3",borderRadius:12}}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{width:"100%",minWidth:500,height:"auto"}} role="img" aria-label="River-width map of fourteen Part One narrative beats, with chapter progression downstream">
        <defs><linearGradient id="riverH" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#689eae"/><stop offset="50%" stopColor="#b1d4de"/><stop offset="100%" stopColor="#689eae"/></linearGradient></defs>
        <path d={bank("left")+" "+positions.slice().reverse().map(p=>"L"+p.right+" "+p.cy).join(" ")+" Z"} fill="url(#riverH)"/>
        <path d={bank("left")} stroke="#63866c" strokeWidth="6" fill="none"/>
        <path d={bank("right")} stroke="#63866c" strokeWidth="6" fill="none"/>
        {positions.map((p,i)=><g key={p.id}>
          {i>0&&p.chapter!==positions[i-1].chapter&&<line x1="8" y1={p.cy-STEP/2} x2={WIDTH-8} y2={p.cy-STEP/2} stroke="#606e64" strokeDasharray="5 7" opacity=".5"/>}
          {showPressure&&Array.from({length:p.urgency},(_,j)=><path key={j} d={`M${WIDTH/2-24+j*19} ${p.cy-11} q12 8 0 17`} fill="none" stroke="white" strokeWidth="2.4" opacity=".75"/>)}
          {showStakes&&p.stakes===3&&<text x={WIDTH/2} y={p.cy+20} textAnchor="middle" fontSize="12" fill="#163e4d">◆ high stakes {p.urgency===3?"· RAPIDS":""}</text>}
          {p.bridge&&<g><line x1={p.left+15} y1={p.cy-24} x2={p.right-15} y2={p.cy-24} stroke="#806a4d" strokeWidth="7" strokeDasharray={p.bridge==="recognition"?"none":"12 8"}/><text x={WIDTH/2} y={p.cy-34} fontSize="12" textAnchor="middle" fill="#463827">{p.bridge==="recognition"?"Potential shared crossing":"Reader-only inference"}</text></g>}
          <g role="button" tabIndex={0} aria-label={`Inspect chapter ${p.chapter}: ${p.event}`} onClick={()=>setActive(p.id)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setActive(p.id)}}}>
            <rect x="8" y={p.cy-27} width={p.left-25} height="52" rx="8" fill={active===p.id?"#eed0a4":"#d2dfd3"} stroke={active===p.id?"#a56f32":"none"}/>
            <text x="18" y={p.cy-7} fontSize="12" fill="#243d2d" fontWeight="bold">Ch {p.chapter} · {p.id}</text>
            <text x="18" y={p.cy+11} fontSize="11" fill="#243d2d">{p.event.slice(0,27)}</text>
            <rect x={p.right+15} y={p.cy-23} width={WIDTH-p.right-30} height="45" rx="8" fill={active===p.id?"#f2e7bc":"#d2dfd3"}/>
            <text x={p.right+22} y={p.cy-5} fontSize="11" fill="#243d2d">Uncertainty: {lvl(p.uncertainty)}</text>
            <text x={p.right+22} y={p.cy+12} fontSize="11" fill="#243d2d">Synthesis: {p.synthesis}</text>
          </g>
        </g>)}
        <text x={WIDTH/2} y={HEIGHT-14} fill="#234e61" fontSize="14" textAnchor="middle">Narrative progression downstream ↓</text>
      </svg>
    </div>
    <aside style={{border:"1px solid #425259",borderRadius:12,padding:16,position:"sticky",top:14}}>
     <h2 style={{fontSize:18}}>Chapter {selected.chapter}</h2>
     <p><strong>{selected.event}</strong></p>
     <p>Unresolved possibilities: {lvl(selected.uncertainty)}<br/>Urgency: {lvl(selected.urgency)}<br/>Stakes: {lvl(selected.stakes)}</p>
     <p><strong>Synthesis opportunity:</strong> {selected.synthesis}</p>
     {showQuestions&&<p><strong>Question to test with readers:</strong> {selected.question}</p>}
     <p style={{fontSize:12,color:"#a9bbbf"}}>Source: Chapter {selected.chapter}, lines {selected.sourceLines}<br/>Pinned SHA: {MANUSCRIPT_COMMIT.slice(0,12)}</p>
     <p style={{fontSize:12,color:"#b1c3c2"}}>Bank placement for David and reader is deliberately not scored: we have not yet defined and validated separate comprehension rubrics. Bridge labels are editorial hypotheses, not observed crossings.</p>
    </aside>
   </div>
 </main>
}
