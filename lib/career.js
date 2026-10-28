import { db, config } from 'hatchable';

export function clean(value, max=1000) {
  return typeof value === 'string' ? value.replace(/\u0000/g,'').trim().slice(0,max) : '';
}
export function safeJson(text, fallback={}) {
  if (text && typeof text === 'object') return text;
  const raw=String(text||'').trim();
  const first=raw.indexOf('{'), last=raw.lastIndexOf('}');
  if(first>=0&&last>first){try{return JSON.parse(raw.slice(first,last+1))}catch{}}
  return fallback;
}
export async function logActivity(userId,eventName,entityType=null,entityId=null,data={}) {
  try {
    await db.query('INSERT INTO user_activity(user_id,event_name,entity_type,entity_id,event_data) VALUES($1,$2,$3,$4,$5::jsonb)',
      [String(userId),clean(eventName,100),clean(entityType,80)||null,entityId==null?null:String(entityId).slice(0,180),JSON.stringify(data||{})]);
    return true;
  } catch (error) {
    // Audit telemetry is best-effort: an already-committed user action must not be reported as a failed write.
    console.error('CareerOS activity logging failed', JSON.stringify({event:clean(eventName,100),error:clean(error&&error.message||error,180)}));
    return false;
  }
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
  return Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==value?undefined:value;
}

export async function consumeRateLimit(userId,bucket,maxRequests=10,windowSeconds=60) {
  const sid=String(userId||'');
  const key=clean(bucket,80);
  const limit=Math.max(1,Math.min(10000,Math.floor(Number(maxRequests)||10)));
  const window=Math.max(1,Math.min(86400,Math.floor(Number(windowSeconds)||60)));
  if(!sid||!key) return {allowed:false,limit,remaining:0,retryAfterSeconds:window};
  const now=Date.now();
  const startMs=Math.floor(now/(window*1000))*(window*1000);
  const start=new Date(startMs).toISOString();
  const r=await db.query("INSERT INTO user_rate_limits(user_id,bucket,window_start,request_count) VALUES($1,$2,$3,1) ON CONFLICT(user_id,bucket,window_start) DO UPDATE SET request_count=user_rate_limits.request_count+1,updated_at=now() WHERE user_rate_limits.request_count<$4 RETURNING request_count",[sid,key,start,limit]);
  if(r.rows.length) return {allowed:true,limit,used:Number(r.rows[0].request_count),remaining:Math.max(0,limit-Number(r.rows[0].request_count)),retryAfterSeconds:Math.max(1,Math.ceil((startMs+window*1000-now)/1000))};
  const count=await db.query('SELECT request_count FROM user_rate_limits WHERE user_id=$1 AND bucket=$2 AND window_start=$3',[sid,key,start]);
  return {allowed:false,limit,used:Number(count.rows[0]?.request_count||limit),remaining:0,retryAfterSeconds:Math.max(1,Math.ceil((startMs+window*1000-now)/1000))};
}

export async function consumeAiConsent(userId,consentId,purpose) {
  const id=Number(consentId);
  if(!Number.isSafeInteger(id)||id<1) return {allowed:false};
  const r=await db.query("UPDATE ai_processing_consents SET used_at=now() WHERE id=$1 AND user_id=$2 AND purpose=$3 AND used_at IS NULL AND consented_at>=now()-interval '30 minutes' RETURNING id,purpose,provider_label,source_type,source_ref,character_count,consented_at",[id,String(userId),String(purpose)]);
  return r.rows.length?{allowed:true,consent:r.rows[0]}:{allowed:false};
}