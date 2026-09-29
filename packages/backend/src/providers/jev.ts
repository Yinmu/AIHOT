// Native TypeSafe transport. Only the offline evaluation CLI uses this provider.
import { config, credential } from '../config.ts';
import { sql } from '../db.ts';
import { sha256, stableJson } from '../lib/ids.ts';
import { paidRequest, ProviderRejectedError, rejectReceivedResponse } from './receipts.ts';
import { buildJevRequest, validateJevResponse, decideJev } from '../editorial/jev-selection.ts';
import type { AnalyzeInputArticle } from '../editorial/input.ts';
import { JEV_POLICY_VERSION, JEV_MODEL } from '@aihot/industry/jev-selection';

const ENDPOINT='https://api.typesafe.ai/v1/systemone';
function endpoint():string {
  const value=process.env.JEV_ENDPOINT||ENDPOINT;
  if(value===ENDPOINT) return value;
  const u=new URL(value);
  if(process.env.NODE_ENV==='test' && u.protocol==='http:' && ['127.0.0.1','localhost','[::1]'].includes(u.hostname) && !u.username && !u.password && u.pathname==='/v1/systemone') return value;
  throw new Error('invalid Jev endpoint (only TypeSafe or a local test server is allowed)');
}
async function boundedBody(r:Response):Promise<string> {
  const max=1024*1024;
  if(Number(r.headers.get('content-length'))>max) {await r.body?.cancel();throw new Error('jev_response_too_large');}
  if(!r.body) throw new Error('jev_empty_response');
  const chunks:Uint8Array[]=[];let bytes=0;const reader=r.body.getReader();
  try {while(true) {const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>max){await reader.cancel();throw new Error('jev_response_too_large');}chunks.push(value);}} finally {reader.releaseLock();}
  return Buffer.concat(chunks).toString('utf8');
}
export async function evaluateJev(article:AnalyzeInputArticle,opts:{timeoutMs?:number}={}) {
  if(!config.modelCallsEnabled) throw new Error('Model calls are disabled');
  const url=endpoint(),key=credential('models','TYPESAFE_API_KEY');
  if(!key) throw new Error('TYPESAFE_API_KEY is not configured');
  const request=buildJevRequest(article);
  // Existing receipt infrastructure treats an absent budget as unlimited: explicitly disallow it here.
  const [budget]=await sql`SELECT service FROM budgets WHERE service='typesafe'`;
  if(!budget) throw new Error('missing typesafe budget; apply database migrations');
  const receipt=await paidRequest({service:'typesafe',model:JEV_MODEL,purpose:'jev_selection_eval',subject:`article:${article.id}@${article.revision}`,
    identity:{endpoint:url,policy:JEV_POLICY_VERSION,request},
    requestSummary:{policyVersion:JEV_POLICY_VERSION,requestHash:sha256(stableJson(request)),bodyChars:request.state.body.length},
  },async()=>{
    const start=Date.now();
    let r:Response;
    try { r=await fetch(url,{method:'POST',redirect:'error',headers:{'content-type':'application/json',authorization:`Bearer ${key}`},body:JSON.stringify(request),signal:AbortSignal.timeout(opts.timeoutMs??30000)}); }
    catch {throw new Error('jev_transport_unknown');}
    if(!r.ok) {
      await r.body?.cancel();
      // Do not assume a 5xx response or timeout means the request was unbilled.
      if([400,401,402,403,404,422,429].includes(r.status)) throw new ProviderRejectedError(`jev_http_${r.status}`,r.status,r.status===429);
      throw new Error(`jev_http_${r.status}`);
    }
    const text=await boundedBody(r);let raw:Record<string,unknown>;
    try {const parsed=JSON.parse(text);raw=parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{invalidJsonShape:true};}
    catch {raw={invalidJson:true};}
    const u=raw.usage as {input_tokens?:unknown;output_tokens?:unknown}|undefined;
    const usage=Number.isSafeInteger(u?.input_tokens)&&Number(u?.input_tokens)>=0&&Number.isSafeInteger(u?.output_tokens)&&Number(u?.output_tokens)>=0
      ?{input_tokens:u!.input_tokens,output_tokens:u!.output_tokens,prompt_tokens:u!.input_tokens,completion_tokens:u!.output_tokens}:null;
    return {response:{...raw,_latencyMs:Date.now()-start},requestId:r.headers.get('x-request-id'),usage,cost:null};
  });
  let r;
  try {r=validateJevResponse(receipt.response);} catch {
    await rejectReceivedResponse(receipt.receiptId,'invalid Jev response');
    throw new Error('invalid Jev response');
  }
  return {...decideJev(article,r),receiptId:receipt.receiptId,reused:receipt.reused,model:JEV_MODEL,policyVersion:JEV_POLICY_VERSION,usage:r.usage,latencyMs:Number((receipt.response as {_latencyMs?:number})._latencyMs??0)};
}
