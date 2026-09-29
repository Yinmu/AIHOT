import { stub, tag, Reply } from './setup.ts';
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { response } from './jev-fixture.ts';
import { selectBenchRun } from '@aihot/backend/admin/selectbench';
import { sql, closeDb } from '@aihot/backend/db';
const dir=mkdtempSync(path.join(tmpdir(),'jev-cli-'));
const gold=path.join(dir,'gold.jsonl');
const id=tag();
writeFileSync(gold,JSON.stringify({caseId:id,material:{title:'Example '+id,bodyOriginal:'An open AI model released with documented parameters and downloadable weights.'},sourceFacts:{sourceKind:'rss',sourceTier:'T1'},gold:{decision:'select'}})+'\n');
const provider=await stub(()=>response());
function cli(args:string[],env:Record<string,string>={}) {return new Promise<{code:number|null;out:string}>((resolve)=>{
 const p=spawn(process.execPath,['scripts/eval-jev-selection.ts','--gold',gold,...args],{env:{...process.env,MODEL_CALLS_ENABLED:'false',...env}});let out='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>out+=d);p.on('close',code=>resolve({code,out}));
});}
after(async()=>{await provider.close();await closeDb();});
test('dry run needs no key and invalid counts fail before network',async()=>{
 const r=await cli(['--dry-run']);assert.equal(r.code,0,r.out);assert.match(r.out,/dryRun/);assert.equal(provider.hits(),0);
 const invalid=await cli(['--n','0']);assert.notEqual(invalid.code,0);assert.equal(provider.hits(),0);
});
test('CLI saves a real receipt-backed report and imports it without publishing articles',async()=>{
 const before=await sql`SELECT count(*)::int AS n FROM analyses`;
 const r=await cli(['--out',dir],{NODE_ENV:'test',MODEL_CALLS_ENABLED:'true',TYPESAFE_API_KEY:'test-key',JEV_ENDPOINT:provider.url+'/v1/systemone'});
 assert.equal(r.code,0,r.out);const file=readdirSync(dir).find(f=>f.startsWith('jev-selection-'))!;
 const report=JSON.parse(readFileSync(path.join(dir,file),'utf8'));
 assert.equal(report.models['jev-five-axis'].cases[0].decision,'select');
 assert.equal(report.models['jev-five-axis'].summary.errors,0);
 const rows=await sql`SELECT * FROM selectbench_results WHERE case_id=${id}`;assert.equal(rows.length,1);assert.equal(rows[0].decision,'select');
 const afterCount=await sql`SELECT count(*)::int AS n FROM analyses`;assert.equal(afterCount[0].n,before[0].n);
 const again=await cli(['--out',dir,'--no-import'],{NODE_ENV:'test',MODEL_CALLS_ENABLED:'true',TYPESAFE_API_KEY:'test-key',JEV_ENDPOINT:provider.url+'/v1/systemone'});
 assert.equal(again.code,0,again.out);assert.equal(provider.hits(),1);
});

test('SelectBench review filter does not show reviewed cases as rejection',async()=>{
 const {importSelectBenchRun}=await import('@aihot/backend/admin/selectbench');
 const {id}=await importSelectBenchRun({meta:{n:2},models:{jev:{summary:{n:2},cases:[{caseId:'r',title:'Review',gold:'select',decision:'review'},{caseId:'s',title:'Select',gold:'select',decision:'select'}]}}},'test review','test');
 const run=await selectBenchRun(id,{model:'jev',outcome:'review'});assert.equal(run!.rows.length,1);assert.equal(run!.rows[0].case_id,'r');
});

test('baseline provider refusal is review, never a true negative',async()=>{
 const baseline=await stub((_hit,req)=>{const b=JSON.parse(req.body);return b.messages[0].content.includes('宽召回')?{choices:[{message:{content:JSON.stringify({label:'PASS',reason:'AI'})}}],usage:{prompt_tokens:1,completion_tokens:1}}:new Reply(400,{error:{code:'1301',message:'contentFilter'}});});
 const out=path.join(dir,'refusal');
 try {
 const r=await cli(['--out',out,'--no-import','--baseline','default'],{NODE_ENV:'test',MODEL_CALLS_ENABLED:'true',TYPESAFE_API_KEY:'test-key',JEV_ENDPOINT:provider.url+'/v1/systemone',PREFILTER_MODEL:'default',LLM_BASE_URL:baseline.url,LLM_API_KEY:'test-key',LLM_MODEL:'test-refusal'});
 assert.equal(r.code,0,r.out);const report=JSON.parse(readFileSync(path.join(out,readdirSync(out)[0]),'utf8'));
 assert.equal(report.models['baseline:default'].cases[0].decision,'review');
 assert.equal(report.models['baseline:default'].summary.decisive,0);
 } finally {await baseline.close();}
});
