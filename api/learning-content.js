import { db } from 'hatchable';
import { clean, logActivity } from 'lib/career.js';

export const access = 'user';
export const methods = ['GET', 'POST'];

const cache = new Map();
let lastCodeforcesRequestAt = 0;
const CACHE_MS = 10 * 60 * 1000;
const CF_API = 'https://codeforces.com/api/problemset.problems';
const SYSTEM_DESIGN_README = 'https://raw.githubusercontent.com/donnemartin/system-design-primer/master/README.md';
const SYSTEM_DESIGN_ROOT = 'https://github.com/donnemartin/system-design-primer/blob/master/README.md';

const DSA_TOPICS = {
  'Arrays & Implementation': { tag: 'implementation', week: 'Week 1', focus: 'Array traversal, frequency counting, prefix sums, sorting and invariants.' },
  'Two Pointers': { tag: 'two pointers', week: 'Week 2', focus: 'Opposing pointers, fast/slow pointers and pair counting.' },
  'Binary Search': { tag: 'binary search', week: 'Week 2', focus: 'Search sorted data and binary search on a monotonic answer.' },
  'Stacks, Queues & Heaps': { tag: 'data structures', week: 'Week 3', focus: 'Stack/queue patterns, priority queues and monotonic structures.' },
  'Strings': { tag: 'strings', week: 'Week 3', focus: 'String scans, matching, transformation and frequency patterns.' },
  'Trees': { tag: 'trees', week: 'Week 4', focus: 'Tree properties, traversals and subtree reasoning.' },
  'Graphs BFS/DFS': { tag: 'dfs and similar', week: 'Week 5', focus: 'Graph traversal, connected components, cycle detection and reachability.' },
  'Dynamic Programming': { tag: 'dp', week: 'Week 6', focus: 'State design, recurrence, memoization, tabulation and space optimization.' },
  'Greedy': { tag: 'greedy', week: 'Week 7', focus: 'Greedy choice proofs, ordering and interval decisions.' },
  'Bit Manipulation': { tag: 'bitmasks', week: 'Week 8', focus: 'Bitwise operators, masks, subsets and state compression.' },
  'Math & Number Theory': { tag: 'math', week: 'Week 8', focus: 'Divisibility, modular arithmetic, counting and number theory.' },
  'Shortest Paths': { tag: 'shortest paths', week: 'Week 9', focus: 'BFS on unweighted graphs, Dijkstra and shortest-path trade-offs.' },
  'Sorting & Order': { tag: 'sortings', week: 'Week 9', focus: 'Sorting guarantees, custom comparators and offline processing.' },
  'Combinatorics': { tag: 'combinatorics', week: 'Week 10', focus: 'Counting, combinations, probability basics and constraints.' },
  'Constructive Problems': { tag: 'constructive algorithms', week: 'Week 10', focus: 'Build a valid answer from constraints and prove correctness.' },
  'Mixed Interview Practice': { tag: 'implementation', week: 'Weeks 11–12', focus: 'Timed mixed sets, explaining complexity and revising weak patterns.' }
};

