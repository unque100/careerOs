import { db } from 'hatchable';
import { logActivity } from 'lib/career.js';

export const access = 'user';
export const methods = ['POST'];

const JUDGE0 = 'https://ce.judge0.com';
const MAX_CODE = 24000, MAX_STDIN = 10000, MAX_EXPECTED = 10000;
const MAX_POLLS = 3, POLL_DELAY_MS = 200;
const LANGUAGES = {
  cpp: { id: 105, name: 'C++ (GCC 14.1)' },
  c: { id: 103, name: 'C (GCC 14.1)' },
  python: { id: 113, name: 'Python 3.14' },
  java: { id: 91, name: 'Java 17' },
  javascript: { id: 102, name: 'JavaScript (Node.js 22)' },
  typescript: { id: 101, name: 'TypeScript 5.6' },
  go: { id: 107, name: 'Go 1.23' },
  rust: { id: 108, name: 'Rust 1.85' },
  csharp: { id: 51, name: 'C# (Mono)' },
  ruby: { id: 72, name: 'Ruby' },
  php: { id: 98, name: 'PHP 8.3' },
  kotlin: { id: 111, name: 'Kotlin 2.1' }
};
const TERMINAL = new Set([3,4,5,6,7,8,9,10,11,12,13,14]);
function text(value, max) { return String(value == null ? '' : value).slice(0, max); }
function bounded(value, max) { return text(value || '', max); }
async function judge(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(JUDGE0 + path, {
      ...options, signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = new Error(text(data.error || data.message || ('Judge0 returned HTTP ' + response.status), 350));
      err.status = response.status;
      throw err;
    }
    return data;
  } finally { clearTimeout(timeout); }
}
function formatResult(result) {
  const status = result.status || {};
  return {
    statusId: Number(status.id || result.status_id || 0),
    status: text(status.description || result.status || 'Unknown status', 100),
    stdout: bounded(result.stdout, 12000),
    stderr: bounded(result.stderr, 12000),
    compileOutput: bounded(result.compile_output, 12000),
    message: bounded(result.message, 12000),
    timeSeconds: result.time == null ? null : Number(result.time),
    memoryKb: result.memory == null ? null : Number(result.memory),
    language: result.language_id ? (Object.values(LANGUAGES).find(x => x.id === Number(result.language_id)) || {}).name || 'Selected language' : ''
  };
}
async function fetchResult(token) {
  return judge('/submissions/' + encodeURIComponent(token) + '?base64_encoded=false&fields=token,stdout,stderr,compile_output,message,status,time,memory,language_id');
}
async function pollUntilFinished(token, limit = MAX_POLLS) {
  let latest = null;
  for (let i = 0; i < limit; i++) {
    await new Promise(resolve => setTimeout(resolve, POLL_DELAY_MS));
    latest = await fetchResult(token);
    const id = Number(latest.status && latest.status.id || 0);
    if (TERMINAL.has(id)) return { done: true, result: latest };
  }
  return { done: false, result: latest };
}
export default async function(req, res) {
  const user = String(req.user.id);
  await db.query('DELETE FROM compiler_runs WHERE user_id=$1 AND expires_at < now()', [user]);
  const b = req.body || {};

  if (b.action === 'poll') {
    const token = text(b.token, 100);
    if (!token) return res.status(400).json({ error: 'A run token is required.' });
    const owner = await db.query('SELECT token FROM compiler_runs WHERE token=$1 AND user_id=$2 AND expires_at > now()', [token, user]);
    if (!owner.rows.length) return res.status(404).json({ error: 'Run token not found or expired. Run the code again.' });
    try {
      const polled = await pollUntilFinished(token, 2);
      if (!polled.done) return res.status(202).json({ pending: true, token, status: text(polled.result?.status?.description || 'In Queue', 80), message: 'Your code is still running in the public queue. Check again in a moment.' });
      return res.json({ result: formatResult(polled.result), token });
    } catch (e) {
      return res.status(e.status && e.status < 500 ? e.status : 502).json({ error: 'Could not retrieve execution output: ' + text(e.message, 220) });
    }
  }

  const language = text(b.language, 30).toLowerCase();
  const sourceCode = text(b.sourceCode, MAX_CODE);
  const stdin = text(b.stdin, MAX_STDIN);
  const expectedOutput = text(b.expectedOutput, MAX_EXPECTED);
  if (!LANGUAGES[language]) return res.status(400).json({ error: 'Choose a supported language.' });
  if (!sourceCode.trim()) return res.status(400).json({ error: 'Write some code before running it.' });
  if (String(b.sourceCode || '').length > MAX_CODE) return res.status(413).json({ error: 'Code is too large. The editor limit is 24,000 characters.' });
  if (String(b.stdin || '').length > MAX_STDIN) return res.status(413).json({ error: 'Input is too large. The input limit is 10,000 characters.' });
  if (String(b.expectedOutput || '').length > MAX_EXPECTED) return res.status(413).json({ error: 'Expected output is too large.' });

  const recent = await db.query("SELECT count(*)::int AS n FROM compiler_runs WHERE user_id=$1 AND created_at > now() - interval '1 minute'", [user]);
  if (Number(recent.rows[0]?.n || 0) >= 10) return res.status(429).json({ error: 'Code execution limit reached for this minute. Wait a little, then try again.' });

  try {
    const submission = await judge('/submissions?base64_encoded=false&wait=false', {
      method: 'POST',
      body: JSON.stringify({
        source_code: sourceCode, language_id: LANGUAGES[language].id, stdin,
        ...(expectedOutput.trim() ? { expected_output: expectedOutput } : {}),
        cpu_time_limit: 3, cpu_extra_time: 1, wall_time_limit: 5,
        memory_limit: 128000, stack_limit: 64000, max_processes_and_or_threads: 32,
        enable_network: false
      })
    });
    const token = text(submission.token, 100);
    if (!token) return res.status(502).json({ error: 'The compiler did not return a run token. Try again shortly.' });
    await db.query("INSERT INTO compiler_runs(token,user_id,language,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')", [token,user,language]);
    await logActivity(user, 'compiler_run_started', 'compiler_submission', token, { language });
    const polled = await pollUntilFinished(token);
    if (!polled.done) return res.status(202).json({ pending: true, token, status: text(polled.result?.status?.description || 'In Queue', 80), message: 'Execution is taking longer than usual. Check the run status again.' });
    return res.json({ result: formatResult(polled.result), token, source: 'Judge0 CE public execution service', expectedOutputIncluded: !!expectedOutput.trim() });
  } catch (e) {
    console.error('compiler run failed', text(e.message, 220));
    if (e.name === 'AbortError') return res.status(504).json({ error: 'The code execution provider timed out. Retry once the service is available.' });
    return res.status(e.status && e.status < 500 ? e.status : 502).json({ error: 'Code execution is temporarily unavailable: ' + text(e.message, 220) });
  }
}