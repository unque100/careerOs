import { db } from 'hatchable';
import { respondToApiError } from 'lib/api-errors.js';
import { logActivity, consumeRateLimit } from 'lib/career.js';
export const access='user';
export const methods=['GET','POST'];

const JUDGE0='https://ce.judge0.com';
const MAX_CODE=24000, MAX_CASE_INPUT=5000, MAX_CASE_OUTPUT=3000;
const LANGUAGE_IDS={cpp:105,c:103,python:113,java:91,javascript:102,typescript:101,go:107,rust:108,csharp:51,ruby:72,php:98,kotlin:111};
const LANGUAGE_NAMES={cpp:'C++',c:'C',python:'Python 3',java:'Java',javascript:'JavaScript / Node.js',typescript:'TypeScript',go:'Go',rust:'Rust',csharp:'C#',ruby:'Ruby',php:'PHP',kotlin:'Kotlin'};
const STOP=new Set([3,4,5,6,7,8,9,10,11,12,13,14]);
function cleanText(v,max){return String(v==null?'':v).replace(/\u0000/g,'').slice(0,max)}
function normalizeOutput(v){return String(v==null?'':v).replace(/\r\n/g,'\n').trim().split(/\s+/).join(' ')}
async function judge(path,options={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 try{
  const response=await fetch(JUDGE0+path,{...options,signal:controller.signal,headers:{'Content-Type':'application/json',Accept:'application/json',...(options.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const e=new Error(cleanText(data.error||data.message||('Judge0 HTTP '+response.status),250));e.status=response.status;throw e}
  return data;
 }finally{clearTimeout(timer)}
}
async function execute(language,sourceCode,testCase){
 const creation=await judge('/submissions?base64_encoded=false&wait=false',{method:'POST',body:JSON.stringify({
  source_code:sourceCode,language_id:LANGUAGE_IDS[language],stdin:testCase.input,
  expected_output:testCase.expectedOutput,cpu_time_limit:3,cpu_extra_time:1,wall_time_limit:5,
  memory_limit:128000,stack_limit:64000,max_processes_and_or_threads:32,enable_network:false
 })});
 const token=cleanText(creation.token,100);if(!token)throw new Error('The sandbox did not return a run token.');
 let last=null;
 for(let i=0;i<7;i++){
  await new Promise(resolve=>setTimeout(resolve,250));
  last=await judge('/submissions/'+encodeURIComponent(token)+'?base64_encoded=false&fields=stdout,stderr,compile_output,message,status,time,memory');
  if(STOP.has(Number(last.status?.id||0)))break;
 }
 const statusId=Number(last?.status?.id||0),done=STOP.has(statusId);
 const passed=done&&statusId===3;
 return {done,passed,statusId,token,status:String(last?.status?.description||'In Queue'),stdout:cleanText(last?.stdout,10000),stderr:cleanText(last?.stderr,5000),compileOutput:cleanText(last?.compile_output,5000),message:cleanText(last?.message,3000),timeSeconds:last?.time==null?null:Number(last.time),memoryKb:last?.memory==null?null:Number(last.memory)};
}
const PROBLEMS={
 'leetcode-two-sum':{title:'Two Sum',tests:[
  {name:'Example 1',input:'4\n2 7 11 15\n9\n',expectedOutput:'0 1',hidden:false},
  {name:'Example 2',input:'3\n3 2 4\n6\n',expectedOutput:'1 2',hidden:false},
  {name:'Negative and duplicate values',input:'4\n-3 4 3 90\n0\n',expectedOutput:'0 2',hidden:true},
  {name:'Target at array boundary',input:'2\n5 5\n10\n',expectedOutput:'0 1',hidden:true}
 ]},
 'leetcode-valid-parentheses':{title:'Valid Parentheses',tests:[
  {name:'Nested brackets',input:'()[]{}\n',expectedOutput:'true',hidden:false},
  {name:'Misordered brackets',input:'([)]\n',expectedOutput:'false',hidden:false},
  {name:'Single opening bracket',input:'(\n',expectedOutput:'false',hidden:true},
  {name:'Deep nested brackets',input:'{[()()]}\n',expectedOutput:'true',hidden:true}
 ]},
 'leetcode-best-time-to-buy-and-sell-stock':{title:'Best Time to Buy and Sell Stock',tests:[
  {name:'Example 1',input:'6\n7 1 5 3 6 4\n',expectedOutput:'5',hidden:false},
  {name:'No positive profit',input:'5\n7 6 4 3 1\n',expectedOutput:'0',hidden:false},
  {name:'Single price',input:'1\n8\n',expectedOutput:'0',hidden:true},
  {name:'Flat prices',input:'4\n3 3 3 3\n',expectedOutput:'0',hidden:true}
 ]},
 'leetcode-contains-duplicate':{title:'Contains Duplicate',tests:[
  {name:'Contains duplicate',input:'4\n1 2 3 1\n',expectedOutput:'true',hidden:false},
  {name:'All unique',input:'4\n1 2 3 4\n',expectedOutput:'false',hidden:false},
  {name:'Negative duplicate',input:'5\n-1 0 4 -1 8\n',expectedOutput:'true',hidden:true},
  {name:'One element',input:'1\n42\n',expectedOutput:'false',hidden:true}
 ]}
};
function safeTest(t,i,hidden=false){return {name:cleanText(t.name||('Test '+(i+1)),80),input:cleanText(t.input,MAX_CASE_INPUT),expectedOutput:cleanText(t.expectedOutput,MAX_CASE_OUTPUT),hidden}}

function recordTestResult(test,result){
 return {name:test.name,hidden:Boolean(test.hidden),passed:Boolean(result.passed),status:cleanText(result.status||'Unknown',100),stdout:cleanText(result.stdout,10000),stderr:cleanText(result.stderr,5000),compileOutput:cleanText(result.compileOutput,5000),message:cleanText(result.message,3000),timeSeconds:result.timeSeconds==null?null:Number(result.timeSeconds),memoryKb:result.memoryKb==null?null:Number(result.memoryKb)};
}
function resultFromJudge(test,last){
 const statusId=Number(last?.status?.id||0),done=STOP.has(statusId);
 return recordTestResult(test,{done,passed:done&&statusId===3,statusId,status:String(last?.status?.description||'In Queue'),stdout:last?.stdout,stderr:last?.stderr,compileOutput:last?.compile_output,message:last?.message,timeSeconds:last?.time,memoryKb:last?.memory});
}
function publicTestResults(results,action,tests){
 const visible=results.filter(x=>!x.hidden);
 if(action!=='submit')return visible;
 const hiddenResults=results.filter(x=>x.hidden),hiddenTotal=tests.filter(x=>x.hidden).length,hiddenPassed=hiddenResults.filter(x=>x.passed).length;
 return visible.concat([{name:'Hidden tests',hidden:true,passed:hiddenTotal>0&&hiddenResults.length===hiddenTotal&&hiddenPassed===hiddenTotal,passedCount:hiddenPassed,totalCount:hiddenTotal,status:'Hidden test details are private'}]);
}
function submissionStatus(results,tests,action,pending=false){
 if(pending)return 'Pending';
 if(results.some(x=>x.status==='Execution service error'))return 'Execution Service Error';
 const passed=results.filter(x=>x.passed).length;
 if(passed===tests.length)return action==='submit'?'Accepted':'All tests passed';
 if(results.some(x=>/time limit/i.test(x.status)))return 'Time Limit Exceeded';
 if(results.some(x=>/memory limit/i.test(x.status)))return 'Memory Limit Exceeded';
 if(results.some(x=>/compilation error/i.test(x.status)))return 'Compilation Error';
 if(action==='submit')return 'Wrong Answer';
 return passed===results.filter(x=>!x.hidden).length?'All visible tests passed':'Some tests failed';
}

async function handle(req,res){
 const user=String(req.user.id);
 if(req.method==='GET'){
  const limit=Math.max(1,Math.min(50,Math.floor(Number(req.query?.limit)||20)));
  const slug=cleanText(req.query?.problemSlug||'',180);
  const [r,aggregate,days]=await Promise.all([
   db.query('SELECT id,problem_slug,problem_title,language,source_code,submission_type,status,passed_count,total_count,test_results,max_runtime_seconds,max_memory_kb,created_at FROM coding_submissions WHERE user_id=$1'+(slug?' AND problem_slug=$2':'')+' ORDER BY created_at DESC LIMIT '+limit,slug?[user,slug]:[user]),
   db.query("SELECT count(*)::int AS runs,count(*) FILTER(WHERE submission_type='submit')::int AS submissions,count(*) FILTER(WHERE submission_type='submit' AND status='Accepted')::int AS accepted,count(DISTINCT problem_slug) FILTER(WHERE problem_slug<>'custom-practice')::int AS unique_problems FROM coding_submissions WHERE user_id=$1",[user]),
   db.query("SELECT DISTINCT (created_at AT TIME ZONE 'UTC')::date AS day FROM coding_submissions WHERE user_id=$1 ORDER BY day DESC LIMIT 365",[user])
  ]);
  const dateNums=days.rows.map(x=>Date.parse(String(x.day).slice(0,10)+'T00:00:00Z')).filter(Number.isFinite);
  let currentStreak=0,longestStreak=0,run=0,previous=null;
  for(const ms of dateNums){const delta=previous===null?1:Math.round((previous-ms)/86400000);run=delta===1?run+1:1;if(previous===null)currentStreak=0;previous=ms;longestStreak=Math.max(longestStreak,run)}
  if(dateNums.length){const today=Date.parse(new Date().toISOString().slice(0,10)+'T00:00:00Z'),age=Math.round((today-dateNums[0])/86400000);if(age<=1){currentStreak=1;let prev=dateNums[0];for(let i=1;i<dateNums.length;i++){if(Math.round((prev-dateNums[i])/86400000)!==1)break;currentStreak++;prev=dateNums[i]}}}
  const totals=aggregate.rows[0]||{};const stats={...totals,accuracy:Number(totals.submissions||0)?Math.round(Number(totals.accepted||0)/Number(totals.submissions||0)*100):0,currentStreak,longestStreak,activeDays:dateNums.length};
  return res.json({submissions:r.rows,stats});
 }
 const b=req.body||{},action=cleanText(b.action,40),slug=cleanText(b.problemSlug||'',180),title=cleanText(b.problemTitle||'',180)||PROBLEMS[slug]?.title||'Custom practice',language=cleanText(b.language,30).toLowerCase(),sourceCode=cleanText(b.sourceCode,MAX_CODE);
 const requestLimit=await consumeRateLimit(user,action==='poll'?'code-submission-poll':'code-submissions',action==='poll'?30:action==='submit'?5:10,60);
 if(!requestLimit.allowed)return res.status(429).json({error:'Code execution requests are rate-limited. Retry in '+requestLimit.retryAfterSeconds+' seconds.',retryAfterSeconds:requestLimit.retryAfterSeconds});
 if(action==='poll'){
  const submissionId=Number(b.submissionId);
  if(!Number.isSafeInteger(submissionId)||submissionId<1)return res.status(400).json({error:'A valid submission ID is required.'});
  const found=await db.query('SELECT id,user_id,problem_slug,problem_title,language,source_code,submission_type,status,passed_count,total_count,test_results,execution_state,max_runtime_seconds,max_memory_kb,created_at FROM coding_submissions WHERE id=$1 AND user_id=$2',[submissionId,user]);
  if(!found.rows.length)return res.status(404).json({error:'Submission not found.'});
  const row=found.rows[0];
  if(row.status!=='Pending')return res.json({submission:{id:row.id,created_at:row.created_at},problemSlug:row.problem_slug,problemTitle:row.problem_title,language:row.language,status:row.status,passedCount:Number(row.passed_count||0),totalCount:Number(row.total_count||0),results:row.test_results||[],maxRuntimeSeconds:row.max_runtime_seconds,maxMemoryKb:row.max_memory_kb,pending:false});
  let runState=row.execution_state||{};
  if(typeof runState==='string'){try{runState=JSON.parse(runState)}catch(e){runState={}}}
  const tests=Array.isArray(runState.tests)?runState.tests:[],results=Array.isArray(runState.results)?runState.results:[];
  const currentIndex=Number(runState.currentTestIndex);
  const token=cleanText(runState.currentToken,100);
  if(!token||!tests[currentIndex])return res.status(409).json({error:'This pending run is missing its polling state. Run the tests again.'});
  let latest;
  try{latest=await judge('/submissions/'+encodeURIComponent(token)+'?base64_encoded=false&fields=stdout,stderr,compile_output,message,status,time,memory')}catch(e){return res.status(502).json({error:'Could not check the sandbox run yet: '+cleanText(e.message,180),pending:true,submissionId})}
  const currentStatus=Number(latest.status?.id||0);
  if(!STOP.has(currentStatus))return res.status(202).json({pending:true,submissionId,status:'Pending',executionStatus:String(latest.status?.description||'In Queue'),message:'The sandbox is still processing this test. Check again shortly.'});
  const currentTest=tests[currentIndex],currentResult=resultFromJudge(currentTest,latest);
  results[currentIndex]=currentResult;
  let maxRuntime=Number(runState.maxRuntime||0),maxMemory=Number(runState.maxMemory||0);
  if(currentResult.timeSeconds!=null)maxRuntime=Math.max(maxRuntime,currentResult.timeSeconds);
  if(currentResult.memoryKb!=null)maxMemory=Math.max(maxMemory,currentResult.memoryKb);
  let nextIndex=Number(runState.nextIndex||0),pending=false;
  runState.currentToken='';runState.currentTestIndex=-1;
  if([5,6,11,12].includes(currentStatus))nextIndex=tests.length;
  for(let i=nextIndex;i<tests.length;i++){
   let nextResult;
   try{nextResult=await execute(row.language,row.source_code,tests[i])}
   catch(e){nextResult={done:true,passed:false,statusId:0,status:'Execution service error',stderr:cleanText(e.message,500),stdout:'',compileOutput:'',message:'Execution provider error',timeSeconds:null,memoryKb:null}}
   results[i]=recordTestResult(tests[i],nextResult);
   if(nextResult.timeSeconds!=null)maxRuntime=Math.max(maxRuntime,nextResult.timeSeconds);
   if(nextResult.memoryKb!=null)maxMemory=Math.max(maxMemory,nextResult.memoryKb);
   if(!nextResult.done){
    runState.currentToken=nextResult.token;runState.currentTestIndex=i;runState.nextIndex=i+1;pending=true;break;
   }
   nextIndex=i+1;
   if([5,6,11,12].includes(Number(nextResult.statusId))||nextResult.status==='Execution service error'){nextIndex=tests.length;break}
  }
  runState.tests=tests;runState.results=results;runState.nextIndex=nextIndex;runState.maxRuntime=maxRuntime;runState.maxMemory=maxMemory;
  const completedResults=results.filter(Boolean),actionName=row.submission_type==='submit'?'submit':'run-tests';
  const status=submissionStatus(completedResults,tests,actionName,pending);
  const safeResults=publicTestResults(completedResults,actionName,tests),passed=completedResults.filter(x=>x.passed).length;
  const updated=await db.query('UPDATE coding_submissions SET status=$3,passed_count=$4,total_count=$5,test_results=$6::jsonb,execution_state=$7::jsonb,max_runtime_seconds=$8,max_memory_kb=$9 WHERE id=$1 AND user_id=$2 AND status=$10 RETURNING id,created_at',[submissionId,user,status,passed,tests.length,JSON.stringify(safeResults),JSON.stringify(pending?runState:{}),maxRuntime||null,maxMemory||null,'Pending']);
  if(!updated.rows.length){
   const latestRow=await db.query('SELECT id,created_at,status,passed_count,total_count,test_results,max_runtime_seconds,max_memory_kb,problem_slug,problem_title,language FROM coding_submissions WHERE id=$1 AND user_id=$2',[submissionId,user]);
   const z=latestRow.rows[0];if(!z)return res.status(404).json({error:'Submission not found.'});
   return res.json({submission:{id:z.id,created_at:z.created_at},problemSlug:z.problem_slug,problemTitle:z.problem_title,language:z.language,status:z.status,passedCount:Number(z.passed_count||0),totalCount:Number(z.total_count||0),results:z.test_results||[],maxRuntimeSeconds:z.max_runtime_seconds,maxMemoryKb:z.max_memory_kb,pending:z.status==='Pending'});
  }
  if(!pending&&actionName==='submit'&&row.problem_slug&&row.problem_slug!=='custom-practice'){
   await db.query('INSERT INTO coding_attempts(user_id,problem_id,problem_slug,status,language,approach_notes,time_complexity,space_complexity,actual_minutes) VALUES($1,NULL,$2,$3,$4,$5,NULL,NULL,0)',[user,row.problem_slug,status==='Accepted'?'solved':'attempted',row.language,'Automated sandbox submission: '+status]);
  }
  if(!pending)await logActivity(user,'code_submission_completed','coding_submission',submissionId,{problemSlug:row.problem_slug,status,passed,total:tests.length,language:row.language});
  return res.json({submission:{id:submissionId,created_at:row.created_at},problemSlug:row.problem_slug,problemTitle:row.problem_title,language:row.language,status,passedCount:passed,totalCount:tests.length,visibleCount:completedResults.filter(x=>!x.hidden).length,hiddenPassed:completedResults.filter(x=>x.hidden&&x.passed).length,hiddenTotal:tests.filter(x=>x.hidden).length,results:safeResults,maxRuntimeSeconds:maxRuntime||null,maxMemoryKb:maxMemory||null,pending,disclaimer:'Untrusted code runs in a third-party sandbox with CPU, wall-time, memory and network restrictions. Do not submit secrets.'});
 }
 if(!['run-tests','submit'].includes(action))return res.status(400).json({error:'Choose run-tests, submit, or poll.'});
 if(!LANGUAGE_IDS[language])return res.status(400).json({error:'Choose a supported programming language.'});
 if(!sourceCode.trim())return res.status(400).json({error:'Write code before running tests.'});
 if(String(b.sourceCode||'').length>MAX_CODE)return res.status(413).json({error:'Code exceeds the 24,000 character limit.'});
 let tests,internal=PROBLEMS[slug];
 if(action==='submit'){
  if(!internal)return res.status(400).json({error:'Hidden-test submission is currently available for Two Sum, Valid Parentheses, Best Time to Buy and Sell Stock, and Contains Duplicate. Use Run Tests for custom input on other problems.'});
  tests=internal.tests.map((t,i)=>safeTest(t,i,t.hidden));
 }else{
  const inputCases=Array.isArray(b.testCases)?b.testCases:[];
  if(inputCases.length<1||inputCases.length>6)return res.status(400).json({error:'Provide 1 to 6 custom test cases.'});
  if(inputCases.some(t=>typeof t.input!=='string'||typeof t.expectedOutput!=='string'))return res.status(400).json({error:'Every test case needs input and expected output text.'});
  tests=inputCases.map((t,i)=>safeTest(t,i,false));
 }
 const rate=await db.query("SELECT count(*)::int AS n FROM coding_submissions WHERE user_id=$1 AND created_at>now()-interval '1 minute'",[user]);
 if(Number(rate.rows[0]?.n||0)>=(action==='submit'?5:10))return res.status(429).json({error:'Coding test limit reached for this minute. Wait briefly before trying again.'});
 const results=[];let maxRuntime=0,maxMemory=0,finished=true,pendingExecution=null;
 try{
  for(let i=0;i<tests.length;i++){
   const test=tests[i];let result;
   try{result=await execute(language,sourceCode,test)}catch(e){result={done:true,passed:false,statusId:0,status:'Execution service error',stderr:cleanText(e.message,500),stdout:'',compileOutput:'',message:'Execution provider error',timeSeconds:null,memoryKb:null}}
   if(result.timeSeconds!=null)maxRuntime=Math.max(maxRuntime,result.timeSeconds);
   if(result.memoryKb!=null)maxMemory=Math.max(maxMemory,result.memoryKb);
   results.push(recordTestResult(test,result));
   if(!result.done){finished=false;pendingExecution={tests,results:results.slice(),nextIndex:i+1,currentToken:result.token,currentTestIndex:i,maxRuntime,maxMemory};break}
   if([5,6,11,12].includes(Number(result.statusId))||result.status==='Execution service error')break;
  }
  const passed=results.filter(x=>x.passed).length;
  const status=submissionStatus(results,tests,action,!finished);
  const clientResults=publicTestResults(results,action,tests);
  const executionState=pendingExecution||{};
  const persisted=await db.query('INSERT INTO coding_submissions(user_id,problem_slug,problem_title,language,source_code,submission_type,status,passed_count,total_count,test_results,execution_state,max_runtime_seconds,max_memory_kb) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13) RETURNING id,created_at',[user,slug||'custom-practice',title,language,sourceCode,action==='submit'?'submit':'run',status,passed,tests.length,JSON.stringify(clientResults),JSON.stringify(executionState),maxRuntime||null,maxMemory||null]);
  if(action==='submit'&&finished&&slug&&slug!=='custom-practice'){await db.query('INSERT INTO coding_attempts(user_id,problem_id,problem_slug,status,language,approach_notes,time_complexity,space_complexity,actual_minutes) VALUES($1,NULL,$2,$3,$4,$5,NULL,NULL,0)',[user,slug,status==='Accepted'?'solved':'attempted',language,'Automated sandbox submission: '+status]);}
  await logActivity(user,'code_'+(action==='submit'?'submitted':'tests_run'),'coding_submission',persisted.rows[0].id,{problemSlug:slug,status,passed,total:tests.length,language});
  return res.json({submission:{id:persisted.rows[0].id,created_at:persisted.rows[0].created_at},problemSlug:slug,problemTitle:title,language,status,pending:!finished,passedCount:passed,totalCount:tests.length,visibleCount:results.filter(x=>!x.hidden).length,hiddenPassed:results.filter(x=>x.hidden&&x.passed).length,hiddenTotal:tests.filter(x=>x.hidden).length,results:clientResults,maxRuntimeSeconds:maxRuntime||null,maxMemoryKb:maxMemory||null,source:'Judge0 CE public execution service',disclaimer:'Untrusted code runs in a third-party sandbox with bounded CPU, wall time, memory and network disabled. Do not submit secrets. Results for custom tests are not official LeetCode verdicts.'});
 }catch(e){
  console.error('code submit failed',cleanText(e.message,180));
  return res.status(e.status&&e.status<500?e.status:502).json({error:'Code execution service is temporarily unavailable: '+cleanText(e.message,220)});
 }
}

export default async function(req,res){
 try{return await handle(req,res)}catch(error){return respondToApiError('api/submissions.js',error,req,res)}
}