const SD_TOPICS = [
  ['performance-vs-scalability','Performance vs scalability','Fundamentals','Separate response speed for a workload from the ability to handle growing load. Compare vertical and horizontal scaling.'],
  ['latency-vs-throughput','Latency vs throughput','Fundamentals','Define tail latency, throughput, queueing and the metrics to optimize for a product SLO.'],
  ['availability-vs-consistency','Availability vs consistency','Distributed systems','Choose behavior under network partitions; state which reads and writes may be stale or unavailable.'],
  ['cap-theorem','CAP theorem','Distributed systems','Explain consistency, availability and partition tolerance in the context of an actual distributed data flow.'],
  ['consistency-patterns','Consistency patterns','Distributed systems','Compare strong, eventual and weak consistency, including client-visible consequences.'],
  ['availability-patterns','Availability patterns','Reliability','Plan health checks, failover, replication and recovery from partial failures.'],
  ['domain-name-system','Domain name system (DNS)','Networking','Trace a name lookup, caching, TTLs, failover and DNS-based traffic routing.'],
  ['content-delivery-network','Content delivery network (CDN)','Networking','Choose what to cache at the edge, define cache keys and plan invalidation.'],
  ['load-balancer','Load balancer','Networking','Compare L4 and L7 routing, health checks, balancing algorithms and active-active/active-passive setups.'],
  ['reverse-proxy-web-server','Reverse proxy and web server','Networking','Place a reverse proxy, TLS termination, routing and request limits in the system.'],
  ['application-layer','Application layer','Architecture','Separate responsibilities and decide where stateless application services scale horizontally.'],
  ['microservices','Microservices','Architecture','Define service boundaries, synchronous versus asynchronous calls, and operational trade-offs.'],
  ['service-discovery','Service discovery','Architecture','Discover healthy service instances and handle changing endpoints and registrations.'],
  ['database','Database','Storage','Choose data models based on queries, integrity, transaction requirements and expected scale.'],
  ['relational-database-management-system-rdbms','Relational databases (RDBMS)','Storage','Model relationships, transactions, indexes, replication and read/write paths.'],
  ['sharding','Sharding','Storage','Choose a shard key, distribute hot data and plan resharding and cross-shard queries.'],
  ['sql-tuning','SQL tuning','Storage','Use query plans, indexes, selectivity and connection pooling to diagnose slow queries.'],
  ['nosql','NoSQL data stores','Storage','Compare key-value, document, wide-column and graph models against access patterns.'],
  ['cache','Caching','Performance','Choose cache-aside/write-through/write-behind, TTLs, invalidation and stampede protection.'],
  ['asynchronism','Asynchronism','Messaging','Move slow work off request paths while defining durability, ordering and failure behavior.'],
  ['message-queues','Message queues','Messaging','Design producer/consumer flow, retries, dead-letter queues, idempotency and backpressure.'],
  ['back-pressure','Backpressure','Messaging','Keep producers, queues and consumers stable when downstream capacity is exceeded.'],
  ['communication','Service communication','Networking','Choose REST, RPC, TCP or UDP based on latency, reliability and semantics.'],
  ['security','Security','Reliability','Address authentication, authorization, secrets, encryption, abuse prevention and safe defaults.']
];

const DESIGN_EXERCISES = [
  { title: 'URL shortener', description: 'Design create/redirect APIs, ID generation, collision handling, hot-key caching, abuse controls and analytics.', url: 'https://github.com/donnemartin/system-design-primer/tree/master/solutions/system_design/pastebin' },
  { title: 'Social feed / timeline', description: 'Design feed reads and writes, fan-out on write versus read, ranking, cache invalidation and celebrity accounts.', url: 'https://github.com/donnemartin/system-design-primer/tree/master/solutions/system_design/twitter' },
  { title: 'Web crawler', description: 'Design URL frontier, deduplication, politeness, distributed workers, retries, robots rules and storage.', url: 'https://github.com/donnemartin/system-design-primer/tree/master/solutions/system_design/web_crawler' },
  { title: 'Notification platform', description: 'Design multi-channel delivery with preferences, queueing, provider fallbacks, retries, idempotency and delivery receipts.', url: SYSTEM_DESIGN_ROOT },
  { title: 'Rate limiter', description: 'Compare token bucket, leaky bucket, fixed window and sliding window in a distributed deployment.', url: SYSTEM_DESIGN_ROOT },
  { title: 'Chat / messaging system', description: 'Design WebSocket gateways, message persistence, delivery acknowledgements, ordering, fan-out and reconnect handling.', url: 'https://github.com/donnemartin/system-design-primer' },
  { title: 'File storage service', description: 'Design uploads/downloads, object storage, metadata, multipart uploads, access control and lifecycle policies.', url: 'https://github.com/donnemartin/system-design-primer' },
  { title: 'Job / application platform', description: 'Design search, saved roles, ingestion, filtering, alerting, application tracking and tenant boundaries.', url: 'https://github.com/donnemartin/system-design-primer' }
];

