import { db } from 'hatchable';
import { clean, logActivity } from 'lib/career.js';
const STATIC_TOPIC_ROWS = [
 ['typescript-fundamentals','TypeScript Fundamentals','Programming Languages','beginner','Types, narrowing, interfaces, generics and strict compiler options.','https://www.typescriptlang.org/docs/','TypeScript Handbook',45,[],'Programming foundations'],
 ['javascript-fundamentals','JavaScript Fundamentals','Backend','beginner','Closures, prototypes, promises, the event loop and asynchronous errors.','https://developer.mozilla.org/en-US/docs/Web/JavaScript','MDN JavaScript Guide',60,[],'Programming foundations'],
 ['nodejs-runtime','Node.js Runtime','Backend','intermediate','Event loop phases, worker threads, streams, backpressure and process lifecycle.','https://nodejs.org/en/learn','Node.js Learn',60,['javascript-fundamentals'],'Backend engineering'],
 ['nestjs-fundamentals','NestJS Architecture','Backend','intermediate','Modules, providers, dependency injection, controllers, pipes, guards and interceptors.','https://docs.nestjs.com/','NestJS Documentation',60,['typescript-fundamentals'],'Backend engineering'],
 ['java-fundamentals','Java Fundamentals','Programming Languages','beginner','Classes, interfaces, collections, generics, exceptions, streams and JVM basics.','https://dev.java/learn/','Dev.java',60,[],'Programming foundations'],
 ['python-fundamentals','Python Fundamentals','Programming Languages','beginner','Data structures, functions, modules, exceptions, iterators and generators.','https://docs.python.org/3/tutorial/','Python Tutorial',45,[],'Programming foundations'],
 ['oop-fundamentals','Object-Oriented Programming','CS Fundamentals','beginner','Encapsulation, abstraction, inheritance, polymorphism, composition and SOLID.','https://refactoring.guru/design-patterns','Refactoring.Guru',45,[],'Programming foundations'],
 ['sql-databases','SQL and Database Design','Databases','intermediate','Schema design, indexes, transactions, query plans and data integrity.','https://www.postgresql.org/docs/','PostgreSQL Documentation',60,[],'Databases'],
 ['dbms-fundamentals','DBMS and Transactions','CS Fundamentals','intermediate','Normalization, isolation levels, locking, MVCC, indexes and recovery.','https://www.postgresql.org/docs/current/','PostgreSQL Documentation',60,['sql-databases'],'Databases'],
 ['operating-systems','Operating Systems','CS Fundamentals','intermediate','Processes, threads, scheduling, synchronization, memory and deadlocks.','https://pages.cs.wisc.edu/~remzi/OSTEP/','Operating Systems: Three Easy Pieces',60,[],'Computer science fundamentals'],
 ['computer-networking','Computer Networking','CS Fundamentals','intermediate','TCP/IP, HTTP, DNS, TLS, sockets, connection reuse and load balancing.','https://developer.mozilla.org/en-US/docs/Web/HTTP','MDN HTTP Guide',60,[],'Computer science fundamentals'],
 ['mongodb-fundamentals','MongoDB Data Modeling','Databases','intermediate','Document modeling, indexes, aggregation, atomicity and query performance.','https://www.mongodb.com/docs/','MongoDB Documentation',60,[],'Databases'],
 ['redis-queues','Redis and Queues','Backend','intermediate','Redis structures, TTLs, caching, idempotency, retries and background jobs.','https://redis.io/docs/latest/','Redis Documentation',60,[],'Backend engineering'],
 ['queues-workers','Queues and Background Workers','Backend','intermediate','Retries, idempotency, dead-letter queues, scheduling, concurrency and backpressure.','https://docs.bullmq.io/','BullMQ Documentation',50,['backend-api-design'],'Backend engineering'],
 ['cloud-fundamentals','Cloud and Deployment','Cloud & Security','beginner','Compute, networking, object storage, IAM, observability and deployment.','https://docs.aws.amazon.com/whitepapers/latest/aws-overview/introduction.html','AWS Overview',60,[],'Cloud and operations'],
 ['backend-api-design','Backend API Design','Backend','intermediate','REST contracts, validation, pagination, idempotency, versioning and authorization.','https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-design','Microsoft API Design Guide',50,[],'Backend engineering'],
 ['application-security','Application Security','Cloud & Security','intermediate','Threat modeling, authentication, authorization, input validation and safe logging.','https://owasp.org/www-project-top-ten/','OWASP Top 10',50,['backend-api-design'],'Cloud and security'],
 ['distributed-systems','Distributed Systems','System Design','advanced','Replication, consistency, partitions, ordering, consensus and partial failure.','https://github.com/donnemartin/system-design-primer','System Design Primer',75,['dbms-fundamentals','computer-networking'],'System design'],
 ['performance-scalability','Performance and Scalability','System Design','advanced','Tail latency, throughput, queues, caches, capacity and graceful degradation.','https://nodejs.org/en/learn/diagnostics','Node.js Diagnostics',60,['nodejs-runtime','queues-workers'],'Performance engineering'],
 ['behavioral-interviews','Behavioral Interview Practice','Career Skills','beginner','Build evidence-based STAR stories about ownership, conflict, learning and impact.','https://careerservices.fas.harvard.edu/resources/create-a-strong-resume/','Harvard FAS Career Services',30,[],'Career readiness'],
 ['security-web-fundamentals','Web Security Fundamentals','Cloud & Security','intermediate','Cookies, CSRF, XSS, CORS, CSP, secure sessions and rate limiting.','https://developer.mozilla.org/en-US/docs/Web/Security','MDN Web Security',45,['application-security'],'Cloud and security'],
 ['rxjs-fundamentals','Reactive Programming with RxJS','Backend','intermediate','Observables, operators, cancellation, error handling and subscriptions.','https://rxjs.dev/guide/overview','RxJS Documentation',45,['typescript-fundamentals'],'Backend engineering'],
 ['nodejs-testing','Node.js Testing and Reliability','Backend','intermediate','Unit/integration tests, async races, diagnostics and meaningful assertions.','https://nodejs.org/api/test.html','Node.js Test Runner',45,['nodejs-runtime'],'Backend engineering'],
 ['sql-query-plans','SQL Query Plans and Indexes','Databases','intermediate','Read EXPLAIN plans, assess selectivity and validate index performance.','https://www.postgresql.org/docs/current/using-explain.html','PostgreSQL EXPLAIN',45,['sql-databases'],'Databases'],
 ['low-level-design-patterns','LLD and Design Patterns','System Design','intermediate','Responsibilities, interfaces, composition, dependency inversion and practical patterns.','https://refactoring.guru/design-patterns','Refactoring.Guru',60,['oop-fundamentals'],'System design'],
 ['hld-capacity-planning','HLD and Capacity Planning','System Design','advanced','Estimate QPS, storage, cache working sets, replication and bottlenecks.','https://github.com/donnemartin/system-design-primer','System Design Primer',60,['distributed-systems','performance-scalability'],'System design']
];
const TOPIC_EXAMPLES = {
 'typescript-fundamentals':'type User = { id: string; name: string };\nfunction greet(user: User): string { return "Hello, " + user.name; }',
 'javascript-fundamentals':'queueMicrotask(() => console.log("microtask"));\nsetTimeout(() => console.log("timer"), 0);',
 'nodejs-runtime':'A synchronous CPU loop blocks the event loop until the function returns.',
 'nestjs-fundamentals':'@Injectable()\nexport class UserService { /* business rules */ }',
 'java-fundamentals':'List<String> names = List.of("Ada", "Linus");',
 'python-fundamentals':'def unique_names(names):\n    return sorted(set(names))',
 'sql-query-plans':'Inspect an execution plan for a customer-key lookup; compare estimated rows, actual rows and buffer reads.',
 'sql-databases':'BEGIN transaction; perform both sides of a transfer; COMMIT only if both changes succeed.',
 'redis-queues':'SET user:42 "{...}" EX 300',
 'backend-api-design':'PUT /orders/{id} with an idempotency key',
 'distributed-systems':'Producer → durable queue → idempotent consumer → observable result',
 'low-level-design-patterns':'interface Channel { send(message: Message): Promise<void> }',
 'hld-capacity-planning':'requests/day ÷ 86,400 → average QPS; estimate peak separately.'
};
const STATIC_TOPICS = STATIC_TOPIC_ROWS.map(r=>({
 slug:r[0],title:r[1],category:r[2],difficulty:r[3],description:r[4],resource_url:r[5],resource_source:r[6],resource_verified:true,estimated_minutes:r[7],prerequisites:r[8],learning_path:r[9],
 lesson_content:{
  overview:r[4],
  learningObjectives:['Explain the core concept in your own words','Recognize when this concept or technique is useful','Describe one trade-off and test an important edge case'],
  example:TOPIC_EXAMPLES[r[0]]||'Write a small example, state its assumptions, and test a normal case plus an edge case.',
  exercise:'Solve one realistic interview exercise about this topic. Explain your approach, complexity where relevant, edge cases and one trade-off.',
  revisionNotes:'Summarize the key definition, when to use it, one common pitfall, and how you would verify correctness or performance.',
  quiz:['Explain the core concept without notes.','When would you choose an alternative?','What edge case or trade-off would you test?'],
  youtubeSearch:r[1]+' tutorial software engineering'
 }
}));

