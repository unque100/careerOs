import { db } from 'hatchable';
import { respondToApiError } from 'lib/api-errors.js';
import { generateCareerText } from 'lib/career-ai.js';
import { clean, safeJson, consumeAiQuota, consumeRateLimit, consumeAiConsent, logActivity } from 'lib/career.js';
import { normalizeResearchOutput, tagList as normalizeTags } from 'lib/research-notes.js';
export const access='user';
export const methods=['GET','POST','DELETE'];

const MAX_SOURCE_TEXT=16000;
const MAX_HTML_BYTES=3000000;
const STATIC_LEARNING_SLUGS=new Set(['typescript-fundamentals','javascript-fundamentals','nodejs-runtime','nestjs-fundamentals','java-fundamentals','python-fundamentals','oop-fundamentals','sql-databases','dbms-fundamentals','operating-systems','computer-networking','mongodb-fundamentals','redis-queues','queues-workers','cloud-fundamentals','backend-api-design','application-security','distributed-systems','performance-scalability','behavioral-interviews','security-web-fundamentals','rxjs-fundamentals','nodejs-testing','sql-query-plans','low-level-design-patterns','hld-capacity-planning']);
const ALLOWED_HOSTS=[
 'developer.mozilla.org','nodejs.org','docs.nestjs.com','typescriptlang.org','docs.python.org',
 'postgresql.org','redis.io','docs.bullmq.io','mongodb.com','docs.aws.amazon.com',
 'learn.microsoft.com','owasp.org','opentelemetry.io','react.dev','kubernetes.io',
 'docker.com','refactoring.guru','stripe.com','github.com','docs.github.com',
 'developer.chrome.com','web.dev','developer.mozilla.org','go.dev','rust-lang.org'
];
function plain(value,max=1000){return String(value==null?'':value).replace(/\u0000/g,'').replace(/\s+/g,' ').trim().slice(0,max)}
function isAllowedHost(host){const h=String(host||'').toLowerCase().replace(/\.$/,'');return ALLOWED_HOSTS.some(d=>h===d||h.endsWith('.'+d))}
function safeResearchUrl(value){
 try{
  const u=new URL(String(value||''));
  if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443')return null;
  const h=u.hostname.toLowerCase();
  if(!isAllowedHost(h)||h==='localhost'||h.endsWith('.localhost')||h.endsWith('.local')||h.endsWith('.internal')||/^\d{1,3}(?:\.\d{1,3}){3}$/.test(h)||h.includes(':'))return null;
  u.hash='';
  return u;
 }catch{return null}
}
function decodeHtml(s){
 const decodePoint=(raw,radix=10)=>{const n=Number.parseInt(raw,radix);return Number.isInteger(n)&&n>=0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):' '};
 return String(s||'').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&#x([0-9a-f]+);/gi,(_,x)=>decodePoint(x,16)).replace(/&#(\d+);/g,(_,x)=>decodePoint(x,10));
}
function htmlToText(html){
 return decodeHtml(String(html||'')
  .replace(/<(script|style|noscript|svg|iframe|canvas|form|nav|footer|header|aside|template|object|embed|button)[^>]*>[\s\S]*?<\/\1\s*>/gi,' ')
  .replace(/<(br|\/p|\/h[1-6]|\/li|\/div|\/section|\/article|\/pre|\/tr)\b[^>]*>/gi,'\n')
  .replace(/<[^>]+>/g,' ')
  .replace(/[\t\f\v ]+/g,' ')
  .replace(/\n[ \t]+/g,'\n')
  .replace(/\n{3,}/g,'\n\n')
  .trim()).slice(0,MAX_SOURCE_TEXT);
}
async function readBoundedText(response,maxBytes){
 const reader=response.body&&typeof response.body.getReader==='function'?response.body.getReader():null;
 if(!reader){
  const text=await response.text();
  if(new TextEncoder().encode(text).byteLength>maxBytes)throw new Error('This page is too large to process safely.');
  return text;
 }
 const decoder=new TextDecoder(),parts=[];let total=0;
 try{
  while(true){
   const next=await reader.read();if(next.done)break;
   total+=next.value.byteLength;
   if(total>maxBytes){try{await reader.cancel()}catch(e){}throw new Error('This page is too large to process safely.')}
   parts.push(decoder.decode(next.value,{stream:true}));
  }
  parts.push(decoder.decode());
  return parts.join('');
 }finally{try{reader.releaseLock()}catch(e){}}
}
async function fetchApprovedPage(input){
 let current=safeResearchUrl(input);
 if(!current)throw new Error('For URL research, use HTTPS documentation on a supported public domain such as MDN, Node.js, TypeScript, PostgreSQL, Redis, MongoDB, AWS, Microsoft Learn, OWASP or GitHub.');
 for(let redirects=0;redirects<=3;redirects++){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  try{
   const response=await fetch(current.href,{method:'GET',redirect:'manual',signal:controller.signal,headers:{Accept:'text/html,text/plain,text/markdown;q=0.9','User-Agent':'CareerOS Research Notes/1.0'}});
   if([301,302,303,307,308].includes(response.status)){
    try{await response.body?.cancel()}catch(e){}
    if(redirects===3)throw new Error('The source redirected too many times.');
    const location=response.headers.get('location');
    if(!location)throw new Error('The source redirect has no destination.');
    current=safeResearchUrl(new URL(location,current).href);
    if(!current)throw new Error('The source redirected outside the supported public documentation domains.');
    continue;
   }
   if(!response.ok)throw new Error('The source returned HTTP '+response.status+'. It may require sign-in or disallow fetching.');
   const length=Number(response.headers.get('content-length')||0);
   if(length>MAX_HTML_BYTES)throw new Error('This page is too large to process safely.');
   const type=String(response.headers.get('content-type')||'').toLowerCase();
   if(!(type.includes('text/html')||type.includes('text/plain')||type.includes('text/markdown')||type.includes('application/xhtml+xml')))throw new Error('This URL does not serve supported HTML or text. Upload a PDF/DOCX file instead.');
   const raw=await readBoundedText(response,MAX_HTML_BYTES);
   const titleMatch=raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
   const title=plain(titleMatch?htmlToText(titleMatch[1]):current.hostname,180)||current.hostname;
   const content=type.includes('text/html')||type.includes('xhtml')?htmlToText(raw):plain(raw,MAX_SOURCE_TEXT);
   if(content.length<100)throw new Error('Not enough readable text was found on this page.');
   return {url:current.href,title,content:content.slice(0,MAX_SOURCE_TEXT)};
  }catch(e){
   if(e&&e.name==='AbortError')throw new Error('The source took too long to respond. Try another supported URL.');
   if(/too large|returned HTTP|does not serve|not enough readable|redirect/i.test(String(e&&e.message||'')))throw e;
   throw new Error('The source could not be retrieved. It may be unavailable or restrict automated access.');
  }finally{clearTimeout(timer)}
 }
 throw new Error('The source could not be retrieved.');
}
function arr(v,max=12){return Array.isArray(v)?v.slice(0,max):[]}
function tagList(v){const list=Array.isArray(v)?v:String(v||'').split(/[,;\n]/);return [...new Set(list.map(x=>plain(x,40).replace(/^#/,'')).filter(x=>x&&!/[<>]/.test(x)))].slice(0,12)}
function normalizeGenerated(data,source){
 const concepts=arr(data.keyConcepts,12).map(x=>typeof x==='string'?{concept:plain(x,180),detail:''}:{concept:plain(x.concept,180),detail:plain(x.detail,800)}).filter(x=>x.concept);
 const examples=arr(data.examples,8).map(x=>typeof x==='string'?{title:'Example',description:plain(x,1000)}:{title:plain(x.title,180)||'Example',description:plain(x.description||x.example,1600)}).filter(x=>x.description);
 const snippets=arr(data.codeSnippets,8).map(x=>({language:plain(x.language,40)||'text',code:String(x.code||'').slice(0,5000),explanation:plain(x.explanation,500)})).filter(x=>x.code);
 const questions=arr(data.interviewQuestions,12).map(x=>typeof x==='string'?{question:plain(x,500),answerOutline:''}:{question:plain(x.question,500),answerOutline:plain(x.answerOutline||x.answer_outline||'',1000)}).filter(x=>x.question);
 const citations=source?[{label:plain(source.title,180),url:source.url,accessedAt:new Date().toISOString()}]:[];
 return {
  title:plain(data.title,180)||plain(source?.title,180)||'Research notes',
  summary:plain(data.summary,3500),
  keyConcepts:concepts,
  examples,
  codeSnippets:snippets,
  interviewQuestions:questions,
  revisionChecklist:arr(data.revisionChecklist||data.revision_checklist,16).map(x=>plain(typeof x==='string'?x:x?.item,300)).filter(Boolean),
  tags:tagList(data.tags),
  sourceCitations:citations
 };
}
async function handle(req,res){
 const user=String(req.user.id),b=req.body||{};
 if(req.method==='GET'){
  if(req.query?.jobId!=null){
   const jobId=Number(req.query.jobId);if(!Number.isSafeInteger(jobId)||jobId<1)return res.status(400).json({error:'Choose a valid processing job ID.'});
   const job=await db.query('SELECT id,status,title,source_type,source_url,note_id,last_error,created_at,updated_at,completed_at FROM document_processing_jobs WHERE id=$1 AND user_id=$2',[jobId,user]);
   if(!job.rows.length)return res.status(404).json({error:'Processing job not found.'});
   return res.json({job:job.rows[0]});
  }
  const q=plain(req.query?.q,160),tag=plain(req.query?.tag,60),bookmarked=String(req.query?.bookmarked||'')==='true',id=Number(req.query?.id);
  if(req.query?.id!=null&&(!Number.isSafeInteger(id)||id<1))return res.status(400).json({error:'Choose a valid note ID.'});
  const params=[user];let where=' WHERE user_id=$1';
  if(Number.isSafeInteger(id)&&id>0){params.push(id);where+=' AND id=$'+params.length}
  if(q){params.push('%'+q.replace(/[%_\\]/g,c=>'\\'+c)+'%');where+=' AND (title ILIKE $'+params.length+' OR summary ILIKE $'+params.length+' OR editable_notes ILIKE $'+params.length+' OR source_excerpt ILIKE $'+params.length+')'}
  if(tag){params.push(tag);where+=' AND $'+params.length+'=ANY(tags)'}
  if(bookmarked)where+=' AND is_bookmarked=true';
  const limit=id?1:Math.min(100,Math.max(1,Math.floor(Number(req.query?.limit)||50)));
  const rows=await db.query('SELECT id,title,source_type,source_url,source_title,source_excerpt,summary,key_concepts,examples,code_snippets,interview_questions,revision_checklist,source_citations,editable_notes,tags,is_bookmarked,created_at,updated_at FROM research_notes'+where+' ORDER BY is_bookmarked DESC,updated_at DESC LIMIT '+limit,params);
  if(id&&!rows.rows.length)return res.status(404).json({error:'Research note not found.'});
  const ids=rows.rows.map(x=>x.id);
  let links=[];
  if(ids.length)links=(await db.query('SELECT note_id,learning_topic_slug,roadmap_task_id FROM research_note_links WHERE user_id=$1 AND note_id=ANY($2::bigint[]) ORDER BY created_at',[user,ids])).rows;
  if(id)return res.json({note:rows.rows[0],links:links.filter(x=>Number(x.note_id)===id)});
  const jobs=(await db.query("SELECT id,status,title,source_type,source_url,last_error,created_at,updated_at,completed_at FROM document_processing_jobs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10",[user])).rows;
  return res.json({notes:rows.rows,links,jobs,count:rows.rows.length});
 }
 const action=plain(b.action,40);
 if(req.method==='POST'&&action==='generate'){
  const sourceType=['url','topic','text','pdf','docx','markdown'].includes(b.sourceType)?b.sourceType:'topic';
  const rate=await consumeRateLimit(user,'research-notes-generate',6,60);
  if(!rate.allowed)return res.status(429).json({error:'Research generation is being requested too frequently. Try again in '+rate.retryAfterSeconds+' seconds.',retryAfterSeconds:rate.retryAfterSeconds});
  let source=null,content='';
  if(sourceType==='url'){
   const url=safeResearchUrl(b.url);
   if(!url)return res.status(400).json({error:'That URL is not on the supported HTTPS documentation allowlist. Private/internal hosts and restricted sites are not fetched.'});
   try{source=await fetchApprovedPage(url.href)}catch(e){return res.status(422).json({error:plain(e.message,400)})}
   content=source.content;
  }else{
   content=String(b.contentText||b.topic||'').replace(/\u0000/g,'').slice(0,MAX_SOURCE_TEXT);
   if(sourceType==='topic')content=plain(b.topic,1600);
   if(content.trim().length<20)return res.status(400).json({error:sourceType==='topic'?'Enter a specific research topic with enough detail to create useful notes.':'The extracted or pasted content is too short. Provide at least 20 characters.'});
   if(sourceType!=='topic')source={url:null,title:plain(b.title,180)||'User-provided '+sourceType.toUpperCase()+' content',userProvided:true};
  }
  const consent=await consumeAiConsent(user,b.consentId,'research_notes');
  if(!consent.allowed)return res.status(403).json({error:'Explicit, unused consent is required before sending this source text to the configured AI provider. Review the disclosure and confirm again.'});
  const quota=await consumeAiQuota(user);
  if(!quota.allowed)return res.status(429).json({error:'Monthly AI limit reached for your current plan.',usage:quota});
  const tags=tagList(b.tags);
  const title=plain(b.title,180)||plain(source?.title,180)||(sourceType==='topic'?plain(b.topic,180):'Research notes');
  const profile=(await db.query('SELECT target_role,current_job_role AS current_role,current_skills FROM career_profiles WHERE user_id=$1',[user])).rows[0]||null;
  const job=await db.query("INSERT INTO document_processing_jobs(user_id,job_type,source_type,title,source_url,source_title,source_text,tags,editable_notes,consent_id,status) VALUES($1,'research_notes',$2,$3,$4,$5,$6,$7,$8,$9,'queued') RETURNING id,status,title,source_type,source_url,created_at,updated_at",[user,sourceType,title,source?.url||null,source?.title||null,content,tags,clean(b.editableNotes,6000),consent.consent.id]);
  await logActivity(user,'research_note_generation_queued','document_processing_job',job.rows[0].id,{sourceType,sourceUrl:source?.url||null,characterCount:content.length,consentId:consent.consent.id});
  return res.status(202).json({job:job.rows[0],usage:quota,message:'Research source validated and saved to a private processing queue. CareerOS will create the notes in the background; keep this page open or check the job status.',disclosure:'Only a short source excerpt is saved with the final note. Source text held by the worker is cleared when processing succeeds or reaches its retry limit.'});
 }
 if(req.method==='POST'&&action==='cancel-job'){
  const jobId=Number(b.jobId);if(!Number.isSafeInteger(jobId)||jobId<1)return res.status(400).json({error:'Choose a valid processing job.'});
  const cancelled=await db.query("UPDATE document_processing_jobs SET status='cancelled',source_text='',updated_at=now() WHERE id=$1 AND user_id=$2 AND status='queued' RETURNING id,status",[jobId,user]);
  if(!cancelled.rows.length){
   const existing=await db.query('SELECT status FROM document_processing_jobs WHERE id=$1 AND user_id=$2',[jobId,user]);
   if(!existing.rows.length)return res.status(404).json({error:'Processing job not found.'});
   return res.status(409).json({error:'This job has already started or finished and cannot be cancelled from the queue.',status:existing.rows[0].status});
  }
  await logActivity(user,'research_note_job_cancelled','document_processing_job',jobId,{});
  return res.json({job:cancelled.rows[0],message:'Queued processing was cancelled and source text cleared.'});
 }
 if(req.method==='POST'&&action==='delete-job'){
  const jobId=Number(b.jobId);if(!Number.isSafeInteger(jobId)||jobId<1)return res.status(400).json({error:'Choose a valid processing job.'});
  const existing=await db.query('SELECT id,status FROM document_processing_jobs WHERE id=$1 AND user_id=$2',[jobId,user]);
  if(!existing.rows.length)return res.status(404).json({error:'Processing job not found.'});
  if(existing.rows[0].status==='processing')return res.status(409).json({error:'The worker is currently processing this job. Cancel or wait for it to finish before deleting its history.'});
  await db.query('DELETE FROM document_processing_jobs WHERE id=$1 AND user_id=$2',[jobId,user]);
  await logActivity(user,'research_note_job_history_deleted','document_processing_job',jobId,{previousStatus:existing.rows[0].status});
  return res.json({deleted:true,message:'Processing history deleted. Any final research note remains in your library until you delete it separately.'});
 }
 if(req.method==='POST'&&action==='update'){
  const id=Number(b.id);if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Choose a valid note.'});
  const own=await db.query('SELECT id FROM research_notes WHERE id=$1 AND user_id=$2',[id,user]);if(!own.rows.length)return res.status(404).json({error:'Research note not found.'});
  const tags=b.tags===undefined?null:tagList(b.tags);
  const result=await db.query('UPDATE research_notes SET title=CASE WHEN $3::boolean THEN $4 ELSE title END,editable_notes=CASE WHEN $5::boolean THEN $6 ELSE editable_notes END,summary=CASE WHEN $7::boolean THEN $8 ELSE summary END,tags=COALESCE($9::text[],tags),updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING *',[id,user,b.title!==undefined,plain(b.title,180),b.editableNotes!==undefined,clean(b.editableNotes,6000),b.summary!==undefined,clean(b.summary,3500),tags]);
  await logActivity(user,'research_note_updated','research_note',id,{});
  return res.json({note:result.rows[0]});
 }
 if(req.method==='POST'&&action==='bookmark'){
  const id=Number(b.id);if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Choose a valid note.'});
  const result=await db.query('UPDATE research_notes SET is_bookmarked=$3,updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING id,is_bookmarked',[id,user,Boolean(b.bookmarked)]);
  if(!result.rows.length)return res.status(404).json({error:'Research note not found.'});
  return res.json({note:result.rows[0]});
 }
 if(req.method==='POST'&&(action==='link-topic'||action==='link-task')){
  const noteId=Number(b.noteId);if(!Number.isSafeInteger(noteId)||noteId<1)return res.status(400).json({error:'Choose a note first.'});
  const own=await db.query('SELECT id FROM research_notes WHERE id=$1 AND user_id=$2',[noteId,user]);if(!own.rows.length)return res.status(404).json({error:'Research note not found.'});
  if(action==='link-topic'){
   const slug=plain(b.topicSlug,140);if(!/^[a-z0-9][a-z0-9-]{0,139}$/.test(slug))return res.status(400).json({error:'Choose a valid learning topic.'});
   const topic=await db.query('SELECT slug FROM learning_topics WHERE slug=$1',[slug]);if(!topic.rows.length&&!STATIC_LEARNING_SLUGS.has(slug))return res.status(404).json({error:'Learning topic not found.'});
   const link=await db.query('INSERT INTO research_note_links(user_id,note_id,learning_topic_slug) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id',[user,noteId,slug]);
   return res.json({linked:true,alreadyLinked:!link.rows.length});
  }
  const taskId=Number(b.taskId);if(!Number.isSafeInteger(taskId)||taskId<1)return res.status(400).json({error:'Choose a roadmap task.'});
  const task=await db.query('SELECT id FROM roadmap_tasks WHERE id=$1 AND user_id=$2',[taskId,user]);if(!task.rows.length)return res.status(404).json({error:'Roadmap task not found.'});
  const link=await db.query('INSERT INTO research_note_links(user_id,note_id,roadmap_task_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id',[user,noteId,taskId]);
  return res.json({linked:true,alreadyLinked:!link.rows.length});
 }
 if(req.method==='POST'&&action==='unlink'){
  const noteId=Number(b.noteId);if(!Number.isSafeInteger(noteId)||noteId<1)return res.status(400).json({error:'Choose a note.'});
  const deleted=await db.query('DELETE FROM research_note_links WHERE user_id=$1 AND note_id=$2 AND ((learning_topic_slug IS NOT NULL AND learning_topic_slug=$3) OR (roadmap_task_id IS NOT NULL AND roadmap_task_id=$4)) RETURNING id',[user,noteId,clean(b.topicSlug,140)||null,b.taskId==null?null:Number(b.taskId)]);
  return res.json({unlinked:!!deleted.rows.length});
 }
 if(req.method==='DELETE'){
  const id=Number(b.id);if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Choose a valid note.'});
  const deleted=await db.query('DELETE FROM research_notes WHERE id=$1 AND user_id=$2 RETURNING id',[id,user]);if(!deleted.rows.length)return res.status(404).json({error:'Research note not found.'});
  await logActivity(user,'research_note_deleted','research_note',id,{});
  return res.json({deleted:true});
 }
 return res.status(400).json({error:'Choose a supported research-note action.'});
}

export default async function(req,res){
 try{return await handle(req,res)}catch(error){return respondToApiError('api/research-notes.js',error,req,res)}
}