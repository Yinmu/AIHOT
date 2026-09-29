import assert from "node:assert/strict";
import { test } from "node:test";
import { article, response } from "./jev-fixture.ts";
import { WORLD_QUESTIONS, decideWorldPhysical } from "../packages/backend/src/editorial/world-physical.ts";
import { buildJevRequest, validateJevResponse, decideJev } from "../packages/backend/src/editorial/jev-selection.ts";
export function worldResponse(topic="world-models") {
  const r=response();
  r.answers.topic={type:"choice",choice:topic,confidence:1,probabilities:Object.fromEntries(["world-models","physical-ai","both","unrelated","unknown"].map(k=>[k,k===topic?1:0]))};
  return r;
}
test("topical request keeps five axes but changes research audience",()=>{
  const q=buildJevRequest(article(),WORLD_QUESTIONS);
  assert.ok(q.questions.topic); assert.match(q.questions.reson.instructions,/世界模型/);
  assert.notEqual(q.questions.narrow_research.instructions,buildJevRequest(article()).questions.narrow_research.instructions);
  assert.equal(decideJev(article(),validateJevResponse(response())).decision,"select");
});
test("specialist research can select; unrelated and uncertain topics cannot",()=>{
  assert.equal(decideWorldPhysical(article(),validateJevResponse(worldResponse(),WORLD_QUESTIONS)).decision,"select");
  assert.equal(decideWorldPhysical(article(),validateJevResponse(worldResponse("unrelated"),WORLD_QUESTIONS)).decision,"reject");
  assert.equal(decideWorldPhysical(article(),validateJevResponse(worldResponse("unknown"),WORLD_QUESTIONS)).decision,"review");
  const r=worldResponse();r.answers.topic.confidence=.6;
  assert.equal(decideWorldPhysical(article(),validateJevResponse(r,WORLD_QUESTIONS)).decision,"review");
});
test("unconfirmed body and overlong original cannot silently publish",()=>{
  const a=article();a.bodyStatus="unconfirmed";
  assert.equal(decideWorldPhysical(a,worldResponse()).decision,"review");
  a.bodyStatus="ok";a.bodyText="x".repeat(30001);assert.throws(()=>buildJevRequest(a,WORLD_QUESTIONS),/material_too_long/);
  a.bodyText="Complete brief announcement.";assert.equal(decideWorldPhysical(a,worldResponse()).decision,"select");
});
test("generic results cannot masquerade as topical replies",()=>{
  assert.throws(()=>validateJevResponse(response(),WORLD_QUESTIONS),/answer keys/);
  const r=worldResponse();r.answers.topic.choice="constructor";assert.throws(()=>validateJevResponse(r,WORLD_QUESTIONS),/invalid choice/);
});
test("every request uses the documented two-to-ten Score levels",()=>{
 for(const qs of [buildJevRequest(article()).questions,WORLD_QUESTIONS])for(const q of Object.values(qs))if(q.type==="score")assert.ok(q.criteria.length>=2&&q.criteria.length<=10,`Score has ${q.criteria.length} levels`);
 const invalid={...WORLD_QUESTIONS,sig:{type:"score" as const,instructions:"bad rubric",criteria:Array(11).fill("same")}};
 assert.throws(()=>buildJevRequest(article(),invalid),/score criteria/);
});
