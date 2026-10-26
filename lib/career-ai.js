import { ai } from 'hatchable';

/**
 * Provider-neutral CareerOS text generation boundary.
 * The platform-managed AI gateway keeps provider credentials out of browser code.
 * Future providers should implement this contract without changing product routes.
 */
export async function generateCareerText({ userId, purpose, system, prompt, maxTokens = 1800, model } = {}) {
  const chosenModel = model || 'gpt-mini';
  const input = {
    model: chosenModel,
    purpose: String(purpose || 'careeros'),
    userId: String(userId || ''),
    system: String(system || ''),
    prompt: String(prompt || ''),
    maxTokens: Math.max(128, Math.min(4000, Number(maxTokens) || 1800))
  };
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    let timer;
    try {
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('AI provider timeout after 45 seconds')), 45000);
      });
      const result = await Promise.race([ai.generateText(input), timeout]);
      if (!result || typeof result.text !== 'string' || !result.text.trim()) {
        throw new Error('AI provider returned an empty response');
      }
      return { ...result, provider: 'hatchable-managed', model: chosenModel };
    } catch (error) {
      lastError = error;
      const message = String(error && error.message || error);
      const retryable = /timeout|temporar|rate.?limit|429|502|503|504|network|unavailable/i.test(message);
      if (attempt > 0 || !retryable) break;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  throw lastError || new Error('AI provider unavailable');
}