import { stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { sql, closeDb } from "@aihot/backend/db";
import { config } from "@aihot/backend/config";
import { upsertMaterial } from "@aihot/backend/content/materials";
import http from "node:http";
import { collectNewsSource } from "../packages/backend/src/news/collect.ts";
import { paidRequest } from "@aihot/backend/providers/receipts";
import { autoReleaseUnknownReceipts } from "@aihot/backend/admin/runs";
import { response } from "./jev-fixture.ts";
import { processNewsArticle as processArticle, reviewNews, withdrawNews, saveNewsDraft, resolveNews } from "../packages/backend/src/news/pipeline.ts";
import { exportWorldPhysical } from "../packages/backend/src/publication/world-physical.ts";
const processNewsArticle=(id:string)=>processArticle(id,{writeSummary:true});
const source="news-test-"+tag();let topic="both";
const provider=await stub((_hit,req)=>{
  const b=JSON.parse(req.body);
  if(req.url==="/v1/systemone") {
    assert.ok(b.questions.topic,"must use topical Jev, not generic scoring");
    const r=response();r.answers.topic={type:"choice",choice:topic,confidence:1,probabilities:Object.fromEntries(["world-models","physical-ai","both","unrelated","unknown"].map(k=>[k,k===topic?1:0]))};return r;
  }
  assert.equal(req.url,"/chat/completions");
  return {choices:[{message:{content:JSON.stringify({title:"机器人世界模型研究进展",summary:"研究团队发布了用于机器人训练的世界模型方法，并提供评测结果。"})}}],usage:{prompt_tokens:30,completion_tokens:40}};
});
process.env.NODE_ENV="test";process.env.JEV_ENDPOINT=provider.url+"/v1/systemone";
process.env.TYPESAFE_API_KEY="test-news-key";process.env.LLM_BASE_URL=provider.url;process.env.LLM_API_KEY="test-summary-key";process.env.LLM_MODEL="test-writer";
before(async()=>{
 config.modelCallsEnabled=true;
 await sql`INSERT INTO sources(id,name,kind,tier,first_party) VALUES(${source},'Test official source','rss','T1',true)`;
 await sql`INSERT INTO news_sources(source_id) VALUES(${source})`;
 await sql`INSERT INTO budgets(service,per_minute,per_hour,per_day) VALUES('llm',1000,1000,1000) ON CONFLICT(service) DO UPDATE SET per_minute=1000,per_hour=1000,per_day=1000`;
});
after(async()=>{await provider.close();await closeDb();});
async function material(body="An action conditioned world model for robot control.") {
 return upsertMaterial({sourceId:source,url:"https://example.com/news/"+tag(),title:"World model research",bodyText:body+" "+tag(),bodyStatus:"ok",via:"fetch"});
}
test("production chain uses topical receipts, deduplicates retries and requires review",async()=>{
 const a=await material(),start=provider.hits();const d=await processNewsArticle(a.articleId);
 assert.equal(d.decision,"select");assert.equal(d.state,"ready");
 await processNewsArticle(a.articleId);assert.equal(provider.hits()-start,2,"one Jev and one summary request");
 let out=await exportWorldPhysical();assert.ok(!out.snapshot.items.some(x=>x.id===`news-${d.id}`));
 await reviewNews(d.id,"approve","Yinmu","Read original; checked summary and event duplication",tag());
 out=await exportWorldPhysical();const item=out.snapshot.items.find(x=>x.id===`news-${d.id}`)!;assert.ok(item);assert.equal(item.topic,"both");
 assert.deepEqual(Object.keys(item).sort(),["id","topic","title","summary","source","url","publishedAt","discoveredAt"].sort());
 assert.ok(!JSON.stringify(out).includes("test-news-key"));
});
test("unrelated material is not summarized and cannot be approved",async()=>{
 topic="unrelated";try {const a=await material();const n=provider.hits();const d=await processNewsArticle(a.articleId);assert.equal(d.decision,"reject");assert.equal(provider.hits()-n,1);await assert.rejects(reviewNews(d.id,"approve","Yinmu","Reviewed",tag()),/not eligible/);}finally{topic="both";}
});
test("revised material invalidates approval and records a persistent removal",async()=>{
 const a=await material();const d=await processNewsArticle(a.articleId);await reviewNews(d.id,"approve","Yinmu","Checked",tag());
 await sql`UPDATE articles SET revision=revision+1 WHERE id=${a.articleId}`;
 const out=await exportWorldPhysical();assert.ok(!out.snapshot.items.some(x=>x.id===`news-${d.id}`));assert.ok(out.removals.ids.includes(`news-${d.id}`));
 await assert.rejects(reviewNews(d.id,"approve","Yinmu","Old version",tag()),/not eligible/);
});
test("withdrawals persist and event duplicates are refused at review",async()=>{
 const a=await material(),b=await material();const x=await processNewsArticle(a.articleId),y=await processNewsArticle(b.articleId),event=tag();
 await reviewNews(x.id,"approve","Yinmu","Checked",event);
 await assert.rejects(reviewNews(y.id,"approve","Yinmu","Duplicate",event),/duplicate event/);
 await withdrawNews(`news-${x.id}`,"Yinmu","Correction requested");
 const out=await exportWorldPhysical();assert.ok(out.removals.ids.includes(`news-${x.id}`));assert.ok(!out.snapshot.items.some(x=>x.id===`news-${x.id}`));
 await assert.rejects(reviewNews(x.id,"approve","Yinmu","Retry",event),/withdrawn/);
});
test("unconfirmed body spends nothing and missing summary budget fails closed",async()=>{
 const a=await material();await sql`UPDATE articles SET body_status='unconfirmed' WHERE id=${a.articleId}`;const n=provider.hits();const d=await processNewsArticle(a.articleId);assert.equal(d.state,"review");assert.equal(provider.hits(),n);
 const b=await material();await sql`DELETE FROM budgets WHERE service='llm'`;
 try {await assert.rejects(processNewsArticle(b.articleId),/summary budget/);assert.equal(provider.hits(),n);}finally{await sql`INSERT INTO budgets(service,per_minute,per_hour,per_day) VALUES('llm',1000,1000,1000)`;}
});

test("Jev-only mode leaves a private draft and a manual summary does not trigger another model",async()=>{
 const a=await material(),n=provider.hits();const d=await processArticle(a.articleId);
 assert.equal(d.state,"awaiting-summary");assert.equal(provider.hits()-n,1);
 const saved=await saveNewsDraft(d.id,{title:"人工整理的研究标题",summary:"依据原文整理的中文短摘要，等待审核。"});
 assert.equal(saved.state,"ready");assert.equal(provider.hits()-n,1);
 const out=await exportWorldPhysical();assert.ok(!out.snapshot.items.some(x=>x.id===`news-${d.id}`));
});

test("successive bounded collections advance beyond previously seen feed entries",async()=>{
 const server=http.createServer((_req,res)=>{res.setHeader("content-type","application/rss+xml");res.end('<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Research</title>'+[1,2,3,4,5].map(n=>`<item><title>Research ${n}</title><link>https://example.com/${source}/${n}</link><content:encoded><![CDATA[<p>${"Full article research evidence. ".repeat(20)}</p>]]></content:encoded></item>`).join("")+"</channel></rss>");});
 await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const port=(server.address() as {port:number}).port;
 const sid="news-collect-"+tag();await sql`INSERT INTO sources(id,name,kind,config) VALUES(${sid},'Fixture RSS','rss',${sql.json({feedUrl:`http://127.0.0.1:${port}/rss`})})`;await sql`INSERT INTO news_sources(source_id) VALUES(${sid})`;
 config.allowPrivateNetworkFetch=true;process.env.COLLECT_ENABLED="true";
 try{const a=await collectNewsSource(sid,2),b=await collectNewsSource(sid,2);assert.equal(a.ids.length,2);assert.equal(b.ids.length,2);assert.equal(a.ids.filter(id=>b.ids.includes(id)).length,0);}finally{config.allowPrivateNetworkFetch=false;process.env.COLLECT_ENABLED="false";await new Promise<void>(r=>server.close(()=>r()));}
});
test("a new policy decision can publish unchanged material after old policy removal",async()=>{
 const a=await material();const d=await processNewsArticle(a.articleId);await reviewNews(d.id,"approve","Yinmu","Checked",tag());
 await sql`UPDATE news_decisions SET policy='previous-policy' WHERE id=${d.id}`;
 await exportWorldPhysical();const next=await processNewsArticle(a.articleId);await reviewNews(next.id,"approve","Yinmu","New policy checked",tag());
 const out=await exportWorldPhysical();assert.ok(out.snapshot.items.some(x=>x.id===`news-${next.id}`));assert.ok(out.removals.ids.includes(`news-${d.id}`));
});
test("unknown topical paid receipts require explicit reconciliation even after 30 minutes",async()=>{
 for(const purpose of ["world_physical_selection","world_physical_summary"]){
  const req={service:"typesafe",model:"test-news",purpose,subject:"news-review-"+tag(),identity:{nonce:tag()}};
  await assert.rejects(paidRequest(req,async()=>{throw new Error("test unknown outcome");}));
  const [r]=await sql`SELECT id FROM receipts WHERE subject=${req.subject}`;
  await sql`UPDATE receipts SET updated_at=now()-interval '1 hour' WHERE id=${r.id}`;
  await autoReleaseUnknownReceipts();const [after]=await sql`SELECT status FROM receipts WHERE id=${r.id}`;assert.equal(after.status,"unknown");
 }
});

test("offline receipt replay binds material and policy without credentials or paid calls",async()=>{
 const a=await material(),b=await material();const d=await processArticle(a.articleId);
 const [receipt]=await sql`SELECT jev_receipt_id AS id FROM news_decisions WHERE id=${d.id}`;
 await sql`DELETE FROM news_decisions WHERE id=${d.id}`;
 await sql`UPDATE receipts SET status='failed',error='invalid Jev response' WHERE id=${receipt.id}`;
 const n=provider.hits();config.modelCallsEnabled=false;const key=process.env.TYPESAFE_API_KEY;delete process.env.TYPESAFE_API_KEY;
 try {
  await assert.rejects(processArticle(b.articleId,{replayReceiptId:receipt.id}),/does not match/);
  const recovered=await processArticle(a.articleId,{replayReceiptId:receipt.id});assert.equal(recovered.decision,'select');assert.equal(provider.hits(),n);
  await sql`DELETE FROM news_decisions WHERE id=${recovered.id}`;
  await sql`UPDATE articles SET revision=revision+1 WHERE id=${a.articleId}`;
  await assert.rejects(processArticle(a.articleId,{replayReceiptId:receipt.id}),/does not match/);
  assert.equal(provider.hits(),n);
 }finally{config.modelCallsEnabled=true;process.env.TYPESAFE_API_KEY=key;}
});

test("editorial resolution keeps Jev review immutable and still needs draft and publication review",async()=>{
 const a=await material();const d=await processArticle(a.articleId);
 await sql`UPDATE news_decisions SET decision='review',state='review',reason_codes='["uncertain_sig"]' WHERE id=${d.id}`;
 await assert.rejects(resolveNews(d.id,'select','Codex',''),/invalid/i);
 await resolveNews(d.id,'select','Codex','Read source: concrete robotics release, attributed claims; keep model uncertainty.');
 const [row]=await sql`SELECT * FROM news_decisions WHERE id=${d.id}`;assert.equal(row.decision,'review');assert.equal(row.resolved_decision,'select');assert.equal(row.resolved_by,'Codex');
 await assert.rejects(resolveNews(d.id,'select','Codex','Duplicate resolution'),/not eligible/);
 let out=await exportWorldPhysical();assert.ok(!out.snapshot.items.some(x=>x.id===`news-${d.id}`));
 await saveNewsDraft(d.id,{title:'机器人模型发布',summary:'据研究团队发布，该模型支持机器人学习任务。'});
 await reviewNews(d.id,'approve','Codex','Checked source and summary',tag());out=await exportWorldPhysical();assert.ok(out.snapshot.items.some(x=>x.id===`news-${d.id}`));
 await sql`UPDATE articles SET revision=revision+1 WHERE id=${a.articleId}`;
 out=await exportWorldPhysical();assert.ok(!out.snapshot.items.some(x=>x.id===`news-${d.id}`));
 const b=await material();const bad=await processArticle(b.articleId);await sql`UPDATE news_decisions SET decision='review',state='review',topic='unknown' WHERE id=${bad.id}`;
 await assert.rejects(resolveNews(bad.id,'select','Codex','No topic evidence'),/not eligible/);
});
