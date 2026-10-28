import { db } from 'hatchable';
import { clean, logActivity } from 'lib/career.js';

export const access = 'user';
export const methods = ['GET', 'POST'];

const SOURCE_URL = 'https://leetcode-api-pied.vercel.app/problems';
const CACHE_MS = 30 * 60 * 1000;
const CURATED_LIMITS = { Easy: 110, Medium: 190, Hard: 110 };
const PRACTICE_GUIDES = {
 'two-sum':{problemStatement:'Given an integer array and a target, return the indices of two distinct elements whose values sum to the target.',hints:['A nested loop is a valid baseline, but it repeats work.','For each number x, ask whether target - x has appeared earlier.','Check the complement before storing the current value so one element is not used twice.'],approach:'Use a hash map from value to index. Scan left to right; if the complement exists, return the stored index and current index. Otherwise record the current value/index. Assume a valid pair only if the problem guarantees one; otherwise define the no-answer behavior.',timeComplexity:'O(n) average time',spaceComplexity:'O(n) auxiliary space',editorial:'Maintain a map of previously seen values. At index i, compute complement = target - nums[i]. If the map contains complement, the pair is found; otherwise store nums[i] -> i. This works because the map contains only earlier indices.',related:['3Sum','Two Sum II — Input Array Is Sorted','Subarray Sum Equals K'],testsKey:'leetcode-two-sum'},
 'valid-parentheses':{problemStatement:'Given a string of brackets, determine whether every bracket closes in the correct type and nesting order.',hints:['The most recently opened bracket must close first.','A stack mirrors the nesting order.','Reject a closing bracket when the stack is empty or its opening type differs.'],approach:'Push opening brackets. For a closing bracket, verify the top stack entry is its matching opening bracket and pop it. Validity requires no mismatch and an empty stack at the end.',timeComplexity:'O(n) time',spaceComplexity:'O(n) worst-case auxiliary space',editorial:'Scan each character once. Push opening brackets. For closing brackets, compare against the expected opening symbol on the stack top; fail on empty/mismatch. At the end, accept only if the stack is empty.',related:['Minimum Add to Make Parentheses Valid','Daily Temperatures','Evaluate Reverse Polish Notation'],testsKey:'leetcode-valid-parentheses'},
 'best-time-to-buy-and-sell-stock':{problemStatement:'Given daily prices, choose one buy day and a later sell day to maximize profit; return zero when no positive profit is possible.',hints:['A sell day must occur after the buy day.','Keep the cheapest price observed before the current day.','Calculate profit against the prior minimum, then update the minimum.'],approach:'Track minimum price so far and best profit. For each price, update best = max(best, price - minimum), then update minimum. Handle zero/one price with profit 0.',timeComplexity:'O(n) time',spaceComplexity:'O(1) auxiliary space',editorial:'A single pass is sufficient because the best buy price for a given sell day is the minimum earlier price. Maintain the minimum and best difference.',related:['Maximum Subarray','Best Time to Buy and Sell Stock II','Best Time to Buy and Sell Stock with Cooldown'],testsKey:'leetcode-best-time-to-buy-and-sell-stock'},
 'contains-duplicate':{problemStatement:'Given an integer array, return true if any value appears more than once, otherwise return false.',hints:['Compare array length with the number of distinct values.','A set can identify repetition as you scan.','For large input, avoid pairwise comparisons.'],approach:'Insert numbers into a set. If a number already exists, return true; if the scan completes, return false.',timeComplexity:'O(n) average time',spaceComplexity:'O(n) auxiliary space',editorial:'Scan through nums using a set of seen values. An element already present proves a duplicate; otherwise add it to the set and continue.',related:['Valid Anagram','Single Number','Longest Consecutive Sequence'],testsKey:'leetcode-contains-duplicate'}
};
let cache = { at: 0, data: null, error: '' };

