import { db, config } from 'hatchable';

export function clean(value, max=1000) {
  return typeof value === 'string' ? value.trim().slice(0,max) : '';
}
export function safeJson(text, fallback={}) {
  if (text && typeof text === 'object') return text;
  const raw=String(text||'').trim();
  const first=raw.indexOf('{'), last=raw.lastIndexOf('}');
  if(first>=0&&last>first){try{return JSON.parse(raw.slice(first,last+1))}catch{}}
  return fallback;
}
export async function logActivity(userId,eventName,entityType=null,entityId=null,data={}) {
  await db.query('INSERT INTO user_activity(user_id,event_name,entity_type,entity_id,event_data) VALUES($1,$2,$3,$4,$5::jsonb)',
    [String(userId),eventName,entityType,entityId==null?null:String(entityId),JSON.stringify(data)]);
}
export async function consumeAiQuota(userId) {
  const sid=String(userId);
  const sub=await db.query("SELECT plan_id,status FROM subscriptions WHERE user_id=$1 AND status='active' AND (expires_at IS NULL OR expires_at>now()) LIMIT 1",[sid]);
  const pro=sub.rows[0]?.plan_id==='pro'||sub.rows[0]?.plan_id==='enterprise';
  const rawLimit=await config.get(pro?'pro_monthly_ai_limit':'free_monthly_ai_limit');
  const limit=Math.max(0,Math.min(10000,Number(rawLimit??(pro?300:20))));
  const today=new Date();
  const monthStart=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),1)).toISOString().slice(0,10);
  if(limit===0)return {allowed:false,used:0,limit,plan:pro?'pro':'free'};
  const r=await db.query("INSERT INTO ai_usage_monthly(user_id,month_start,request_count) VALUES($1,$2,1) ON CONFLICT(user_id,month_start) DO UPDATE SET request_count=ai_usage_monthly.request_count+1,updated_at=now() WHERE ai_usage_monthly.request_count<$3 RETURNING request_count",
    [sid,monthStart,limit]);
  if(!r.rows.length){
    const n=await db.query('SELECT request_count FROM ai_usage_monthly WHERE user_id=$1 AND month_start=$2',[sid,monthStart]);
    return {allowed:false,used:Number(n.rows[0]?.request_count||0),limit,plan:pro?'pro':'free'};
  }
  return {allowed:true,used:Number(r.rows[0].request_count),limit,plan:pro?'pro':'free'};
}
export function parseDate(value) {
  if(!value)return null;
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return undefined;
  const d=new Date(value+'T00:00:00Z');
  return Number.isNaN(d.getTime())?undefined:value;
}