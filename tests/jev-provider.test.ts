import { stub, tag, Reply } from './setup.ts';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { article, response } from './jev-fixture.ts';
import { evaluateJev } from '../packages/backend/src/providers/jev.ts';
import { config } from '@aihot/backend/config';
import { sql, closeDb } from '@aihot/backend/db';
import { BudgetExceededError, ReceiptUnknownError } from '@aihot/backend/providers/receipts';
let mode='ok';
const provider=await stub((_hit,req)=>{
  assert.equal(req.url,'/v1/systemone');
  const body=JSON.parse(req.body); assert.equal(body.model,'jev-1.13.0'); assert.ok(body.questions.sig); assert.equal(body.messages,undefined);
  if(mode==='bad') return {model:'wrong'};
  if(mode==='503') return new Reply(503,{error:'secret must not appear in logs'});
  return response();
});
process.env.NODE_ENV='test'; process.env.JEV_ENDPOINT=provider.url+'/v1/systemone'; process.env.TYPESAFE_API_KEY='test-key';
after(async()=>{ await provider.close(); await closeDb(); });
const ask=()=>{const a=article();a.title=tag();return evaluateJev(a);};

test('Jev receipts reuse valid answers and store normalized usage without secrets',async()=>{
  const a=article();a.title=tag(); const start=provider.hits();
  const one=await evaluateJev(a),two=await evaluateJev(a);
  assert.equal(provider.hits()-start,1);assert.equal(two.reused,true); assert.equal(two.receiptId,one.receiptId);assert.equal(one.decision,'select');
  const [r]=await sql`SELECT request,usage FROM receipts WHERE id=${one.receiptId}`;
  assert.equal(r.usage.prompt_tokens,100);assert.equal(JSON.stringify(r.request).includes('test-key'),false);
});
test('disabled valve sends nothing; missing budget fails closed',async()=>{
  const n=provider.hits();config.modelCallsEnabled=false;
  try {await assert.rejects(ask(),/disabled/);} finally {config.modelCallsEnabled=true;}
  assert.equal(provider.hits(),n);
  await sql`UPDATE budgets SET per_minute=0 WHERE service='typesafe'`;
  try {await assert.rejects(ask(),BudgetExceededError);} finally {await sql`UPDATE budgets SET per_minute=60 WHERE service='typesafe'`;}
  assert.equal(provider.hits(),n);
});
test('malformed reply is recorded and fails instead of rejecting news',async()=>{
  mode='bad';try {await assert.rejects(ask(),/invalid Jev response/);} finally {mode='ok';}
});
test('ambiguous server failure remains unknown and is not automatically bought again',async()=>{
  mode='503';const a=article();a.title=tag();const n=provider.hits();
  try {await assert.rejects(evaluateJev(a),/jev_http_503/);await assert.rejects(evaluateJev(a),ReceiptUnknownError);} finally {mode='ok';}
  assert.equal(provider.hits()-n,1);
});
test('untrusted provider URL is rejected before any request',async()=>{
  const original=process.env.JEV_ENDPOINT; process.env.JEV_ENDPOINT='https://example.com/steal';
  try {await assert.rejects(ask(),/endpoint/);} finally {process.env.JEV_ENDPOINT=original;}
});
