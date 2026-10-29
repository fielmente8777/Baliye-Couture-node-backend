import { env } from '@config/env';
import { logger } from '@config/logger';
import { ApiError } from '@utils/apiError';

/**
 * "Write with AI" in the admin content editor.
 *
 * One small text call per click: draft, improve, shorten, lengthen or fix a
 * piece of website copy, in the brand's voice. The admin always sees the
 * suggestion first and chooses to use it — nothing is saved from here.
 */

export type WriteAction = 'write' | 'improve' | 'shorter' | 'longer' | 'fix' | 'custom';

export interface WriteInput {
  action: WriteAction;
  /** The field's current text (HTML for rich text). */
  text?: string;
  /** What to write about, or the custom instruction. */
  instruction?: string;
  /** What the field is, e.g. "Home page › Top banner › Description". */
  field?: string;
  /** "html": rich text (headings, lists, links). "plain": a simple field. */
  format: 'html' | 'plain';
}

const BRAND = [
  'You write website copy for Baliye Couture, a brand of handcrafted, made-to-measure Indian ethnic wear',
  '(kurtis, suits, anarkalis, shararas, lehengas) that customers can design themselves: fabric, colour,',
  'neckline, sleeves and embroidery.',
  'Voice: warm, elegant and confident, never pushy; clear and simple words. British English spelling',
  '(colour, customise). No em dashes or en dashes; use commas or full stops instead. No emojis, no hashtags.',
  'Never invent facts: no prices, delivery times, discounts, policies, addresses, phone numbers or email',
  'addresses unless they are already in the text you are given.',
].join(' ');

const TASKS: Record<WriteAction, string> = {
  write: 'Write new copy for this field from the brief.',
  improve: 'Rewrite the text so it reads better and sounds more premium. Keep the meaning and roughly the same length.',
  shorter: 'Make the text noticeably shorter, keeping the key message.',
  longer: 'Expand the text with a little more helpful detail, without inventing facts.',
  fix: 'Correct spelling, grammar and punctuation only. Change nothing else.',
  custom: 'Follow the instruction.',
};

export async function writeContent(input: WriteInput): Promise<string> {
  if (!env.openai.apiKey) throw ApiError.badRequest('AI writing needs OPENAI_API_KEY on the backend');
  if (input.action !== 'write' && input.action !== 'custom' && !input.text?.trim()) {
    throw ApiError.badRequest('There is no text in this field yet. Use "Write it for me" instead.');
  }

  const formatRule =
    input.format === 'html'
      ? 'Reply with clean HTML only: <h2>, <h3>, <p>, <ul>/<ol>/<li>, <strong>, <em>, <a href>. No <html>, <body>, styles, classes or code fences. Keep any existing headings and structure unless asked otherwise.'
      : 'Reply with plain text only, no HTML, no markdown, no quotation marks around it. Keep it to a length that suits the field.';

  const user = [
    input.field ? `Field: ${input.field}.` : '',
    `Task: ${TASKS[input.action]}`,
    input.instruction?.trim() ? `${input.action === 'custom' ? 'Instruction' : 'Brief'}: ${input.instruction.trim()}` : '',
    input.text?.trim() ? `Current text:\n${input.text.trim()}` : '',
    formatRule,
  ]
    .filter(Boolean)
    .join('\n\n');

  const response = await fetch(`${env.openai.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.openai.apiKey}`,
      ...(env.openai.organization ? { 'OpenAI-Organization': env.openai.organization } : {}),
    },
    body: JSON.stringify({
      model: env.openai.textModel,
      messages: [
        { role: 'system', content: BRAND },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  }).catch(() => null);

  if (!response?.ok) {
    logger.warn({ status: response?.status }, 'AI writing failed');
    throw ApiError.badRequest('The AI writer is not available right now. Please try again.');
  }

  const json = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const text = (json.choices?.[0]?.message?.content ?? '')
    .replace(/^```(?:html)?\s*|\s*```$/g, '')
    .replace(/\s*[—–]\s*/g, ', ')
    .trim();
  if (!text) throw ApiError.badRequest('The AI writer returned nothing. Please try again.');
  return text;
}
