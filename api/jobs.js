import { db } from 'hatchable';
import { consumeRateLimit } from 'lib/career.js';
import { respondToApiError } from 'lib/api-errors.js';

export const access = 'user';
export const methods = ['GET'];

let feedCache = { fetchedAt: 0, jobs: [], sources: [] };
const CACHE_MS = 30 * 60 * 1000;

function plain(value, max = 500) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
function numericSalary(value) { if(value==null||value==='')return null;const n=Number(String(value).replace(/[\s,]/g,''));return Number.isFinite(n)&&n>=0?n:null; }
function normalizeSalaryPeriod(value) { const s=String(value||'').toLowerCase();if(/hour/.test(s))return 'hourly';if(/month/.test(s))return 'monthly';if(/year|annual|annum/.test(s))return 'annual';return 'unknown'; }
function asDate(value) {
  if (value == null || value === '') return null;
  const date = typeof value === 'number'
    ? new Date(value < 1000000000000 ? value * 1000 : value)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
function validUrl(value) {
  try {
    const u = new URL(String(value || ''));
    return ['http:', 'https:'].includes(u.protocol) ? u.href : '';
  } catch { return ''; }
}
function experienceRequirement(j, description, seniority) {
  const direct = plain(j.experienceRequired || j.experience_required || j.experience || j.jobExperience || j.yearsExperience || '', 120);
  if (direct) return direct;
  const text = String(description || '');
  const match = text.match(/\b(?:\d+\s*(?:-|to)\s*\d+|\d+\+?)\s*(?:years?|yrs?)(?:\s+of)?\s+(?:relevant\s+)?experience\b/i)
    || text.match(/\b(?:entry[- ]level|junior|mid[- ]level|senior|staff|principal)\b/i);
  return plain(match && match[0] || seniority || '', 120);
}
function experienceMatches(job, filter) {
  if (!filter || filter === 'any') return true;
  const raw = String(job.experienceRequirements || job.seniority || '').toLowerCase();
  const text = [job.title, job.description, raw].join(' ').toLowerCase();
  const range = raw.match(/(\d+)\s*(?:-|to)\s*(\d+)\s*(?:years?|yrs?)/i);
  const single = raw.match(/(\d+)\s*\+?\s*(?:years?|yrs?)/i);
  const min = range ? Number(range[1]) : single ? Number(single[1]) : null;
  const max = range ? Number(range[2]) : single && /\+/.test(single[0]) ? Infinity : single ? Number(single[1]) : null;
  if (filter === '0-2') return /\bintern(?:ship)?\b|\bentry[- ]level\b|\bjunior\b|\bgraduate\b|\b0.?2 years\b/i.test(text) || (min !== null && min <= 2);
  if (filter === '3-5') return /\bmid[- ]level\b|\bintermediate\b|\b3.?5 years\b/i.test(text) || (min !== null && min <= 5 && (max === Infinity || max >= 3));
  if (filter === '5+') return /\bsenior\b|\bstaff\b|\bprincipal\b|\blead\b|\b5\+ years\b/i.test(text) || (min !== null && min >= 5);
  return true;
}

function normalizeHimalayas(j) {
  const title = plain(j.title, 180);
  const company = plain(j.companyName, 160);
  if (!title || !company) return null;
  const restrictions = Array.isArray(j.locationRestrictions) ? j.locationRestrictions : [];
  const location = restrictions.length ? restrictions.join(', ') : 'Remote · worldwide';
  const salary = j.minSalary != null || j.maxSalary != null
    ? [j.currency || 'USD', j.minSalary, j.maxSalary].filter(v => v !== null && v !== undefined).join('–') + (j.salaryPeriod ? ' / ' + plain(j.salaryPeriod, 30) : '')
    : '';
  return {
    id: 'himalayas:' + plain(j.guid || (company + ':' + title), 220),
    title, company, location, remote: true,
    employmentType: plain(j.employmentType, 60),
    seniority: Array.isArray(j.seniority) ? j.seniority.map(x => plain(x, 40)).join(', ') : '',
    experienceRequirements: experienceRequirement(j, j.excerpt || j.description, Array.isArray(j.seniority) ? j.seniority.map(x => plain(x,40)).join(', ') : ''),
    salary: plain(salary, 100), salaryProvided: Boolean(salary), salaryMin:numericSalary(j.minSalary), salaryMax:numericSalary(j.maxSalary), salaryCurrency:plain(j.currency||'',10).toUpperCase(), salaryPeriod:normalizeSalaryPeriod(j.salaryPeriod),
    description: plain(j.excerpt || j.description, 420),
    publishedAt: asDate(j.pubDate),
    expiresAt: asDate(j.expiryDate),
    applyUrl: validUrl(j.applicationLink),
    jobUrl: validUrl(j.guid || j.applicationLink),
    source: 'Himalayas',
    sourceUrl: 'https://himalayas.app',
    tags: Array.isArray(j.categories) ? j.categories.slice(0, 8).map(x => plain(x, 50)) : []
  };
}
function normalizeJobicy(j) {
  const title = plain(j.jobTitle, 180);
  const company = plain(j.companyName, 160);
  if (!title || !company) return null;
  const url = validUrl(j.url);
  const geo = plain(j.jobGeo, 120) || 'Remote';
  return {
    id: 'jobicy:' + String(j.id || url || title + ':' + company),
    title, company, location: geo, remote: /remote|worldwide|anywhere/i.test(geo),
    employmentType: Array.isArray(j.jobType) ? j.jobType.map(x => plain(x, 40)).join(', ') : plain(j.jobType, 60),
    seniority: plain(j.jobLevel, 60),
    experienceRequirements: experienceRequirement(j, j.jobExcerpt || j.jobDescription, plain(j.jobLevel,60)),
    salary: plain(j.salary || j.annualSalary || '', 100), salaryProvided: Boolean(j.salary || j.annualSalary || j.minSalary || j.maxSalary), salaryMin:numericSalary(j.minSalary??j.salaryMin??j.annualSalaryMin), salaryMax:numericSalary(j.maxSalary??j.salaryMax??j.annualSalaryMax), salaryCurrency:plain(j.salaryCurrency||j.currency||'',10).toUpperCase(), salaryPeriod:normalizeSalaryPeriod(j.salaryPeriod||(j.annualSalary?'annual':'')),
    description: plain(j.jobExcerpt || j.jobDescription, 420),
    publishedAt: asDate(j.pubDate || j.datePosted),
    applyUrl: url, jobUrl: url,
    source: 'Jobicy', sourceUrl: 'https://jobicy.com',
    tags: Array.isArray(j.jobIndustry) ? j.jobIndustry.slice(0, 8).map(x => plain(x, 50)) : []
  };
}
function normalizeRemotive(j) {
  const title = plain(j.title, 180);
  const company = plain(j.company_name, 160);
  if (!title || !company) return null;
  const url = validUrl(j.url);
  return {
    id: 'remotive:' + String(j.id || url || title + ':' + company),
    title, company,
    location: plain(j.candidate_required_location, 120) || 'Remote',
    remote: true,
    employmentType: plain(j.job_type, 60),
    seniority: '',
    experienceRequirements: experienceRequirement(j, j.description, ''),
    salary: plain(j.salary, 100), salaryProvided: Boolean(j.salary), salaryMin:numericSalary(j.salaryMin??j.minSalary), salaryMax:numericSalary(j.salaryMax??j.maxSalary), salaryCurrency:plain(j.salaryCurrency||j.currency||'',10).toUpperCase(), salaryPeriod:normalizeSalaryPeriod(j.salaryPeriod),
    description: plain(j.description, 420),
    publishedAt: asDate(j.publication_date),
    applyUrl: url, jobUrl: url,
    source: 'Remotive', sourceUrl: 'https://remotive.com',
    tags: [...(Array.isArray(j.tags) ? j.tags : []), ...(j.category ? [j.category] : [])].slice(0, 8).map(x => plain(x, 50))
  };
}
async function fetchJson(name, url, normalize, sourceUrl, opts = {}) {
  try {
    const response = await fetch(url, {
      timeout_ms: 10000,
      headers: { Accept: 'application/json', 'User-Agent': 'CareerOS live opportunities (https://careeros-beg4.hatchable.site)' }
    });
    if (!response.ok) throw new Error('upstream status ' + response.status);
    const body = await response.json();
    const rows = Array.isArray(body) ? body : (Array.isArray(body.jobs) ? body.jobs : []);
    return {
      name, status: 'live', fetchedAt: new Date().toISOString(),
      count: rows.length, jobs: rows.map(normalize).filter(Boolean).filter(j => !j.expiresAt || Date.parse(j.expiresAt) > Date.now()), sourceUrl
    };
  } catch (e) {
    console.warn('Live job source unavailable', name, String(e && e.message || e).slice(0, 160));
    return { name, status: 'unavailable', fetchedAt: new Date().toISOString(), count: 0, jobs: [], sourceUrl };
  }
}
async function refreshFeeds() {
  // Pull the free feeds in batches and apply user search filters locally.
  // Himalayas refreshes its cached feed daily; avoid repeated upstream queries per keystroke.
  const himalayasUrl = 'https://himalayas.app/jobs/api?limit=20';
  const remotiveUrl = 'https://remotive.com/api/remote-jobs?limit=50';
  const feeds = await Promise.all([
    fetchJson('Himalayas', himalayasUrl, normalizeHimalayas, 'https://himalayas.app'),
    fetchJson('Jobicy', 'https://jobicy.com/api/jobs?count=100', normalizeJobicy, 'https://jobicy.com'),
    fetchJson('Remotive', remotiveUrl, normalizeRemotive, 'https://remotive.com')
  ]);
  const merged = new Map();
  for (const f of feeds) for (const j of f.jobs) {
    const key = j.jobUrl || (j.company.toLowerCase() + '|' + j.title.toLowerCase());
    if (!merged.has(key)) merged.set(key, j);
  }
  const result = { fetchedAt: Date.now(), jobs: [...merged.values()], sources: feeds.map(({ jobs, ...s }) => s) };
  feedCache = result;
  return result;
}
async function handle(req, res) {
  const q = String(req.query?.q || '').trim().slice(0, 100);
  const location = String(req.query?.location || '').trim().slice(0, 100);
  const stage = String(req.query?.stage || '').trim().slice(0, 40);
  const companyFilter=String(req.query?.company||'').trim().slice(0,100).toLowerCase();
  const sourceFilter=String(req.query?.source||'').trim().slice(0,60).toLowerCase();
  const skillsFilter=String(req.query?.skills||'').trim().slice(0,120).toLowerCase();
  const workMode=String(req.query?.workMode||'any').trim().slice(0,20).toLowerCase();
  const experienceFilter=String(req.query?.experience||'any').trim().slice(0,20).toLowerCase();
  const salaryFilter=String(req.query?.salary||'any').trim().slice(0,20).toLowerCase();
  const salaryCurrency=String(req.query?.salaryCurrency||'any').trim().slice(0,10).toUpperCase();
  const salaryPeriod=String(req.query?.salaryPeriod||'any').trim().slice(0,20).toLowerCase();
  const minSalaryRaw=req.query?.minSalary,maxSalaryRaw=req.query?.maxSalary;
  const minSalary=minSalaryRaw==null||String(minSalaryRaw).trim()===''?null:Number(minSalaryRaw);
  const maxSalary=maxSalaryRaw==null||String(maxSalaryRaw).trim()===''?null:Number(maxSalaryRaw);
  const force = String(req.query?.refresh || '') === '1';
  const requestLimit=await consumeRateLimit(String(req.user.id),force?'job-feed-refresh':'job-feed-read',force?3:30,60);
  if(!requestLimit.allowed)return res.status(429).json({error:'Job feed requests are rate-limited. Retry in '+requestLimit.retryAfterSeconds+' seconds.',retryAfterSeconds:requestLimit.retryAfterSeconds});
  let feed;
  if (!force && Date.now() - feedCache.fetchedAt < CACHE_MS && feedCache.jobs.length) {
    feed = feedCache;
  } else {
    feed = await refreshFeeds();
  }
  const ql = q.toLowerCase(), ll = location.toLowerCase();
  let jobs = feed.jobs.filter(j => {
    const haystack = [j.title, j.company, j.location, j.description, ...(j.tags || []), j.employmentType, j.seniority, j.experienceRequirements].join(' ').toLowerCase();
    const matchQ = !ql || haystack.includes(ql);
    const matchLocation = !ll || (/remote|worldwide|anywhere/i.test(ll) && j.remote) || haystack.includes(ll);
    const roleMeta = [j.title, j.employmentType, j.seniority, j.experienceRequirements, ...(j.tags || [])].join(' ').toLowerCase();
    const matchCompany = !companyFilter || j.company.toLowerCase().includes(companyFilter);
    const matchSource = !sourceFilter || j.source.toLowerCase().includes(sourceFilter);
    const skillTerms = skillsFilter.split(/[;,]+/).map(x=>x.trim()).filter(Boolean);
    const matchSkills = !skillTerms.length || skillTerms.every(term=>haystack.includes(term));
    const matchMode = !workMode || workMode==='any' || (workMode==='remote' ? !!j.remote : workMode==='onsite' ? (!j.remote && /onsite|on-site|office|on site/i.test([j.location,j.description].join(' '))) : workMode==='hybrid' ? /hybrid/i.test([j.location,j.description,j.employmentType].join(' ')) : true);
    const matchExperience = experienceMatches(j,experienceFilter);
    const hasSalaryBounds=minSalary!==null||maxSalary!==null;
    const matchSalaryAvailability=salaryFilter!=='provided' || Boolean(j.salaryProvided || j.salary);
    const matchSalaryRange=!hasSalaryBounds || (Number.isFinite(minSalary??0)&&Number.isFinite(maxSalary??0)&&(!hasSalaryBounds||minSalary===null||maxSalary===null||minSalary<=maxSalary)&&salaryCurrency!=='ANY'&&salaryPeriod!=='any'&&j.salaryMin!=null&&j.salaryMax!=null&&j.salaryCurrency===salaryCurrency&&j.salaryPeriod===salaryPeriod&&(minSalary===null||j.salaryMax>=minSalary)&&(maxSalary===null||j.salaryMin<=maxSalary));
    const matchSalary=matchSalaryAvailability&&matchSalaryRange;
    const matchStage = !stage || stage === 'any' || (stage === 'student'
      ? /\bintern(?:ship)?\b|\bentry[- ]level\b|\bjunior\b|\bgraduate\b|\btrainee\b|\bapprentice\b|\bstudent\b|\bearly career\b/i.test(roleMeta)
      : stage === 'professional'
        ? !/internship|student only/i.test(roleMeta)
        : stage === 'entrepreneur'
          ? /founder|startup|business development|sales|growth|marketing|freelance|contract|consultant|partnership|account executive/i.test(roleMeta + ' ' + j.description.toLowerCase())
          : true);
    return matchQ && matchLocation && matchStage && matchCompany && matchSource && matchSkills && matchMode && matchExperience && matchSalary;
  });
  jobs.sort((a, b) => (Date.parse(b.publishedAt || '') || 0) - (Date.parse(a.publishedAt || '') || 0));
  const max = Math.min(80, Math.max(1, Number(req.query?.limit) || 60));
  jobs = jobs.slice(0, max);
  const allFeedsUnavailable=!feed.jobs.length&&feed.sources.every(s=>s.status!=='live');
  const portalTerms=[q||'software engineer',location].filter(Boolean).join(' ');
  const portalSearches=[
    {name:'Google Jobs / Search',url:'https://www.google.com/search?q='+encodeURIComponent(portalTerms+' jobs'),kind:'External search results; verify the employer and original posting.'},
    {name:'Google Careers',url:'https://careers.google.com/jobs/results/',kind:'Official company career site; search roles and locations on Google Careers.'},
    {name:'Microsoft Careers',url:'https://careers.microsoft.com/v2/global/en/home.html',kind:'Official company career site; verify work site and experience requirements.'},
    {name:'Amazon Jobs',url:'https://www.amazon.jobs/en',kind:'Official Amazon career site with location and experience filters.'},
    {name:'Meta Careers',url:'https://www.metacareers.com/jobs/',kind:'Official Meta career site; sign-in or location restrictions may apply.'},
    {name:'LinkedIn Jobs',url:'https://www.linkedin.com/jobs/search/?keywords='+encodeURIComponent(q||'software engineer')+(location?'&location='+encodeURIComponent(location):''),kind:'Opens LinkedIn search; sign-in and availability depend on LinkedIn.'},
    {name:'Naukri',url:'https://www.naukri.com/',kind:'Official job-search portal; enter the same role and location there.'},
    {name:'Wellfound',url:'https://wellfound.com/jobs',kind:'Startup roles on the publisher site; inspect location and experience eligibility.'}
  ];
  return res.json({
    jobs, total: jobs.length, sources: feed.sources, portalSearches,
    error:allFeedsUnavailable?'All connected live job feeds are temporarily unavailable. No sample or placeholder listings are shown; use the official career portals below or retry later.':'',
    filtersApplied:{q,location,stage,company:companyFilter,source:sourceFilter,skills:skillsFilter,workMode,experience:experienceFilter,salary:salaryFilter,minSalary,maxSalary,salaryCurrency,salaryPeriod},
    fetchedAt: new Date(feed.fetchedAt).toISOString(),
    cached: Date.now() - feed.fetchedAt > 1000,
    disclaimer: 'Live remote job feeds from third-party publishers. Listings can close or change; confirm details on the source before applying. CareerOS does not auto-submit applications.'
  });
}

export default async function(req,res){
 try{return await handle(req,res)}catch(error){return respondToApiError('api/jobs.js',error,req,res)}
}