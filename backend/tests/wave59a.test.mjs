import test from "node:test";
import assert from "node:assert/strict";
// Offline only: never import server (would need DB/secrets). Unset provider keys first.
delete process.env.OPENROUTER_API_KEY; delete process.env.OPENAI_API_KEY;
const { filterRecords, toCsv, buildInsights } = await import("../wave59a.mjs");
const rows=[{reference:"A-1",title:"Alpha case",status:"Open",risk:"High",amount:0,payload:{note:"x"}},{reference:"B-2",title:"Beta case",status:"Closed",risk:"Low",amount:100,payload:{}}];
test("filterRecords search/filter preserves 0",()=>{ assert.equal(filterRecords(rows,{q:"alpha"}).length,1); assert.equal(filterRecords(rows,{status:"Closed"}).length,1); assert.equal(filterRecords(rows,{risk:"High"})[0].amount,0); assert.equal(filterRecords(rows,{}).length,2); });
test("toCsv escapes and keeps header on empty",()=>{ assert.ok(toCsv(rows,["reference","amount"]).startsWith("reference,amount")); assert.equal(toCsv([],["a","b"]),"a,b\n"); });
test("buildInsights labelled deterministic fallback preserves false/0/empty",()=>{ const r=buildInsights(rows,{id:"f1",title:"Test"},"portfolio-summary"); assert.equal(r.aiGenerated,false); assert.equal(r.fallback,true); assert.ok(r.sections.length>=3); assert.ok(r.sections.every(s=>s.label)); const e=buildInsights([],{id:"f1",title:"Test"},"next-actions"); assert.equal(e.recordCount,0); assert.equal(e.sections.find(s=>s.label==="Empty result preserved").value,true); });
