// Safe on-demand entry. Never starts pg-boss, the general worker or a public admin server.
import { parseArgs } from "node:util";
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
const {values,positionals}=parseArgs({allowPositionals:true,options:{receipt:{type:"string"},live:{type:"boolean"},summary:{type:"boolean"},limit:{type:"string",default:"3"},source:{type:"string"},id:{type:"string"},file:{type:"string"},out:{type:"string"},reviewer:{type:"string"},reason:{type:"string"},event:{type:"string"},action:{type:"string",default:"approve"}}});
const command=positionals[0]||"help";
process.env.MODEL_CALLS_ENABLED=values.live?"true":"false";
process.env.COLLECT_ENABLED=command==="collect"?"true":"false";
process.env.AIHOT_NEWS_ONLY="true";
for(const key of ["FEISHU_CONTENT_PUSH_ENABLED","FEISHU_INTERNAL_ENABLED","INDEXNOW_SUBMIT_ENABLED","JINA_BODY_FALLBACK"])process.env[key]="false";
const {sql,closeDb}=await import("../packages/backend/src/db.ts");
const {initNewsSources,collectNewsSource,NEWS_SOURCES}=await import("../packages/backend/src/news/collect.ts");
const {processNewsArticle,reviewNews,saveNewsDraft,withdrawNews,resolveNews}=await import("../packages/backend/src/news/pipeline.ts");
const {exportWorldPhysical}=await import("../packages/backend/src/publication/world-physical.ts");
const {WORLD_PROFILE,WORLD_POLICY_VERSION}=await import("@aihot/industry/world-physical");
const limit=Number(values.limit);
const required=(key:"id"|"file"|"out"|"reviewer"|"reason"|"event")=>{const v=values[key];if(!v)throw new Error("missing --"+key);return v;};
const print=(v:unknown)=>console.log(JSON.stringify(v,null,2));
function atomic(file:string,value:unknown){mkdirSync(dirname(file),{recursive:true});const temp=file+"."+process.pid+".tmp";writeFileSync(temp,JSON.stringify(value,null,2)+"\n",{mode:0o600});renameSync(temp,file);}
try {
 if(!Number.isInteger(limit)||limit<1||limit>20)throw new Error("--limit must be 1..20");
 if(command==="init")print(await initNewsSources());
 else if(command==="collect") {
  const sources=values.source?[values.source]:NEWS_SOURCES.map(s=>s.id);
  for(const id of sources){try{print(await collectNewsSource(id,limit));}catch{print({sourceId:id,status:"collection_failed"});process.exitCode=1;}}
 } else if(command==="process") {
  if(!values.live)throw new Error("process needs explicit --live; it makes bounded paid Jev calls");
  const rows=await sql`SELECT a.id FROM articles a JOIN news_sources n ON n.source_id=a.source_id WHERE n.allowed AND (${values.id??null}::text IS NULL OR a.id=${values.id??null}) AND NOT EXISTS(SELECT 1 FROM news_decisions d WHERE d.article_id=a.id AND d.input_revision=a.revision AND d.profile=${WORLD_PROFILE} AND d.policy=${WORLD_POLICY_VERSION} AND (d.state<>'awaiting-summary' OR ${!values.summary})) ORDER BY coalesce(a.published_at,a.discovered_at) DESC LIMIT ${limit}`;
  for(const r of rows){try{const d=await processNewsArticle(r.id,{writeSummary:values.summary});print({articleId:r.id,decisionId:d.id,state:d.state,decision:d.decision,topic:d.topic});}catch{print({articleId:r.id,status:"processing_failed",hint:"Inspect private receipts/configuration; no automatic retry in this batch"});process.exitCode=1;break;}}
 } else if(command==="replay") {
  if(values.live||values.summary)throw new Error("replay is offline; omit --live and --summary");
  const receipt=Number(values.receipt);if(!Number.isSafeInteger(receipt)||receipt<1)throw new Error("missing or invalid --receipt");
  const d=await processNewsArticle(required("id"),{replayReceiptId:receipt});
  print({decisionId:d.id,decision:d.decision,state:d.state,topic:d.topic,replayedReceipt:receipt});
 } else if(command==="list") {
  print(await sql`SELECT d.id,'news-'||d.id AS item_id,a.id AS article_id,a.url,a.title AS original_title,a.published_at,d.input_revision,d.decision,d.topic,d.state,d.title,d.summary,d.reason_codes,d.resolved_decision,d.resolved_by,d.resolution_reason FROM news_decisions d JOIN articles a ON a.id=d.article_id WHERE d.profile=${WORLD_PROFILE} AND d.policy=${WORLD_POLICY_VERSION} AND d.input_revision=a.revision ORDER BY d.id DESC LIMIT ${limit}`);
 } else if(command==="draft")print(await saveNewsDraft(Number(required("id")),JSON.parse(readFileSync(required("file"),"utf8"))));
 else if(command==="resolve") {
  if(values.action!=="select"&&values.action!=="reject")throw new Error("resolve requires --action select|reject");
  print(await resolveNews(Number(required("id")),values.action,required("reviewer"),required("reason")));
 } else if(command==="review") {
  if(values.action!=="approve"&&values.action!=="reject")throw new Error("invalid --action");
  print(await reviewNews(Number(required("id")),values.action,required("reviewer"),required("reason"),required("event")));
 } else if(command==="withdraw")print(await withdrawNews(required("id"),required("reviewer"),required("reason")));
 else if(command==="export") {
  const out=resolve(required("out")), data=await exportWorldPhysical();
  // The removal file is written first: interruption may remove extra content, never restore it.
  atomic(out+".removals.json",data.removals);
  let previous:typeof data.snapshot|undefined;try{if(existsSync(out))previous=JSON.parse(readFileSync(out,"utf8"));}catch{}
  if(previous && JSON.stringify(previous.items)===JSON.stringify(data.snapshot.items))data.snapshot.updatedAt=previous.updatedAt;
  atomic(out,data.snapshot);print({out,items:data.snapshot.items.length,removed:data.removals.ids.length});
 } else if(command==="help")console.log("news: init | collect [--source ID --limit 3] | process --live [--summary --id ID --limit 3] | replay --id ARTICLE --receipt RECEIPT | list | draft --id DECISION --file JSON | resolve --id DECISION --action select|reject --reviewer NAME --reason TEXT | review --id DECISION --reviewer NAME --reason TEXT --event KEY [--action approve|reject] | withdraw --id ITEM --reviewer NAME --reason TEXT | export --out FILE");
 else throw new Error("unknown command");
} catch(error){console.error(error instanceof Error?error.message:"news command failed");process.exitCode=1;}finally{await closeDb();}
