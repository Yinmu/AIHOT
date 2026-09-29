import { sql } from "../db.ts";
import { fetchRss } from "../sources/rss.ts";
import type { SourceRow } from "../sources/types.ts";
import { sha256, stableJson } from "../lib/ids.ts";
import { identityKeyFor, upsertMaterial } from "../content/materials.ts";
import { extractArticleBody } from "../content/extract.ts";
export const NEWS_SOURCES=[
 {id:"news-deepmind",name:"Google DeepMind",url:"https://deepmind.google/blog/rss.xml"},
 {id:"news-nvidia",name:"NVIDIA",url:"https://blogs.nvidia.com/feed/"},
 {id:"news-bair",name:"Berkeley AI Research",url:"https://bair.berkeley.edu/blog/feed.xml"},
];
export async function initNewsSources() {
 for(const s of NEWS_SOURCES)await sql.begin(async tx=>{
  // Disabled in the generic scheduler: this CLI is the only intended collection entry.
  await tx`INSERT INTO sources(id,name,kind,config,tier,first_party,site_fulltext,syndicate_fulltext,enabled) VALUES(${s.id},${s.name},'rss',${tx.json({feedUrl:s.url})},'T1',true,false,false,false) ON CONFLICT(id) DO NOTHING`;
  await tx`INSERT INTO news_sources(source_id) VALUES(${s.id}) ON CONFLICT DO NOTHING`;
 });
 return NEWS_SOURCES.map(({id,name})=>({id,name}));
}
export async function collectNewsSource(sourceId:string,limit=5) {
 if(process.env.COLLECT_ENABLED!=="true")throw new Error("collection disabled");
 if(!Number.isInteger(limit)||limit<1||limit>30)throw new Error("collection limit must be 1..30");
 const [s]=await sql<SourceRow[]>`SELECT s.* FROM sources s JOIN news_sources n ON n.source_id=s.id WHERE s.id=${sourceId} AND n.allowed AND s.kind='rss' AND s.participation_mode='editorial'`;
 if(!s)throw new Error("source not enabled for topical news");
 try {
  // Forced bounded listing on demand: no ETag is persisted until every feed entry is consumed.
  const feed=await fetchRss(s,{force:true});const ids:string[]=[];
  if(feed.candidates.length>1000)throw new Error("feed has too many entries");
  const now=Date.now(),seen:Record<string,number>={};
  const previous=s.cursor?.newsSeen??{};
  const keyed=feed.candidates.map(c=>({c,key:sha256(stableJson({url:c.url,title:c.title,body:c.bodyText??null,excerpt:c.excerpt??null}))}));
  for(const {key} of keyed)if(typeof previous[key]==="number")seen[key]=previous[key];
  const pending=await sql<{identity_key:string}[]>`SELECT identity_key FROM articles WHERE source_id=${sourceId} AND body_status<>'ok'`;
  const pendingKeys=new Set(pending.map(a=>a.identity_key));
  // New/changed entries first. Retry incomplete material at most hourly, after fresh entries.
  const fresh=keyed.filter(x=>!seen[x.key]);
  const retry=keyed.filter(x=>seen[x.key]&&now-seen[x.key]>=3600000&&pendingKeys.has(identityKeyFor({...x.c,sourceId,via:"fetch"})));
  const batch=[...fresh,...retry].slice(0,limit);
  for(const {c,key} of batch) {
   const m=await upsertMaterial({...c,sourceId,via:"fetch"});
   await extractArticleBody(m.articleId,false); // no paid Jina fallback
   ids.push(m.articleId);seen[key]=now;
  }
  await sql`UPDATE sources SET cursor=jsonb_set(coalesce(cursor,'{}'::jsonb),'{newsSeen}',${sql.json(seen)}::jsonb) WHERE id=${sourceId}`;
  await sql`UPDATE news_sources SET last_success_at=now(),last_error=NULL WHERE source_id=${sourceId}`;
  return {sourceId,found:feed.candidates.length,processed:ids.length,ids};
 } catch {
  await sql`UPDATE news_sources SET last_error='collection_failed' WHERE source_id=${sourceId}`;
  throw new Error("collection_failed: "+sourceId); // source/provider text can contain credentials
 }
}
