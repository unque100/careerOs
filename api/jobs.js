import { db } from 'hatchable';

export const access = 'user';
export const methods = ['GET'];

let feedCache = { fetchedAt: 0, jobs: [], sources: [] };
const CACHE_MS = 3 * 60 * 1000;

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
    salary: plain(salary, 100),
    description: plain(j.excerpt || j.description, 420),
    publishedAt: asDate(j.pubDate),
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
    salary: plain(j.salary || j.annualSalary || '', 100),
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
    salary: plain(j.salary, 100),
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
      count: rows.length, jobs: rows.map(normalize).filter(Boolean), sourceUrl
    };
  } catch (e) {
    console.warn('Live job source unavailable', name, String(e && e.message || e).slice(0, 160));
    return { name, status: 'unavailable', fetchedAt: new Date().toISOString(), count: 0, jobs: [], sourceUrl };
  }
}
async function refreshFeeds(q) {
  const himalayasUrl = q
    ? 'https://himalayas.app/jobs/api/search?q=' + encodeURIComponent(q) + '&sort=recent&page=1'
    : 'https://himalayas.app/jobs/api?limit=20';
  const remotiveUrl = 'https://remotive.com/api/remote-jobs?limit=50' + (q ? '&search=' + encodeURIComponent(q) : '');
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
  if (!q) feedCache = result;
  return result;
}
export default async function(req, res) {
  const q = String(req.query?.q || '').trim().slice(0, 100);
  const location = String(req.query?.location || '').trim().slice(0, 100);
  const stage = String(req.query?.stage || '').trim().slice(0, 40);
  const force = String(req.query?.refresh || '') === '1';
  let feed;
  if (!force && !q && Date.now() - feedCache.fetchedAt < CACHE_MS && feedCache.jobs.length) {
    feed = feedCache;
  } else {
    feed = await refreshFeeds(q);
  }
  const ql = q.toLowerCase(), ll = location.toLowerCase();
  let jobs = feed.jobs.filter(j => {
    const haystack = [j.title, j.company, j.location, j.description, ...(j.tags || []), j.employmentType, j.seniority].join(' ').toLowerCase();
    const matchQ = !ql || haystack.includes(ql);
    const matchLocation = !ll || /remote|worldwide|anywhere/i.test(ll) && j.remote || haystack.includes(ll);
    const matchStage = !stage || stage === 'any' || (stage === 'student'
      ? /intern|entry|junior|graduate|trainee|apprentice|associate/i.test(haystack)
      : stage === 'professional'
        ? !/internship|student only/i.test(haystack)
        : stage === 'entrepreneur'
          ? /founder|startup|business development|sales|growth|marketing|freelance|contract|consultant|partnership/i.test(haystack)
          : true);
    return matchQ && matchLocation && matchStage;
  });
  jobs.sort((a, b) => (Date.parse(b.publishedAt || '') || 0) - (Date.parse(a.publishedAt || '') || 0));
  const max = Math.min(80, Math.max(1, Number(req.query?.limit) || 60));
  jobs = jobs.slice(0, max);
  if (!feed.jobs.length && feed.sources.every(s => s.status !== 'live')) {
    return res.status(502).json({
      error: 'All live job feeds are temporarily unavailable. No sample or placeholder jobs are shown. Retry in a few minutes.',
      jobs: [], sources: feed.sources, fetchedAt: new Date().toISOString(), cached: false
    });
  }
  return res.json({
    jobs, total: jobs.length, sources: feed.sources,
    fetchedAt: new Date(feed.fetchedAt).toISOString(),
    cached: Date.now() - feed.fetchedAt > 1000,
    disclaimer: 'Live remote job feeds from third-party publishers. Listings can close or change; confirm details on the source before applying. CareerOS does not auto-submit applications.'
  });
}