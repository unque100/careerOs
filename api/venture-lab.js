import { ai, db } from 'hatchable';
import { clean, safeJson, consumeAiQuota, logActivity } from 'lib/career.js';

export const access = 'user';
export const methods = ['GET', 'POST'];

export default async function(req, res) {
  const user = String(req.user.id);
  if (req.method === 'GET') {
    const r = await db.query(
      'SELECT id, title, business_type, stage, brief, plan, created_at FROM venture_plans WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20',
      [user]
    );
    return res.json({ plans: r.rows });
  }
  const b = req.body || {};
  const idea = clean(b.idea, 5000);
  const businessType = clean(b.businessType || 'digital product or service', 100);
  const stage = clean(b.stage || 'idea', 60);
  const audience = clean(b.audience || 'Not specified yet', 300);
  const location = clean(b.location || 'Not specified yet', 160);
  const budget = clean(b.budget || 'Not specified yet', 100);
  const mode = ['validate', 'business-plan', 'go-to-market', 'customer-discovery'].includes(b.mode) ? b.mode : 'validate';
  if (idea.length < 15) return res.status(400).json({ error: 'Describe your business idea in at least 15 characters so the plan can be specific.' });
  const quota = await consumeAiQuota(user);
  if (!quota.allowed) return res.status(429).json({ error: 'Monthly AI limit reached for your current plan.', usage: quota });
  const modeLabels = {
    validate: 'Idea validation and low-cost validation experiments',
    'business-plan': 'Business plan and business model',
    'go-to-market': 'Go-to-market, positioning, channels and first-customer plan',
    'customer-discovery': 'Customer discovery, interview script and problem validation'
  };
  const prompt = [
    'Create a practical founder planning draft for the mode: ' + modeLabels[mode] + '.',
    'Return one valid JSON object with this schema: {title:string, executiveSummary:string, targetCustomers:[string], customerPainHypotheses:[string], valueProposition:string, businessModel:[string], mvpScope:[string], validationExperiments:[{experiment:string,costEstimate:string,successSignal:string,timebox:string}], goToMarketSteps:[string], risks:[string], researchQueries:[string], assumptions:[string], nextActions:[string]}.',
    'Strict integrity rules: Do not invent live market sizes, competitor revenues, current funding availability, customer counts, conversion rates, survey results, or sourced facts. This endpoint does not query external market databases. Mark every unverified market or price statement as an assumption. costEstimate must say "estimate" or "to be priced locally", not pretend to be a quote. Put verification tasks in researchQueries as search queries or public-source pages to check. Do not claim customers have validated the idea. No promises of success.',
    'Make the output suitable for a first-time student founder, a working professional with limited time, or an experienced entrepreneur. Focus on the next 7–30 days, testable actions, ethical data collection, and customer evidence. Prefer experiments with explicit pass/fail signals over broad advice.',
    'User input: ' + JSON.stringify({ idea, businessType, stage, audience, location, budget, mode })
  ].join('\n');
  try {
    const result = await ai.generateText({
      model: 'gpt-mini',
      purpose: 'careeros-founder-venture-lab',
      userId: user,
      system: 'You are a rigorous startup advisor. Separate user-provided facts from assumptions and hypotheses. Never fabricate evidence or imply that generated outputs are live market research.',
      prompt, maxTokens: 2200
    });
    if (!result || !result.text) return res.status(502).json({ error: 'The AI provider returned no founder plan. Retry after checking provider setup.' });
    const plan = safeJson(result.text, { executiveSummary: result.text, assumptions: ['The model response could not be parsed into structured sections; review this text manually.'] });
    const title = clean(plan.title || idea, 180) || 'Founder plan';
    const saved = await db.query(
      'INSERT INTO venture_plans(user_id,title,business_type,stage,brief,plan) VALUES($1,$2,$3,$4,$5,$6::jsonb) RETURNING id,title,business_type,stage,brief,plan,created_at',
      [user, title, businessType, stage, idea, JSON.stringify(plan)]
    );
    await logActivity(user, 'venture_plan_created', 'venture_plan', saved.rows[0].id, { mode, businessType });
    return res.status(201).json({ plan: saved.rows[0], usage: quota, disclosure: 'AI-generated strategy draft. No live market research was performed by this endpoint; verify market facts and all assumptions using linked research queries before investing money.' });
  } catch (e) {
    console.error('Founder venture plan failed', String(e && e.message || e).slice(0, 180));
    return res.status(503).json({ error: 'Founder plan generation is unavailable. Check AI provider setup and retry.' });
  }
}