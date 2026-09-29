import { z } from "zod";
import { AXES, CAPS, CATEGORY_CRITERIA, JEV_MODEL, JEV_RULES, MIN_CONFIDENCE, WEIGHTS, SCORE_LEVELS } from "@aihot/industry/jev-selection";
import { SELECTION } from "@aihot/industry/selection";
import type { AnalyzeInputArticle } from "./input.ts";

export type Decision = "select" | "reject" | "review";
type ChoiceQuestion = {type:"choice"; instructions:string; criteria:Record<string,string>};
type ScoreQuestion = {type:"score"; instructions:string; criteria:string[]};
type NoulQuestion = {type:"noul"; instructions:string};
export type Question = ChoiceQuestion | ScoreQuestion | NoulQuestion;
export const JEV_QUESTIONS: Record<string,Question> = {
  relevance: {type:"choice", instructions:JEV_RULES+" 做宽召回相关性预筛，不做质量评分。公司名、智能、GPU、MCP 单个词不自动代表 AI。BLOCK 需要明确无关证据；不认识的名称不能算无关。", criteria:{PASS:"明确涉及 AI 技术、模型、Agent、评测、工具、生成作品、机器人、AI 经营或社会影响。",BLOCK:"材料充分且只有普通科技、经营或日常，AI 只在身份标签或空泛广告词中。",UNKNOWN:"只有代词、表情、缺失媒体、无法识别名称或材料不足，无法确认。"}},
  category: {type:"choice", instructions:JEV_RULES+"选择当前最强且有正文支持的事件类型。",criteria:CATEGORY_CRITERIA},
  ...Object.fromEntries(Object.entries(AXES).map(([key,description])=>[key,{type:"score" as const,instructions:JEV_RULES+description+" 选择原文证据最匹配的等级，不迎合门槛。",criteria:SCORE_LEVELS[key as keyof typeof AXES]}])),
  ...Object.fromEntries(Object.entries(CAPS).map(([key,cap])=>[key,{type:"noul" as const,instructions:JEV_RULES+cap.instructions}])),
};
export function materialBody(a:AnalyzeInputArticle):string {
  return a.xPost ? [String(a.xPost.text??""), a.xPost.quoted?.text ? `[引用] ${a.xPost.quoted.text}` : ""].filter(Boolean).join("\n\n") : (a.bodyText||a.excerpt||"");
}
export function buildJevRequest(a:AnalyzeInputArticle, questions:Record<string,Question>=JEV_QUESTIONS) {
  for(const q of Object.values(questions))if(q.type==="score"&&(q.criteria.length<2||q.criteria.length>10))throw new Error("invalid score criteria: API accepts 2..10 levels");
  const body=materialBody(a);
  if(!a.title.trim()) throw new Error("missing title");
  // Do not silently truncate evidence and then judge a different article than the baseline.
  if(body.length>30000 || a.title.length>2000) throw new Error("material_too_long");
  return {model:JEV_MODEL,state:{title:a.title,body,publishedAt:a.publishedAt?.toISOString()??null},questions};
}
const probability=z.number().finite().min(0).max(1);
const choice=z.object({type:z.literal("choice"),choice:z.string(),confidence:probability,probabilities:z.record(z.string(),probability)});
const score=z.object({type:z.literal("score"),score:z.number().finite().min(0).max(10),confidence:probability,probabilities:z.record(z.string(),probability)});
const noul=z.object({type:z.literal("noul"),noul:probability});
const responseSchema=z.object({model:z.literal(JEV_MODEL),answers:z.record(z.string(),z.discriminatedUnion("type",[choice,score,noul])),usage:z.object({input_tokens:z.number().int().nonnegative(),output_tokens:z.number().int().nonnegative()})});
export type JevResponse=z.infer<typeof responseSchema>;
export function validateJevResponse(raw:unknown, questions:Record<string,Question>=JEV_QUESTIONS):JevResponse {
  const r=responseSchema.parse(raw);
  if(Object.keys(r.answers).sort().join()!==Object.keys(questions).sort().join()) throw new Error("invalid answer keys");
  for(const [key,q] of Object.entries(questions)) {
    const a=r.answers[key];
    if(a.type!==q.type) throw new Error("invalid answer type");
    if(a.type==="noul") continue;
    const keys=q.type==="choice"?Object.keys(q.criteria):Array.from({length:q.type==="score"?q.criteria.length:0},(_,i)=>String(i));
    if(Object.keys(a.probabilities).sort().join()!==keys.sort().join()) throw new Error("invalid probability keys");
    const ps=Object.values(a.probabilities);
    // The service rounds probabilities and expectations to two decimals independently.
    // Find feasible expectations over normalized distributions within those rounding intervals.
    const intervals=Object.entries(a.probabilities).map(([k,p])=>({index:Number(k),lo:Math.max(0,p-.005),hi:Math.min(1,p+.005)}));
    const lower=intervals.reduce((s,p)=>s+p.lo,0),upper=intervals.reduce((s,p)=>s+p.hi,0);
    if(lower>1+1e-9||upper<1-1e-9)throw new Error("invalid probability sum");
    const expectation=(descending:boolean)=>{
      let remaining=1-lower,total=intervals.reduce((s,p)=>s+p.index*p.lo,0);
      for(const p of [...intervals].sort((a,b)=>descending?b.index-a.index:a.index-b.index)){
        const added=Math.min(remaining,p.hi-p.lo);total+=added*p.index;remaining-=added;
      }
      return total;
    };
    if(a.type==="choice" && (!Object.hasOwn(a.probabilities,a.choice)||a.probabilities[a.choice]+1e-6<Math.max(...ps))) throw new Error("invalid choice");
    if(a.type==="score" && (a.score<0||a.score>keys.length-1||a.score<expectation(false)-.005-1e-9||a.score>expectation(true)+.005+1e-9)) throw new Error("invalid score expectation");
  }
  return r;
}
export function decideJev(article:AnalyzeInputArticle,r:JevResponse, caps:Record<string,{instructions:string;limits:Record<string,number>}>=CAPS) {
  const threshold=SELECTION.thresholds[article.source.tier]??null;
  const signals=r.answers;
  const rel=signals.relevance as z.infer<typeof choice>;
  const category=signals.category as z.infer<typeof choice>;
  const result=(decision:Decision,score:number|null,reasonCodes:string[])=>({decision,score,threshold,reasonCodes,relevance:rel.choice,category:category.choice,signals});
  if(threshold===null) return result("reject",null,["tier_excluded"]);
  if(!materialBody(article).trim() || article.bodyStatus==="pending") return result("review",null,["insufficient_material"]);
  if(rel.confidence<MIN_CONFIDENCE || rel.probabilities[rel.choice]<MIN_CONFIDENCE || rel.choice==="UNKNOWN") return result("review",null,["uncertain_relevance"]);
  if(rel.choice==="BLOCK") return result("reject",null,["unrelated"]);
  if(category.confidence<MIN_CONFIDENCE || category.probabilities[category.choice]<MIN_CONFIDENCE) return result("review",null,["uncertain_category"]);
  const axes:Record<string,number>={};
  for(const key of Object.keys(AXES)) {
    const a=signals[key] as z.infer<typeof score>;
    if(a.confidence<MIN_CONFIDENCE) return result("review",null,[`uncertain_${key}`]);
    // API Score is a level index. Normalize its expectation to the policy's 0..10 scale before caps/weights.
    axes[key]=a.score*10/(Object.keys(a.probabilities).length-1);
  }
  const reasons:string[]=[];
  for(const [key,cap] of Object.entries(caps)) {
    const p=(signals[key] as z.infer<typeof noul>).noul;
    if(p>0.2 && p<0.8) return result("review",null,[`uncertain_${key}`]);
    if(p>=0.8) {
      if(key==="broken_material"||key==="unsupported_claim") return result("review",null,[key]);
      reasons.push(key);
      for(const [axis,limit] of Object.entries(cap.limits)) axes[axis]=Math.min(axes[axis],limit);
    }
  }
  const weights=WEIGHTS[category.choice as keyof typeof WEIGHTS];
  const total=Object.keys(AXES).reduce((sum,key,i)=>sum+axes[key]*weights[i],0);
  return result(total>=threshold?"select":"reject",total,[...reasons,total>=threshold?"threshold_met":"below_threshold"]);
}
const goldSchema=z.object({
  caseId:z.string().trim().min(1).max(200),
  material:z.object({title:z.string().trim().min(1).max(2000),originalTitle:z.string().max(2000).nullable().optional(),publishedAt:z.string().datetime({offset:true}).nullable().optional(),sourceName:z.string().optional(),bodyZh:z.string().nullable().optional(),bodyOriginal:z.string().nullable().optional()}),
  sourceFacts:z.object({sourceKind:z.enum(["rss","web_list","json_list","x_search","mp_account","external"]),sourceTier:z.enum(["T1","T1_5","T2","EXCLUDE_MP"]).default("T2"),firstParty:z.boolean().optional(),language:z.string().nullable().optional()}),
  samplingContext:z.object({benchmarkSplit:z.enum(["development","holdout"]).optional(),samplingStratum:z.string().optional()}).optional(),
  gold:z.object({decision:z.enum(["select","reject","either"])}),
});
export type GoldRow=z.infer<typeof goldSchema>;
export function parseGold(text:string):GoldRow[] {
  const rows=text.split("\n").filter(l=>l.trim()&&!l.trim().startsWith("//")).map(l=>goldSchema.parse(JSON.parse(l)));
  if(!rows.length) throw new Error("empty gold set");
  if(new Set(rows.map(r=>r.caseId)).size!==rows.length) throw new Error("duplicate caseId");
  for(const r of rows) buildJevRequest(goldInput(r));
  return rows;
}
export function goldInput(r:GoldRow):AnalyzeInputArticle {
  const m=r.material, body=m.bodyOriginal||m.bodyZh||null;
  return {id:`gold-${r.caseId}`,revision:1,title:m.originalTitle||m.title,url:`https://example.invalid/${encodeURIComponent(r.caseId)}`,author:null,publishedAt:m.publishedAt?new Date(m.publishedAt):null,bodyStatus:"ok",bodyText:body,excerpt:null,xPost:r.sourceFacts.sourceKind==="x_search"?{text:body??m.title}:null,media:[],source:{name:m.sourceName??"",kind:r.sourceFacts.sourceKind,tier:r.sourceFacts.sourceTier,firstParty:r.sourceFacts.firstParty??false}};
}
export function summarizeDecisions(rows:Array<{gold:"select"|"reject"|"either";decision:Decision|null}>) {
  let tp=0,fp=0,fn=0,tn=0,review=0,errors=0,either=0,positives=0,labeled=0;
  for(const r of rows) {
    if(r.decision===null) errors++; if(r.decision==="review") review++;
    if(r.gold==="either") {either++;continue;} labeled++;
    if(r.gold==="select") positives++;
    if(r.decision===null||r.decision==="review") continue;
    if(r.decision==="select") {if(r.gold==="select")tp++;else fp++;}
    else {if(r.gold==="select")fn++;else tn++;}
  }
  const ratio=(a:number,b:number)=>b?a/b:null;
  const precision=ratio(tp,tp+fp),recall=ratio(tp,positives);
  const f1=precision===null||recall===null?null:(precision+recall===0?0:2*precision*recall/(precision+recall));
  return {f1,selectedRate:ratio(tp+fp,labeled),goldSelectRate:ratio(positives,labeled),n:rows.length,labeled,decisive:tp+fp+fn+tn,either,review,errors,tp,fp,fn,tn,precision:ratio(tp,tp+fp),recall:ratio(tp,positives),accuracy:ratio(tp+tn,labeled),coverage:ratio(tp+fp+fn+tn,labeled),decisiveRecall:ratio(tp,tp+fn)};
}
