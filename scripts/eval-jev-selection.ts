// Opt-in offline comparison. Does not write analyses, articles or public projections.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { parseGold, goldInput, summarizeDecisions, JEV_QUESTIONS, type Decision } from '../packages/backend/src/editorial/jev-selection.ts';
import { JEV_POLICY_VERSION, JEV_MODEL, JEV_RULES, AXES, CAPS, WEIGHTS } from '@aihot/industry/jev-selection';
import { SELECTION } from '@aihot/industry/selection';

const {values}=parseArgs({options:{gold:{type:'string',default:'.data/gold.jsonl'},n:{type:'string',default:'200'},split:{type:'string',default:'all'},baseline:{type:'string'},out:{type:'string',default:'.data/eval'},label:{type:'string'},'dry-run':{type:'boolean'},'no-import':{type:'boolean'}}});
const n=Number(values.n);
if(!Number.isSafeInteger(n)||n<1||n>2000) throw new Error('--n must be an integer from 1 to 2000');
if(!['all','development','holdout'].includes(values.split!)) throw new Error('invalid --split');
const raw=readFileSync(path.resolve(values.gold!),'utf8');
const all=parseGold(raw);
const cases=all.filter(r=>values.split==='all'||r.samplingContext?.benchmarkSplit===values.split).slice(0,n);
if(!cases.length) throw new Error('no cases in requested split');
if(values['dry-run']) {
  console.log(JSON.stringify({dryRun:true,n:cases.length,caseIds:cases.map(r=>r.caseId),split:values.split,baseline:values.baseline??null,paidCalls:0}));
} else {
  // Import infrastructure only after all input checks and the no-network dry-run path.
  const {config}=await import('@aihot/backend/config');
  const {sql,closeDb}=await import('@aihot/backend/db');
  try {
    if(!config.modelCallsEnabled) throw new Error('Model calls are disabled; set MODEL_CALLS_ENABLED=true for an intentional evaluation');
    const {MODELS}=await import('@aihot/backend/providers/llm');
    if(values.baseline&&!MODELS[values.baseline]) throw new Error('unknown baseline model');
    const {evaluateJev}=await import('@aihot/backend/providers/jev');
    const {runAnalysis,normalizeAnalysis,ANALYZE_PROMPT_VERSION}=await import('@aihot/backend/editorial/analyze');
    const {completeReceipt}=await import('@aihot/backend/providers/receipts');
    const {importSelectBenchRun}=await import('@aihot/backend/admin/selectbench');
    type Case={caseId:string;title:string;stratum:string|null;gold:'select'|'reject'|'either';decision:Decision|null;score:number|null;reason:string|null;receiptId:number|null;error:string|null;[key:string]:unknown};
    const models:Record<string,{summary:Record<string,unknown>;cases:Case[];mistakes:Case[]}>={};
    for(const model of ['jev-five-axis',...(values.baseline?[`baseline:${values.baseline}`]:[])]) {
      const results:Case[]=[];const started=Date.now();
      for(const row of cases) {
        const c:Case={caseId:row.caseId,title:row.material.title,stratum:row.samplingContext?.samplingStratum??null,gold:row.gold.decision,decision:null,score:null,reason:null,receiptId:null,error:null};
        const begin=Date.now();
        try {
          const a=goldInput(row);
          if(model==='jev-five-axis') {
            const r=await evaluateJev(a);
            Object.assign(c,{decision:r.decision,score:r.score,rawScore:r.score,threshold:r.threshold,relevance:r.relevance,category:r.category,reason:r.reasonCodes.join(','),signals:r.signals,receiptId:r.receiptId,receiptIds:[r.receiptId],reused:r.reused,usage:r.usage,providerLatencyMs:r.latencyMs});
          } else {
            const run=await runAnalysis(a,{stages:'selection',scoreModel:values.baseline});
            const out=normalizeAnalysis(run);
            Object.assign(c,{decision:out.scoreRefused?'review':out.selected?'select':'reject',score:out.score,relevance:out.relevance,reason:out.scoreRefused?"provider_refused":run.prefilter.reason,receiptId:run.prefilter.receiptId,receiptIds:[run.prefilter.receiptId,...(run.scores?.receiptIds??[])],scores:out.scores,threshold:out.threshold});
          }
        } catch(error) {c.error=error instanceof Error?error.message.slice(0,200):'evaluation_error';}
        c.wallMs=Date.now()-begin;results.push(c);
      }
      const ids=[...new Set(results.flatMap(c=>(c.receiptIds as number[]|undefined)??[]))];
      const [usage]=ids.length?await sql`SELECT sum((usage->>'prompt_tokens')::bigint) AS tin,sum((usage->>'completion_tokens')::bigint) AS tout FROM receipts WHERE id IN ${sql(ids)}`:[null];
      models[model]={summary:{model,...summarizeDecisions(results),tokensIn:usage?.tin??null,tokensOut:usage?.tout??null,tokenBasis:'unique successful receipts, includes cached results; not billed totals',wallSeconds:(Date.now()-started)/1000,cost:null},cases:results,mistakes:results.filter(c=>c.gold!=='either'&&c.decision!==c.gold)};
    }
    const disagreements=values.baseline?cases.flatMap(row=>{
      const a=models['jev-five-axis'].cases.find(c=>c.caseId===row.caseId)!;
      const b=models[`baseline:${values.baseline}`].cases.find(c=>c.caseId===row.caseId)!;
      return a.decision!==b.decision?[{caseId:row.caseId,title:row.material.title,jev:a.decision,baseline:b.decision,gold:row.gold.decision}]:[];
    }):[];
    const meta={n:cases.length,split:values.split,createdAt:new Date().toISOString(),promptVersion:JEV_POLICY_VERSION,jevModel:JEV_MODEL,baselinePromptVersion:ANALYZE_PROMPT_VERSION,goldHash:createHash('sha256').update(raw).digest('hex'),policyHash:createHash('sha256').update(JSON.stringify({JEV_RULES,AXES,CAPS,WEIGHTS,SELECTION,JEV_QUESTIONS})).digest('hex'),caseIds:cases.map(r=>r.caseId),mode:'offline-comparison',calibrated:false};
    const report={meta,models,disagreements};
    const outDir=path.resolve(values.out!);mkdirSync(outDir,{recursive:true});
    const file=path.join(outDir,`jev-selection-${Date.now()}-${randomUUID().slice(0,8)}.json`);
    writeFileSync(file,JSON.stringify(report,null,2)+'\n');
    // The durable file is written before marking paid answers consumed.
    for(const id of [...new Set(Object.values(models).flatMap(m=>m.cases.flatMap(c=>(c.receiptIds as number[]|undefined)??[])))]) await completeReceipt(sql,id);
    let runId:string|null=null;
    if(!values['no-import']) runId=(await importSelectBenchRun(report,values.label??`Jev offline comparison: ${cases.length} cases`,'script:eval-jev-selection')).id;
    console.log(JSON.stringify({report:file,runId,disagreements:disagreements.length,summaries:Object.fromEntries(Object.entries(models).map(([k,v])=>[k,v.summary]))},null,2));
    if(Object.values(models).some(m=>Number(m.summary.errors)>0)) process.exitCode=2;
  } finally {await closeDb();}
}