function cacheGet(key) {
  const item = cache.get(key);
  if (item && Date.now() - item.at < CACHE_MS) return item.value;
  return null;
}
function cacheSet(key, value) { cache.set(key, { at: Date.now(), value }); }
function slugify(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function difficultyForRating(rating) { return rating == null ? 'medium' : rating <= 1200 ? 'easy' : rating <= 1800 ? 'medium' : 'hard'; }
function asDifficulty(r) { return r === 'easy' || r === 'medium' || r === 'hard' ? r : ''; }
async function fetchJson(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'CareerOS-learning/1.0', 'Accept': 'application/json' } });
    if (!resp.ok) throw new Error('Source returned HTTP ' + resp.status);
    return await resp.json();
  } finally { clearTimeout(timer); }
}
async function getDsa(topicName, difficulty, user) {
  const topic = DSA_TOPICS[topicName] ? topicName : 'Arrays & Implementation';
  const meta = DSA_TOPICS[topic];
  const key = 'cf:' + meta.tag;
  let data = cacheGet(key);
  let live = true, sourceError = '';
  if (!data) {
    const wait = Math.max(0, 2200 - (Date.now() - lastCodeforcesRequestAt));
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    lastCodeforcesRequestAt = Date.now();
    try {
      const response = await fetchJson(CF_API + '?tags=' + encodeURIComponent(meta.tag));
      if (response.status !== 'OK' || !response.result || !Array.isArray(response.result.problems)) throw new Error(response.comment || 'Codeforces API response was not OK');
      const stats = response.result.problemStatistics || [];
      const statMap = new Map(stats.map(s => [String(s.contestId) + ':' + String(s.index), Number(s.solvedCount || 0)]));
      const problems = response.result.problems
        .filter(p => Number.isFinite(Number(p.contestId)) && p.index && p.name && p.type === 'PROGRAMMING')
        .map(p => ({
          slug: 'cf-' + Number(p.contestId) + '-' + String(p.index).toLowerCase().replace(/[^a-z0-9]+/g, ''),
          title: clean(p.name, 180),
          topic,
          difficulty: difficultyForRating(Number.isFinite(Number(p.rating)) ? Number(p.rating) : null),
          rating: Number.isFinite(Number(p.rating)) ? Number(p.rating) : null,
          tags: Array.isArray(p.tags) ? p.tags.slice(0, 8) : [],
          contestId: Number(p.contestId),
          index: String(p.index),
          solvedCount: statMap.get(String(p.contestId) + ':' + String(p.index)) || 0,
          practiceUrl: 'https://codeforces.com/problemset/problem/' + Number(p.contestId) + '/' + encodeURIComponent(String(p.index)),
          statement: 'Open the official statement, derive the constraints, design an approach, prove correctness, and record time/space complexity. Rating and tags are source metadata, not a universal difficulty guarantee.',
          source: 'Codeforces public API'
        }))
        .sort((a,b) => (a.rating ?? 1300) - (b.rating ?? 1300) || b.solvedCount - a.solvedCount);
      data = { problems, sourceFetchedAt: new Date().toISOString(), sourceUrl: CF_API, source: 'Codeforces public API', topic, focus: meta.focus, seriesWeek: meta.week };
      cacheSet(key, data);
    } catch (e) {
      live = false; sourceError = String(e && e.message || 'Live Codeforces feed unavailable').slice(0, 200);
      const fallback = await db.query('SELECT slug,title,topic,difficulty,statement,practice_url AS "practiceUrl",source,tags FROM dsa_problems ORDER BY CASE difficulty WHEN \'easy\' THEN 0 WHEN \'medium\' THEN 1 ELSE 2 END,title LIMIT 60');
      data = {
        problems: fallback.rows.map(p => ({ ...p, rating: null, tags: Array.isArray(p.tags) ? p.tags : [], contestId: null, index: null, solvedCount: 0 })),
        sourceFetchedAt: new Date().toISOString(), sourceUrl: CF_API, source: 'CareerOS saved catalog (fallback)', topic, focus: meta.focus, seriesWeek: meta.week
      };
    }
  }
  let problems = data.problems;
  if (topic !== data.topic) problems = problems.map(p => ({...p,topic}));
  if (difficulty) problems = problems.filter(p => p.difficulty === difficulty);
  problems = problems.slice(0, 36);
  const stats = await db.query("SELECT count(*)::int AS attempts,count(*) FILTER(WHERE status='solved')::int AS solved,count(DISTINCT problem_slug)::int AS problems_attempted FROM coding_attempts WHERE user_id=$1", [String(user)]);
  const attempts = await db.query('SELECT problem_slug,status,attempted_at FROM coding_attempts WHERE user_id=$1 ORDER BY attempted_at DESC LIMIT 500', [String(user)]);
  const latestBySlug = new Map();
  for (const a of attempts.rows) if (!latestBySlug.has(a.problem_slug)) latestBySlug.set(a.problem_slug, a.status);
  problems = problems.map(p => ({ ...p, attemptStatus: latestBySlug.get(p.slug) || 'not_started' }));
  return { topics: Object.keys(DSA_TOPICS).map(name => ({ name, ...DSA_TOPICS[name] })), selectedTopic: topic, difficulty: difficulty || 'any', focus: meta.focus, seriesWeek: meta.week, problems, stats: stats.rows[0], live, source: data.source || 'Codeforces public API', sourceUrl: data.sourceUrl || CF_API, sourceFetchedAt: data.sourceFetchedAt, sourceError };
}
async function getSystemDesign(user) {
  const key = 'system-design-primer';
  let sourceData = cacheGet(key), live = true, sourceError = '';
  if (!sourceData) {
    try {
      const response = await fetch(SYSTEM_DESIGN_README, { headers: { 'User-Agent': 'CareerOS-learning/1.0' } });
      if (!response.ok) throw new Error('GitHub source returned HTTP ' + response.status);
      const readme = await response.text();
      const headings = new Set(Array.from(readme.matchAll(/^#{2,4}\s+(.+?)\s*#*\s*$/gm), m => slugify(m[1].replace(/\*\*/g, '').replace(/\[[^\]]+\]\([^)]*\)/g, '$1'))));
      const topics = SD_TOPICS.filter(t => headings.has(t[0])).map(([slug,title,category,description]) => ({
        slug: 'sd-' + slug, title, category, description,
        resourceUrl: SYSTEM_DESIGN_ROOT + '#' + slug,
        source: 'System Design Primer (GitHub)'
      }));
      if (topics.length < 12) throw new Error('The public repository did not return enough indexed topic headings');
      sourceData = { topics, sourceFetchedAt: new Date().toISOString(), sourceUrl: SYSTEM_DESIGN_README };
      cacheSet(key, sourceData);
    } catch (e) {
      live = false; sourceError = String(e && e.message || 'GitHub source unavailable').slice(0, 200);
      sourceData = { topics: SD_TOPICS.map(([slug,title,category,description]) => ({
        slug: 'sd-' + slug, title, category, description,
        resourceUrl: SYSTEM_DESIGN_ROOT + '#' + slug,
        source: 'Curated fallback; live source unavailable'
      })), sourceFetchedAt: new Date().toISOString(), sourceUrl: SYSTEM_DESIGN_README };
    }
  }
  const progress = await db.query('SELECT topic_slug,status,time_spent_minutes,notes,last_practiced_at FROM learning_progress WHERE user_id=$1', [String(user)]);
  const progressBySlug = new Map(progress.rows.map(p => [p.topic_slug, p]));
  const topics = sourceData.topics.map(t => ({ ...t, progressStatus: (progressBySlug.get(t.slug) || {}).status || 'not_started', timeSpentMinutes: Number((progressBySlug.get(t.slug) || {}).time_spent_minutes || 0), notes: (progressBySlug.get(t.slug) || {}).notes || '' }));
  const exercises = DESIGN_EXERCISES.map((x,i) => ({ ...x, slug: 'sd-exercise-' + (i+1), category: 'Practice exercise', progressStatus: (progressBySlug.get('sd-exercise-' + (i+1)) || {}).status || 'not_started' }));
  return { topics, exercises, live, source: 'donnemartin/system-design-primer', sourceUrl: sourceData.sourceUrl, sourceFetchedAt: sourceData.sourceFetchedAt, sourceError };
}
export default async function(req, res) {
  const user = String(req.user.id);
  if (req.method === 'GET') {
    const kind = clean(req.query?.kind, 40);
    if (kind === 'dsa') {
      const topic = clean(req.query?.topic, 100);
      const difficulty = asDifficulty(clean(req.query?.difficulty, 20));
      return res.json(await getDsa(topic, difficulty, user));
    }
    if (kind === 'system-design') return res.json(await getSystemDesign(user));
    return res.status(400).json({ error: 'Choose kind=dsa or kind=system-design.' });
  }
  const b = req.body || {};
  const kind = clean(b.kind, 40), status = String(b.status || '');
  if (!['attempted','solved','needs_revision','skipped','not_started','in_progress','completed'].includes(status)) return res.status(400).json({ error: 'Choose a valid progress status.' });
  if (kind === 'dsa-attempt') {
    const contestId = Number(b.contestId), index = clean(b.index, 8).toUpperCase();
    if (!Number.isSafeInteger(contestId) || contestId < 1 || !/^[A-Z0-9]+$/.test(index)) return res.status(400).json({ error: 'A valid Codeforces contest and problem index are required.' });
    const topicName = DSA_TOPICS[clean(b.topic,100)] ? clean(b.topic,100) : 'Arrays & Implementation';
    const rating = b.rating == null || b.rating === '' ? null : Number(b.rating);
    const difficulty = difficultyForRating(Number.isFinite(rating) ? rating : null);
    const title = clean(b.title,180) || 'Codeforces problem ' + contestId + index;
    const slug = 'cf-' + contestId + '-' + index.toLowerCase();
    const url = 'https://codeforces.com/problemset/problem/' + contestId + '/' + encodeURIComponent(index);
    const inserted = await db.query("INSERT INTO dsa_problems(slug,title,topic,difficulty,statement,practice_url,source,source_verified,tags) VALUES($1,$2,$3,$4,$5,$6,'Codeforces public API',true,$7::jsonb) ON CONFLICT(slug) DO UPDATE SET title=EXCLUDED.title,topic=EXCLUDED.topic,difficulty=EXCLUDED.difficulty,practice_url=EXCLUDED.practice_url,source=EXCLUDED.source,source_verified=true,tags=EXCLUDED.tags RETURNING id", [slug,title,topicName,difficulty,'Solve the official Codeforces statement and record the approach, proof and complexity.',url,JSON.stringify(Array.isArray(b.tags)?b.tags.slice(0,8):[])]);
    const r = await db.query('INSERT INTO coding_attempts(user_id,problem_id,problem_slug,status,language,approach_notes,time_complexity,space_complexity,actual_minutes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,problem_slug,status,language,approach_notes,time_complexity,space_complexity,actual_minutes,attempted_at', [user,inserted.rows[0].id,slug,status,clean(b.language,60)||null,clean(b.approachNotes,5000)||null,clean(b.timeComplexity,80)||null,clean(b.spaceComplexity,80)||null,Math.max(0,Math.min(100000,Math.floor(Number(b.actualMinutes)||0)))]);
    await logActivity(user, 'dsa_attempt_saved', 'dsa_problem', slug, { status, source: 'Codeforces', topic: topicName });
    return res.status(201).json({ attempt: r.rows[0] });
  }
  if (kind === 'system-design-progress') {
    const slug = clean(b.slug, 140);
    if (!/^sd-(?:[a-z0-9-]+)$/.test(slug)) return res.status(400).json({ error: 'Invalid system design topic.' });
    const topic = await db.query('SELECT id FROM learning_topics WHERE slug=$1', [slug]);
    const topicId = topic.rows.length ? topic.rows[0].id : null;
    const minutes = Math.max(0, Math.min(100000, Math.floor(Number(b.timeSpentMinutes)||0)));
    const result = await db.query("INSERT INTO learning_progress(user_id,topic_id,topic_slug,status,notes,time_spent_minutes,last_practiced_at) VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $4='not_started' THEN NULL ELSE now() END) ON CONFLICT(user_id,topic_slug) DO UPDATE SET status=EXCLUDED.status,notes=COALESCE(EXCLUDED.notes,learning_progress.notes),time_spent_minutes=learning_progress.time_spent_minutes+EXCLUDED.time_spent_minutes,last_practiced_at=CASE WHEN EXCLUDED.status='not_started' THEN learning_progress.last_practiced_at ELSE now() END,updated_at=now() RETURNING topic_slug,status,time_spent_minutes,notes,last_practiced_at", [user,topicId,slug,status,clean(b.notes,3000)||null,minutes]);
    await logActivity(user, 'system_design_progress_saved', 'learning_topic', slug, { status, minutes });
    return res.json({ progress: result.rows[0] });
  }
  return res.status(400).json({ error: 'Choose kind=dsa-attempt or kind=system-design-progress.' });
}