export const access = 'user';
export const methods = ['GET','POST'];
export default async function(req,res){
 const user=String(req.user.id);
 if(req.method==='GET'){
  const category=clean(req.query?.category,80),difficulty=clean(req.query?.difficulty,30),path=clean(req.query?.path,100),search=clean(req.query?.q,120);
  const existing=await db.query("SELECT t.id,t.slug,t.title,t.category,t.difficulty,t.description,t.resource_url,t.resource_source,t.resource_verified,t.estimated_minutes,t.prerequisites,t.learning_path,t.lesson_content,COALESCE(p.status,'not_started') AS progress_status,COALESCE(p.time_spent_minutes,0) AS time_spent_minutes,COALESCE(p.is_bookmarked,false) AS is_bookmarked,p.quiz_score,p.notes,p.last_practiced_at FROM learning_topics t LEFT JOIN learning_progress p ON p.topic_slug=t.slug AND p.user_id=$1 ORDER BY t.category,t.title",[user]);
  const staticProgress=await db.query('SELECT topic_slug,status,time_spent_minutes,is_bookmarked,quiz_score,notes,last_practiced_at FROM learning_progress WHERE user_id=$1 AND topic_slug=ANY($2::text[])',[user,STATIC_TOPICS.map(t=>t.slug)]);
  const progressMap=new Map(staticProgress.rows.map(x=>[x.topic_slug,x]));
  const staticBySlug=new Map(STATIC_TOPICS.map(t=>[t.slug,t]));
  const databaseSlugs=new Set(existing.rows.map(t=>t.slug));
  const enriched=existing.rows.map(t=>{
   const extra=staticBySlug.get(t.slug);if(!extra)return t;
   const lesson=t.lesson_content&&typeof t.lesson_content==='object'&&Object.keys(t.lesson_content).length?t.lesson_content:extra.lesson_content;
   return {...extra,...t,prerequisites:Array.isArray(t.prerequisites)&&t.prerequisites.length?t.prerequisites:extra.prerequisites,learning_path:t.learning_path||extra.learning_path,lesson_content:lesson};
  });
  const extraTopics=STATIC_TOPICS.filter(t=>!databaseSlugs.has(t.slug)).map(t=>{const p=progressMap.get(t.slug)||{};return {...t,id:null,progress_status:p.status||'not_started',time_spent_minutes:Number(p.time_spent_minutes||0),is_bookmarked:Boolean(p.is_bookmarked),quiz_score:p.quiz_score??null,notes:p.notes||null,last_practiced_at:p.last_practiced_at||null}});
  const topics=[...enriched,...extraTopics].filter(t=>(!category||t.category===category)&&(!difficulty||t.difficulty===difficulty)&&(!path||t.learning_path===path)&&(!search||(t.title+' '+t.description+' '+t.category+' '+(t.learning_path||'')).toLowerCase().includes(search.toLowerCase())));
  const [stats,resources]=await Promise.all([
   db.query("SELECT count(*) FILTER(WHERE status<>'not_started')::int AS started,count(*) FILTER(WHERE status='completed')::int AS completed,COALESCE(sum(time_spent_minutes),0)::int AS minutes,count(*) FILTER(WHERE is_bookmarked)::int AS bookmarks,COALESCE(ROUND(AVG(quiz_score))::int,0) AS average_quiz_score FROM learning_progress WHERE user_id=$1",[user]),
   db.query('SELECT resource_key,topic_slug,is_bookmarked,watched,watch_progress_seconds,updated_at FROM user_learning_resources WHERE user_id=$1',[user])
  ]);
  topics.sort((a,b)=>String(a.category).localeCompare(String(b.category))||String(a.title).localeCompare(String(b.title)));
  return res.json({topics,stats:stats.rows[0],resources:resources.rows});
 }
 const b=req.body||{};
 if(b.action==='resource-progress'){
  const slug=clean(b.topicSlug,120),key=clean(b.resourceKey,500),watched=Boolean(b.watched),seconds=Number(b.watchProgressSeconds||0);
  if(!slug||!key||!Number.isInteger(seconds)||seconds<0||seconds>86400)return res.status(400).json({error:'A valid topic, resource and watch position are required.'});
  const topic=await db.query('SELECT slug FROM learning_topics WHERE slug=$1',[slug]);if(!topic.rows.length&&!STATIC_TOPICS.some(t=>t.slug===slug))return res.status(404).json({error:'Learning topic not found.'});
  const saved=await db.query('INSERT INTO user_learning_resources(user_id,resource_key,topic_slug,is_bookmarked,watched,watch_progress_seconds) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id,resource_key) DO UPDATE SET topic_slug=EXCLUDED.topic_slug,is_bookmarked=EXCLUDED.is_bookmarked,watched=EXCLUDED.watched,watch_progress_seconds=EXCLUDED.watch_progress_seconds,updated_at=now() RETURNING *',[user,key,slug,Boolean(b.isBookmarked),watched,seconds]);
  await logActivity(user,'learning_resource_progress','learning_resource',key,{watched,seconds});
  return res.json({resource:saved.rows[0]});
 }
 const slug=clean(b.topicSlug,120),status=String(b.status||'in_progress'),minutes=Number(b.timeSpentMinutes||0),notes=clean(b.notes,3000);
 if(b.action==='bookmark-topic'){
  if(!slug)return res.status(400).json({error:'Choose a learning topic.'});
  const topic=await db.query('SELECT id FROM learning_topics WHERE slug=$1',[slug]);const topicId=topic.rows[0]?.id??null;if(topicId===null&&!STATIC_TOPICS.some(t=>t.slug===slug))return res.status(404).json({error:'Learning topic not found.'});
  const bookmarked=Boolean(b.bookmarked);
  const r=await db.query("INSERT INTO learning_progress(user_id,topic_id,topic_slug,status,is_bookmarked) VALUES($1,$2,$3,'not_started',$4) ON CONFLICT(user_id,topic_slug) DO UPDATE SET is_bookmarked=EXCLUDED.is_bookmarked,updated_at=now() RETURNING is_bookmarked",[user,topicId,slug,bookmarked]);
  await logActivity(user,'learning_topic_bookmark','learning_topic',slug,{bookmarked});return res.json({bookmarked:r.rows[0].is_bookmarked});
 }
 if(b.action==='quiz-result'){
  const score=Number(b.quizScore);if(!slug||!Number.isInteger(score)||score<0||score>100)return res.status(400).json({error:'Provide a topic and quiz score from 0 to 100.'});
  const topic=await db.query('SELECT id FROM learning_topics WHERE slug=$1',[slug]);const topicId=topic.rows[0]?.id??null;if(topicId===null&&!STATIC_TOPICS.some(t=>t.slug===slug))return res.status(404).json({error:'Learning topic not found.'});
  const r=await db.query("INSERT INTO learning_progress(user_id,topic_id,topic_slug,status,quiz_score) VALUES($1,$2,$3,'in_progress',$4) ON CONFLICT(user_id,topic_slug) DO UPDATE SET quiz_score=EXCLUDED.quiz_score,updated_at=now() RETURNING quiz_score,status",[user,topicId,slug,score]);
  await logActivity(user,'learning_quiz_recorded','learning_topic',slug,{score});return res.json({quizScore:r.rows[0].quiz_score});
 }
 if(!slug||!['not_started','in_progress','completed','needs_revision'].includes(status))return res.status(400).json({error:'Choose a topic and valid progress status.'});
 if(!Number.isInteger(minutes)||minutes<0||minutes>100000)return res.status(400).json({error:'Time spent must be non-negative minutes.'});
 const topic=await db.query('SELECT id FROM learning_topics WHERE slug=$1',[slug]);const topicId=topic.rows[0]?.id??null;
 if(topicId===null&&!STATIC_TOPICS.some(t=>t.slug===slug))return res.status(404).json({error:'Learning topic not found.'});
 const r=await db.query("INSERT INTO learning_progress(user_id,topic_id,topic_slug,status,notes,time_spent_minutes,last_practiced_at) VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $4='not_started' THEN NULL ELSE now() END) ON CONFLICT(user_id,topic_slug) DO UPDATE SET status=EXCLUDED.status,notes=EXCLUDED.notes,time_spent_minutes=learning_progress.time_spent_minutes+EXCLUDED.time_spent_minutes,last_practiced_at=CASE WHEN EXCLUDED.status='not_started' THEN learning_progress.last_practiced_at ELSE now() END,updated_at=now() RETURNING *",[user,topicId,slug,status,notes||null,minutes]);
 await logActivity(user,'learning_progress_updated','learning_topic',slug,{status,minutes});
 return res.json({progress:r.rows[0]});
}