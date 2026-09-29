import type { AnalyzeInputArticle } from "../packages/backend/src/editorial/input.ts";
export function article(tier="T1"): AnalyzeInputArticle { return {id:"jev-test",revision:1,title:"A model release",url:"https://example.invalid/news",author:null,publishedAt:new Date("2026-09-29T00:00:00Z"),bodyText:"A new open model was released with weights, technical details and a usable demo.",excerpt:null,bodyStatus:"ok",xPost:null,media:[],source:{name:"Demo",kind:"rss",tier,firstParty:true}}; }
export function response(scores:Record<string,number>={sig:8,nov:8,cred:8,reson:8,act:8}): any {
  const categories=["model_release","product_launch","tool_or_prompt","research_paper","industry_event","opinion_analysis","tutorial_explainer"];
  const answers:Record<string,any>={relevance:{type:"choice",choice:"PASS",confidence:1,probabilities:{PASS:1,BLOCK:0,UNKNOWN:0}},category:{type:"choice",choice:"model_release",confidence:1,probabilities:Object.fromEntries(categories.map(k=>[k,k==="model_release"?1:0]))}};
  for(const [k,v] of Object.entries(scores)) answers[k]={type:"score",score:v/2,confidence:1,probabilities:Object.fromEntries(Array.from({length:6},(_,i)=>[i,Math.max(0,1-Math.abs(i-v/2))]))};
  for(const k of ["customer_pr","routine_update","marketing","vague_preview","anecdote","roundup","vendor_howto","narrow_research","broken_material","unsupported_claim"]) answers[k]={type:"noul",noul:0};
  return {model:"jev-1.13.0",answers,usage:{input_tokens:100,output_tokens:20}};
}
