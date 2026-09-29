// Sole public read boundary for the headless topical edition; never exports raw article objects.
import { sql } from "../db.ts";
import { WORLD_PROFILE, WORLD_POLICY_VERSION } from "@aihot/industry/world-physical";
export interface NewsItem {id:string;topic:string;title:string;summary:string;source:string;url:string;publishedAt:string|null;discoveredAt:string}
export async function exportWorldPhysical() {
 return sql.begin(async tx=>{
  await tx`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`;
  // Once an approved version loses eligibility, record the removal before reading public data.
  await tx`INSERT INTO news_removals(item_id,reviewer,reason)
   SELECT 'news-'||d.id,'system','Approved version lost eligibility'
   FROM news_decisions d JOIN articles a ON a.id=d.article_id JOIN sources s ON s.id=a.source_id LEFT JOIN news_sources n ON n.source_id=a.source_id
   WHERE EXISTS(SELECT 1 FROM news_reviews r WHERE r.decision_id=d.id AND r.action='approve')
   AND (d.input_revision<>a.revision OR d.profile<>${WORLD_PROFILE} OR d.policy<>${WORLD_POLICY_VERSION} OR d.decision<>'select' OR d.state<>'ready' OR n.allowed IS DISTINCT FROM true OR s.participation_mode<>'editorial') ON CONFLICT DO NOTHING`;
  const rows=await tx`SELECT 'news-'||d.id AS id,d.topic,d.title,d.summary,s.name AS source,a.url,a.published_at,a.discovered_at,r.created_at AS approved_at
   FROM news_decisions d JOIN articles a ON a.id=d.article_id JOIN sources s ON s.id=a.source_id JOIN news_sources n ON n.source_id=a.source_id
   JOIN LATERAL(SELECT * FROM news_reviews WHERE decision_id=d.id ORDER BY id DESC LIMIT 1) r ON true
   WHERE d.profile=${WORLD_PROFILE} AND d.policy=${WORLD_POLICY_VERSION} AND d.input_revision=a.revision AND d.decision='select' AND d.state='ready'
   AND d.topic IN ('world-models','physical-ai','both') AND length(d.title)>0 AND length(d.summary)>0 AND n.allowed AND s.participation_mode='editorial'
   AND r.action='approve' AND r.created_at<=now() AND NOT EXISTS(SELECT 1 FROM news_removals m WHERE m.item_id='news-'||d.id)
   ORDER BY coalesce(a.published_at,a.discovered_at) DESC,d.article_id LIMIT 100`;
  const removed=await tx`SELECT item_id,created_at FROM news_removals ORDER BY item_id`;
  const dates=[...rows.map(r=>r.approved_at),...removed.map(r=>r.created_at)].map(d=>new Date(d).getTime());
  const updatedAt=dates.length?new Date(Math.max(...dates)).toISOString():null;
  const items:NewsItem[]=rows.map(r=>({id:r.id,topic:r.topic,title:r.title,summary:r.summary,source:r.source,url:r.url,publishedAt:r.published_at?new Date(r.published_at).toISOString():null,discoveredAt:new Date(r.discovered_at).toISOString()}));
  return {snapshot:{schemaVersion:1,profile:WORLD_PROFILE,updatedAt,items},removals:{schemaVersion:1,updatedAt,ids:removed.map(r=>r.item_id as string)}};
 });
}
