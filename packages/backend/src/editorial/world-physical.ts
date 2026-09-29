import { WORLD_AXES, WORLD_CAPS, WORLD_RULES, WORLD_TOPICS } from "@aihot/industry/world-physical";
import { CATEGORY_CRITERIA, MIN_CONFIDENCE, SCORE_LEVELS } from "@aihot/industry/jev-selection";
import { decideJev, materialBody, type Question, type JevResponse } from "./jev-selection.ts";
import type { AnalyzeInputArticle } from "./input.ts";
export const WORLD_QUESTIONS:Record<string,Question> = {
  topic:{type:"choice",instructions:WORLD_RULES+" 只判断专题，不按关键词猜测。视频技术也可能用于世界模型，以实质证据为准。",criteria:WORLD_TOPICS},
  relevance:{type:"choice",instructions:WORLD_RULES+" 是否有世界模型或物理 AI 的实质内容？",criteria:{PASS:"明确符合专题。",BLOCK:"有足够材料证明与专题无关。",UNKNOWN:"材料不足或无法确定。"}},
  category:{type:"choice",instructions:WORLD_RULES+" 选择材料支持的主要事件类型。",criteria:CATEGORY_CRITERIA},
  ...Object.fromEntries(Object.entries(WORLD_AXES).map(([k,d])=>[k,{type:"score" as const,instructions:WORLD_RULES+d,criteria:SCORE_LEVELS[k as keyof typeof WORLD_AXES]}])),
  ...Object.fromEntries(Object.entries(WORLD_CAPS).map(([k,c])=>[k,{type:"noul" as const,instructions:WORLD_RULES+c.instructions}])),
};
export function decideWorldPhysical(article:AnalyzeInputArticle,r:JevResponse) {
  const base=decideJev(article,r,WORLD_CAPS);
  const t=r.answers.topic;
  if(!t||t.type!=="choice") throw new Error("missing topic");
  const result=(decision:"select"|"reject"|"review",reason:string)=>({...base,topic:t.choice,decision,reasonCodes:[reason],score:null});
  if(article.bodyStatus!=="ok"||!materialBody(article).trim()) return result("review","insufficient_material");
  if(t.choice==="unknown"||t.confidence<MIN_CONFIDENCE||t.probabilities[t.choice]<MIN_CONFIDENCE) return result("review","uncertain_topic");
  if(t.choice==="unrelated") return result("reject","unrelated_topic");
  return {...base,topic:t.choice};
}