function text(v, n=500) {
  return String(v == null ? '' : v).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0,n);
}
function slugify(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-|-$/g,''); }
function safeUrl(v, fallback) {
  try { const u = new URL(String(v || '')); return u.protocol === 'https:' ? u.href : fallback; }
  catch { return fallback; }
}
async function fetchCatalog() {
  if (cache.data && Date.now()-cache.at<CACHE_MS) return cache;
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),10000);
  try {
    const response = await fetch(SOURCE_URL,{signal:controller.signal,headers:{Accept:'application/json','User-Agent':'CareerOS study catalog'}});
    if(!response.ok) throw new Error('Public problem source returned HTTP '+response.status);
    const body = await response.json();
    const rows = Array.isArray(body)?body:(Array.isArray(body.problems)?body.problems:[]);
    if(rows.length<250) throw new Error('Public problem source returned fewer than 250 records.');
    const normalized = rows.filter(p=>p && p.title && p.title_slug && p.paid_only!==true)
      .map(p=>({
        id:String(p.frontend_id||p.id||''),
        title:text(p.title,180),
        titleSlug:slugify(p.title_slug),
        difficulty:['Easy','Medium','Hard'].includes(p.difficulty)?p.difficulty:'Unknown',
        tags:(Array.isArray(p.topic_tags)?p.topic_tags:[]).map(t=>text(t,80)).filter(Boolean).slice(0,12),
        paidOnly:false,
        likes:Number(p.likes||0),
        hasSolution:!!p.has_solution,
        url:safeUrl(p.url,'https://leetcode.com/problems/'+encodeURIComponent(slugify(p.title_slug))+'/'),
        source:'Public LeetCode metadata API',
        problemSlug:'leetcode-'+slugify(p.title_slug)
      }))
      .filter(p=>p.title&&p.titleSlug&&p.id);
    const byDifficulty = { Easy:[],Medium:[],Hard:[] };
    for(const p of normalized) if(byDifficulty[p.difficulty]) byDifficulty[p.difficulty].push(p);
    const chosen = [];
    const seen = new Set();
    for(const d of ['Easy','Medium','Hard']){
      byDifficulty[d].sort((a,b)=>b.likes-a.likes||Number(a.id)-Number(b.id));
      for(const p of byDifficulty[d].slice(0,CURATED_LIMITS[d])){
        if(!seen.has(p.titleSlug)){chosen.push(p);seen.add(p.titleSlug)}
      }
    }
    normalized.sort((a,b)=>b.likes-a.likes);
    for(const p of normalized){
      if(chosen.length>=400)break;
      if(!seen.has(p.titleSlug)){chosen.push(p);seen.add(p.titleSlug)}
    }
    const order={Easy:0,Medium:1,Hard:2,Unknown:3};
    chosen.sort((a,b)=>order[a.difficulty]-order[b.difficulty]||b.likes-a.likes);
    const data={problems:chosen,totalSourceRecords:rows.length,freeSourceRecords:normalized.length,source:SOURCE_URL,fetchedAt:new Date().toISOString(),curation:'Popular free problems balanced by difficulty, ranked by source likes'};
    cache={at:Date.now(),data,error:''};
    return cache;
  }catch(e){
    cache={at:Date.now(),data:null,error:text(e.message||'Problem source unavailable',250)};
    return cache;
  }finally{clearTimeout(timer)}
}
async function getAttempts(user, slugs) {
  if(!slugs.length)return new Map();
  const r=await db.query("SELECT DISTINCT ON (problem_slug) problem_slug,status,language,actual_minutes,attempted_at FROM coding_attempts WHERE user_id=$1 AND problem_slug=ANY($2::text[]) ORDER BY problem_slug,attempted_at DESC",[user,slugs]);
  return new Map(r.rows.map(x=>[x.problem_slug,x]));
}
export default async function(req,res){
 const user=String(req.user.id),b=req.body||{};
 if(req.method==='GET'){
  const live=await fetchCatalog();
  if(!live.data)return res.status(503).json({error:'The live public LeetCode metadata source is temporarily unavailable.',source:SOURCE_URL,details:live.error,live:false});
  const q=text(req.query?.q,120).toLowerCase(),topic=text(req.query?.topic,100),difficulty=text(req.query?.difficulty,20);
  const allowed=new Set(['Easy','Medium','Hard']);
  const source=live.data.problems.filter(p=>(!q||(p.title+' '+p.id+' '+p.titleSlug+' '+p.tags.join(' ')).toLowerCase().includes(q))
    &&(!topic||p.tags.some(t=>t.toLowerCase()===topic.toLowerCase()))
    &&(!allowed.has(difficulty)||p.difficulty===difficulty));
  const page=Math.max(1,Math.min(1000,Math.floor(Number(req.query?.page)||1)));
  const limit=Math.max(10,Math.min(50,Math.floor(Number(req.query?.limit)||30)));
  const offset=(page-1)*limit,rows=source.slice(offset,offset+limit);
  const attempts=await getAttempts(user,rows.map(p=>p.problemSlug));
  const problems=rows.map(p=>({...p,solutionGuide:PRACTICE_GUIDES[p.titleSlug]||null,attemptStatus:attempts.get(p.problemSlug)?.status||'not_started',lastAttemptAt:attempts.get(p.problemSlug)?.attempted_at||null}));
  const counts=await db.query("SELECT count(*)::int AS attempts,count(*) FILTER(WHERE status='solved')::int AS solved,count(DISTINCT problem_slug)::int AS unique_attempted FROM coding_attempts WHERE user_id=$1 AND problem_slug LIKE 'leetcode-%'",[user]);
  const topics=[...new Set(live.data.problems.flatMap(p=>p.tags))].sort((a,b)=>a.localeCompare(b));
  const diffCounts={Easy:0,Medium:0,Hard:0};
  for(const p of live.data.problems)if(diffCounts[p.difficulty]!==undefined)diffCounts[p.difficulty]++;
  return res.json({problems,total:source.length,catalogCount:live.data.problems.length,page,limit,pages:Math.max(1,Math.ceil(source.length/limit)),hasMore:offset+limit<source.length,topics,difficultyCounts:diffCounts,stats:counts.rows[0],source:live.data.source,sourceFetchedAt:live.data.fetchedAt,totalSourceRecords:live.data.totalSourceRecords,freeSourceRecords:live.data.freeSourceRecords,curation:live.data.curation,live:true,disclaimer:'Metadata only: problem statements and submissions remain on LeetCode. Only public, non-premium problem links are included. The source is third-party and may change or be unavailable.'});
 }
 const action=text(b.action,40);
 if(action!=='save-attempt')return res.status(400).json({error:'Unsupported LeetCode action.'});
 const slug=text(b.problemSlug,180);
 if(!/^leetcode-[a-z0-9-]{1,160}$/.test(slug))return res.status(400).json({error:'Select a valid LeetCode problem.'});
 const status=text(b.status,30);
 if(!['attempted','solved','needs_revision','skipped'].includes(status))return res.status(400).json({error:'Choose a valid attempt status.'});
 const mins=Number(b.actualMinutes||0);
 if(!Number.isInteger(mins)||mins<0||mins>100000)return res.status(400).json({error:'Minutes must be a whole number between 0 and 100000.'});
 const info=await fetchCatalog();
 if(info.data&&!info.data.problems.some(p=>p.problemSlug===slug))return res.status(404).json({error:'Problem is not in the current free practice catalog.'});
 const r=await db.query('INSERT INTO coding_attempts(user_id,problem_id,problem_slug,status,language,approach_notes,time_complexity,space_complexity,actual_minutes) VALUES($1,NULL,$2,$3,$4,$5,$6,$7,$8) RETURNING id,problem_slug,status,language,approach_notes,time_complexity,space_complexity,actual_minutes,attempted_at',[user,slug,status,text(b.language,60)||null,text(b.approachNotes,5000)||null,text(b.timeComplexity,80)||null,text(b.spaceComplexity,80)||null,mins]);
 await logActivity(user,'leetcode_attempt_saved','leetcode_problem',slug,{status,minutes:mins});
 return res.status(201).json({attempt:r.rows[0]});
}