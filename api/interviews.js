import { ai, db } from 'hatchable';
import { clean, safeJson, consumeAiQuota, logActivity } from 'lib/career.js';
export const access = 'user';
export const methods = ['GET','POST','PUT'];
const types=new Set(['behavioral','technical','dsa','backend','nodejs','sql','lld','hld','system_design','role_specific']);
const qBank={
 behavioral:'Tell me about a difficult technical or professional challenge you faced. What was your specific role, what options did you consider, and what did you learn?',
 technical:'Explain a technical concept from your target role. Include how it works, where you would use it, and one trade-off.',
 dsa:'Given an integer array and a target, explain how you would find two distinct values that sum to the target. Discuss an efficient approach and complexity.',
 backend:'Design an API endpoint that must handle retries safely. How would you ensure idempotency, validate input and observe failures?',
 nodejs:'Explain how Node.js handles asynchronous I/O and what happens when a callback blocks the event loop.',
 sql:'How would you investigate a slow SQL query? Explain indexes, query plans and the trade-offs of adding an index.',
 lld:'Design a notification service that supports email, SMS and push through a common interface. Explain extensibility and failure handling.',
 hld:'Design a URL shortening service. Clarify requirements, estimate scale, propose APIs and data storage, and describe important trade-offs.',
 system_design:'Design a reliable multi-channel notification platform. Clarify requirements, data model, queues, retries and observability.',
 role_specific:'Describe a project most relevant to your target role. Explain its architecture, a difficult trade-off and how you verified its quality.'
};
export default async function(req,res){
 const user=String(req.user.id),b=req.body||{};
 if(req.method==='GET'){
  const sessions=await db.query("SELECT id,title,interview_type,difficulty,target_role,status,score,started_at,completed_at,(SELECT count(*)::int FROM interview_turns t WHERE t.session_id=s.id AND t.user_id=s.user_id) AS question_count FROM interview_sessions s WHERE user_id=$1 ORDER BY started_at DESC LIMIT 50",[user]);
  const id=Number(req.query?.id);
  let detail=null;
  if(Number.isSafeInteger(id)&&id>0){
   const s=await db.query('SELECT id,title,interview_type,difficulty,target_role,status,rubric,evaluation,score,started_at,completed_at FROM interview_sessions WHERE id=$1 AND user_id=$2',[id,user]);
   if(!s.rows.length)return res.status(404).json({error:'Interview session not found.'});
   const t=await db.query('SELECT id,turn_number,question,answer,evaluation,created_at FROM interview_turns WHERE session_id=$1 AND user_id=$2 ORDER BY turn_number',[id,user]);
   detail={...s.rows[0],turns:t.rows};
  }
  return res.json({sessions:sessions.rows,session:detail});
 }
 if(req.method==='POST'&&b.action==='start'){
  const type=types.has(b.interviewType)?b.interviewType:'technical',difficulty=['beginner','intermediate','advanced'].includes(b.difficulty)?b.difficulty:'intermediate';
  const role=clean(b.targetRole,160)||'your target role';
  const quota=await consumeAiQuota(user);
  if(!quota.allowed)return res.status(429).json({error:'Monthly AI limit reached for your current plan.',usage:quota});
  try{
   const result=await ai.generateText({model:'gpt-mini',purpose:'careeros-interview-question',userId:user,system:'You are an interview coach. Ask one realistic interview question at a time. Do not include the answer. Be respectful and aligned with role and difficulty.',prompt:'Generate one original '+difficulty+' level '+type+' interview question for '+role+'. Return JSON only: {"question":"...","evaluationCriteria":["..."]}. Make the question concise and answerable in a few minutes.',maxTokens:450});
   const parsed=safeJson(result?.text,{question:qBank[type],evaluationCriteria:['Correctness','Reasoning','Clarity']});
   const first=clean(parsed.question,2500)||qBank[type];
   const title=clean(b.title,180)||type.replaceAll('_',' ')+' mock interview';
   const s=await db.query('INSERT INTO interview_sessions(user_id,title,interview_type,difficulty,target_role,status,rubric) VALUES($1,$2,$3,$4,$5,\'in_progress\',$6::jsonb) RETURNING id,title,interview_type,difficulty,target_role,status,started_at',[user,title,type,difficulty,role,JSON.stringify({criteria:Array.isArray(parsed.evaluationCriteria)?parsed.evaluationCriteria.slice(0,10):[]})]);
   const t=await db.query('INSERT INTO interview_turns(session_id,user_id,turn_number,question) VALUES($1,$2,1,$3) RETURNING id,turn_number,question',[s.rows[0].id,user,first]);
   await logActivity(user,'interview_started','interview_session',s.rows[0].id,{type,difficulty});
   return res.status(201).json({session:s.rows[0],turn:t.rows[0],usage:quota});
  }catch(e){console.error('interview start failed',String(e&&e.message||e).slice(0,160));return res.status(503).json({error:'AI interview generation is unavailable. Check provider setup and retry.',usage:quota});}
 }
 if(req.method==='POST'&&b.action==='answer'){
  const sessionId=Number(b.sessionId),turnId=Number(b.turnId),answer=clean(b.answer,12000);
  if(!Number.isSafeInteger(sessionId)||!Number.isSafeInteger(turnId)||answer.length<3)return res.status(400).json({error:'Session, turn and a substantive answer are required.'});
  const session=await db.query("SELECT id,title,interview_type,difficulty,target_role,status FROM interview_sessions WHERE id=$1 AND user_id=$2",[sessionId,user]);
  if(!session.rows.length)return res.status(404).json({error:'Interview session not found.'});
  if(session.rows[0].status!=='in_progress')return res.status(409).json({error:'This interview session is not active.'});
  const turn=await db.query('SELECT id,turn_number,question,answer FROM interview_turns WHERE id=$1 AND session_id=$2 AND user_id=$3',[turnId,sessionId,user]);
  if(!turn.rows.length)return res.status(404).json({error:'Interview question not found.'});
  if(turn.rows[0].answer)return res.status(409).json({error:'This question has already been answered.'});
  const quota=await consumeAiQuota(user);
  if(!quota.allowed)return res.status(429).json({error:'Monthly AI limit reached for your current plan.',usage:quota});
  const count=Number((await db.query('SELECT count(*)::int AS n FROM interview_turns WHERE session_id=$1 AND user_id=$2',[sessionId,user])).rows[0].n);
  try{
   const result=await ai.generateText({model:'gpt-mini',purpose:'careeros-interview-evaluation',userId:user,system:'You are a fair interview coach. Give constructive feedback; distinguish objective technical correctness from subjective judgment. Do not claim to be a hiring decision. Generate at most one next question and do not provide an ideal answer unless asked.',prompt:'Evaluate this '+session.rows[0].interview_type+' interview answer for '+session.rows[0].target_role+' at '+session.rows[0].difficulty+' difficulty. Question: '+turn.rows[0].question+'\nCandidate answer: '+answer+'\nReturn JSON: {"score":0,"correctness":"...","strengths":["..."],"improvements":["..."],"suggestedAnswerOutline":["..."],"nextQuestion":"..."} Score is an indicative coaching score 0-100, not a hiring result. If uncertain, state what is missing.',maxTokens:1200});
   if(!result||!result.text)return res.status(502).json({error:'AI returned no evaluation.',usage:quota});
   const evaluation=safeJson(result.text,{summary:result.text});
   let score=Number(evaluation.score);if(!Number.isFinite(score))score=null;else score=Math.max(0,Math.min(100,Math.round(score)));
   await db.query('UPDATE interview_turns SET answer=$3,evaluation=$4::jsonb WHERE id=$1 AND session_id=$2 AND user_id=$5',[turnId,sessionId,answer,JSON.stringify({...evaluation,score}),user]);
   const finish=Boolean(b.finish)||count>=5;
   let nextTurn=null;
   if(!finish){
    const next=clean(evaluation.nextQuestion,2500)||qBank[session.rows[0].interview_type]||'What trade-offs would you evaluate before choosing that approach?';
    const t=await db.query('INSERT INTO interview_turns(session_id,user_id,turn_number,question) VALUES($1,$2,$3,$4) RETURNING id,turn_number,question',[sessionId,user,count+1,next]);
    nextTurn=t.rows[0];
   }else{
    await db.query("UPDATE interview_sessions SET status='completed',completed_at=now(),score=(SELECT ROUND(AVG((evaluation->>'score')::numeric))::int FROM interview_turns WHERE session_id=$1 AND user_id=$2 AND evaluation ? 'score') WHERE id=$1 AND user_id=$2",[sessionId,user]);
   }
   await logActivity(user,'interview_answer_submitted','interview_session',sessionId,{turn:turn.rows[0].turn_number,completed:finish});
   return res.json({evaluation:{...evaluation,score},nextTurn,completed:finish,usage:quota,disclaimer:'AI feedback is practice guidance, not a hiring decision.'});
  }catch(e){console.error('interview evaluation failed',String(e&&e.message||e).slice(0,160));return res.status(503).json({error:'Could not evaluate this answer. Check AI setup and retry.',usage:quota});}
 }
 if(req.method==='PUT'){
  const id=Number(b.id),action=clean(b.action,30);
  if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Valid session ID required.'});
  const s=await db.query('SELECT id FROM interview_sessions WHERE id=$1 AND user_id=$2',[id,user]);
  if(!s.rows.length)return res.status(404).json({error:'Interview session not found.'});
  if(action==='abandon'){const r=await db.query("UPDATE interview_sessions SET status='abandoned',completed_at=now() WHERE id=$1 AND user_id=$2 RETURNING id,status",[id,user]);return res.json({session:r.rows[0]})}
  if(action==='rename'){const r=await db.query('UPDATE interview_sessions SET title=$3 WHERE id=$1 AND user_id=$2 RETURNING id,title',[id,user,clean(b.title,180)||'Mock interview']);return res.json({session:r.rows[0]})}
  return res.status(400).json({error:'Unknown interview action.'});
 }
 return res.status(400).json({error:'Unsupported interview action.'});
}