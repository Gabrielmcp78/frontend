import type { RiverBridge } from "@/components/ReaderRiverLab";
export type Level = 1 | 2 | 3;
export interface CalibrationBeat {
 id:string; chapter:number; event:string; sourceLines:string;
 uncertainty:Level; urgency:Level; stakes:Level;
 synthesis:"invited"|"at-risk"|"unknown";
 bridge?:RiverBridge["kind"]; question:string;
}
export const MANUSCRIPT_COMMIT="6554b25e7399782fccb226a6b3b4c056e6bf7c29";
export const CALIBRATION_BEATS:CalibrationBeat[]=[
{id:"1a",chapter:1,event:"Exhaustion after the funeral",sourceLines:"1-30",uncertainty:1,urgency:2,stakes:2,synthesis:"invited",question:"Does behavior convey grief without explanation?"},
{id:"1b",chapter:1,event:"Balcony time lapse",sourceLines:"30-82",uncertainty:3,urgency:3,stakes:2,synthesis:"invited",question:"Does the reader infer rather than simply feel lost?"},
{id:"1c",chapter:1,event:"Pavement seam experiment",sourceLines:"136-190",uncertainty:3,urgency:2,stakes:2,synthesis:"invited",question:"Is repeatable perception kept separate from causal proof?"},
{id:"1d",chapter:1,event:"Sublevel infrastructure coda",sourceLines:"226-244",uncertainty:2,urgency:1,stakes:2,synthesis:"at-risk",bridge:"reader_only",question:"Does the narrator explain the anomaly prematurely?"},
{id:"2a",chapter:2,event:"Quantum lecture and disturbance",sourceLines:"1-115",uncertainty:3,urgency:2,stakes:3,synthesis:"unknown",question:"Does theory slow the felt disturbance?"},
{id:"2b",chapter:2,event:"Rune takes the board",sourceLines:"112-190",uncertainty:2,urgency:3,stakes:3,synthesis:"invited",question:"Is Rune's concern and authority legible?"},
{id:"2c",chapter:2,event:"Photograph and intervention",sourceLines:"190-365",uncertainty:3,urgency:3,stakes:3,synthesis:"invited",bridge:"reader_only",question:"Does care emerge from action rather than explanation?"},
{id:"2d",chapter:2,event:"Buried bench",sourceLines:"440-526",uncertainty:3,urgency:2,stakes:3,synthesis:"unknown",question:"Does withheld history sustain curiosity?"},
{id:"3a",chapter:3,event:"Rune in the office",sourceLines:"1-97",uncertainty:3,urgency:1,stakes:2,synthesis:"invited",question:"Is Rune still complex and unresolved?"},
{id:"3b",chapter:3,event:"Arthur's estate papers",sourceLines:"98-130",uncertainty:2,urgency:1,stakes:3,synthesis:"invited",question:"Does avoidance of the signature carry grief?"},
{id:"4a",chapter:4,event:"Quartet and Celeste's plea",sourceLines:"40-160",uncertainty:2,urgency:2,stakes:3,synthesis:"invited",question:"Does music convey estrangement experientially?"},
{id:"4b",chapter:4,event:"Broken cello string and laughter",sourceLines:"160-207",uncertainty:1,urgency:2,stakes:2,synthesis:"invited",bridge:"recognition",question:"Does failure create felt connection?"},
{id:"5a",chapter:5,event:"Solitude and altered binder",sourceLines:"1-54",uncertainty:3,urgency:1,stakes:2,synthesis:"unknown",question:"Does solitude maintain tension without urgency?"},
{id:"5b",chapter:5,event:"Arthur's voice and memories",sourceLines:"54-146",uncertainty:3,urgency:1,stakes:3,synthesis:"invited",bridge:"reader_only",question:"Does the reader synthesize love and criticism independently?"}
];
export const riverProperties=(b:CalibrationBeat)=>({width:b.uncertainty,current:b.urgency,depth:b.stakes,rapids:b.urgency===3&&b.stakes===3});
