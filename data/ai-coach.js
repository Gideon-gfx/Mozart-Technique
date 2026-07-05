// AI practice feedback via the Claude API. Inert (returns a friendly
// not-configured message) until ANTHROPIC_API_KEY is set - same pattern as
// the Google sign-in and SMTP integrations.
const Anthropic = require('@anthropic-ai/sdk');

const isConfigured = Boolean(process.env.ANTHROPIC_API_KEY);
if (!isConfigured) {
  console.warn('ANTHROPIC_API_KEY is not set - AI practice feedback will stay disabled.');
}

const client = isConfigured ? new Anthropic() : null;

async function getPracticeFeedback({ courseTitle, category, level, notes }) {
  if (!client) {
    return {
      available: false,
      feedback: 'AI practice feedback is not configured yet. Add ANTHROPIC_API_KEY to enable it.',
    };
  }

  const system = `You are an encouraging but precise ${category} coach teaching a ${level}-level student in the course "${courseTitle}". ` +
    `The student will describe what they practiced or how a take/run went. Give specific, actionable feedback: ` +
    `what likely went well, 1-3 concrete technique fixes, and one focused thing to practice next. ` +
    `Keep it to a short paragraph or a few bullet points - no long essays.`;

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 512,
      system,
      messages: [{ role: 'user', content: notes }],
    });
    const textBlock = response.content.find((b) => b.type === 'text');
    return { available: true, feedback: textBlock ? textBlock.text : '' };
  } catch (err) {
    console.error('[ai-coach] request failed:', err.message);
    return { available: false, feedback: 'Could not reach the AI coach right now. Try again shortly.' };
  }
}

module.exports = { getPracticeFeedback, isConfigured };
