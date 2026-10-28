import { db } from 'hatchable';
import { respondToApiError } from 'lib/api-errors.js';
import { clean, consumeRateLimit, logActivity } from 'lib/career.js';
export const access='user';
export const methods=['GET','POST'];
const PURPOSES=new Set(['resume_analysis','resume_assistance','job_analysis','research_notes','career_chat_attachment']);
const SOURCES=new Set(['resume','cv','job_description','url','topic','text','pdf','docx','markdown','document','application']);
async function handle(req,res){
 const user=String(req.user.id),b=req.body||{};
 if(req.method==='GET'){
  const rows=await db.query("SELECT id,purpose,provider_label,source_type,source_ref,character_count,consented_at,used_at FROM ai_processing_consents WHERE user_id=$1 ORDER BY consented_at DESC LIMIT 50",[user]);
  return res.json({consents:rows.rows,notice:'Consent records document individual AI processing actions. A consent is single-use and expires after 30 minutes if unused.'});
 }
 const limit=await consumeRateLimit(user,'ai-consent',20,3600);
 if(!limit.allowed)return res.status(429).json({error:'Too many consent requests. Retry after '+limit.retryAfterSeconds+' seconds.',retryAfterSeconds:limit.retryAfterSeconds});
 const purpose=clean(b.purpose,40),sourceType=clean(b.sourceType,40),sourceRef=clean(b.sourceRef,240)||null;
 const characterCount=b.characterCount==null?0:Number(b.characterCount);
 if(b.confirmed!==true)return res.status(400).json({error:'Explicit consent is required before sending private text to the configured AI provider.'});
 if(!PURPOSES.has(purpose)||!SOURCES.has(sourceType))return res.status(400).json({error:'Choose a supported AI processing purpose and source type.'});
 if(!Number.isSafeInteger(characterCount)||characterCount<0||characterCount>100000)return res.status(400).json({error:'Source size must be a number of characters from 0 to 100,000.'});
 const provider='CareerOS configured AI provider';
 const saved=await db.query("INSERT INTO ai_processing_consents(user_id,purpose,consent_version,provider_label,source_type,source_ref,character_count) VALUES($1,$2,'careeros-ai-document-processing-v1',$3,$4,$5,$6) RETURNING id,purpose,provider_label,source_type,source_ref,character_count,consented_at,used_at",[user,purpose,provider,sourceType,sourceRef,characterCount]);
 await logActivity(user,'ai_document_consent_given','ai_processing_consent',saved.rows[0].id,{purpose,sourceType,characterCount});
 return res.status(201).json({consent:saved.rows[0],message:'Consent recorded for this processing action only. It is single-use and expires after 30 minutes if unused.',disclosure:'The specified text may be sent to the AI provider configured for CareerOS to generate the requested result. Provider-specific retention and processing are governed by the provider and the deployment configuration.'});
}

export default async function(req,res){
 try{return await handle(req,res)}catch(error){return respondToApiError('api/ai-consent.js',error,req,res)}
}