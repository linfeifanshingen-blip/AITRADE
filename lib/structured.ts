import { generateText } from 'ai';
import { llmCallOptions } from '@/lib/ai';
import type { z } from 'zod';

type NormalizeFn = (value: any) => any;

const RATING_MAP: Record<string, string> = {
  buy: 'Buy',
  'strong buy': 'Buy',
  买入: 'Buy',
  買入: 'Buy',
  增持: 'Overweight',
  overweight: 'Overweight',
  超配: 'Overweight',
  加仓: 'Overweight',
  加倉: 'Overweight',
  hold: 'Hold',
  持有: 'Hold',
  观望: 'Hold',
  觀望: 'Hold',
  中性: 'Hold',
  underweight: 'Underweight',
  减持: 'Underweight',
  減持: 'Underweight',
  低配: 'Underweight',
  sell: 'Sell',
  卖出: 'Sell',
  賣出: 'Sell',
  清仓: 'Sell',
  清倉: 'Sell',
};

const ACTION_MAP: Record<string, string> = {
  buy: 'Buy',
  买入: 'Buy',
  買入: 'Buy',
  增持: 'Buy',
  加仓: 'Buy',
  加倉: 'Buy',
  overweight: 'Buy',
  hold: 'Hold',
  持有: 'Hold',
  观望: 'Hold',
  觀望: 'Hold',
  中性: 'Hold',
  sell: 'Sell',
  卖出: 'Sell',
  賣出: 'Sell',
  减持: 'Sell',
  減持: 'Sell',
  underweight: 'Sell',
};

function normalizeEnum(value: any, map: Record<string, string>): any {
  if (typeof value !== 'string') return value;
  const cleaned = value.trim().replace(/^["'`]+|["'`]+$/g, '');
  return map[cleaned.toLowerCase()] || map[cleaned] || cleaned;
}

function pick(value: any, keys: string[]) {
  for (const key of keys) {
    if (value?.[key] != null) return value[key];
  }
  return undefined;
}

function asString(value: any): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function cleanDecisionText(value: any): string {
  return asString(value)
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/[�]+/g, '')
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (/^\|?[\s:-]+\|[\s|:-]*$/.test(trimmed)) return false;
      if ((trimmed.match(/\|/g) || []).length >= 2) return false;
      return true;
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function removeSourceApologyLanguage(value: string): string {
  const banned = /(信息源不足|数据不足|覆盖有限|无法获取|未获取到|缺乏海外|缺乏直接.*官方|缺乏.*官方公司公告|缺乏.*权威财经|官方公告.*不足|权威财经.*不足|source unavailable|unavailable|insufficient|limited data|limited coverage|missing source|missing coverage|failed source|skipped source|misconfigured|not configured|no valid data|retrieval coverage)/i;
  const cleaned = asString(value)
    .split('\n')
    .filter(line => !banned.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned || asString(value).trim();
}

function asOptionalNumber(value: any): number | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const match = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    if (match) return Number(match[0]);
  }
  return undefined;
}

function stripJsonFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

export function extractFirstJsonObject(text: string) {
  const stripped = stripJsonFence(text);
  try {
    return JSON.parse(stripped);
  } catch {}

  const start = stripped.indexOf('{');
  if (start < 0) throw new Error('model did not return a JSON object');

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (depth === 0) {
      return JSON.parse(stripped.slice(start, i + 1));
    }
  }

  throw new Error('model returned incomplete JSON');
}

function validationMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as any).message);
  }
  return String(error);
}

async function repairJsonSyntax({
  model,
  system,
  name,
  text,
  error,
}: {
  model: any;
  system: string;
  name: string;
  text: string;
  error: unknown;
}) {
  const repair = await generateText({
    model,
    system,
    temperature: 0,
    ...llmCallOptions('structured'),
    prompt: `Convert this ${name} response into exactly one valid JSON object.
Return ONLY JSON. Preserve the original meaning. Escape quotes and newlines correctly. Do not add markdown.

JSON parse error:
${validationMessage(error)}

Original response:
${text}`,
  });

  return extractFirstJsonObject(repair.text);
}

export async function generateStructuredObject<T>({
  model,
  system,
  prompt,
  schema,
  normalize,
  name,
  temperature = 0.3,
}: {
  model: any;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  normalize?: NormalizeFn;
  name: string;
  temperature?: number;
}): Promise<T> {
  const jsonPrompt = `${prompt}

Return ONLY one valid JSON object for ${name}. Do not wrap it in markdown.
  Enum fields must use the exact English enum tokens requested in the prompt, even when explanatory text is Chinese.`;

  const first = await generateText({ model, system, prompt: jsonPrompt, temperature, ...llmCallOptions('structured') });
  let rawParsed: any;
  try {
    rawParsed = extractFirstJsonObject(first.text);
  } catch (error) {
    rawParsed = await repairJsonSyntax({ model, system, name, text: first.text, error });
  }

  let parsed = normalize ? normalize(rawParsed) : rawParsed;
  let result = schema.safeParse(parsed);
  if (result.success) return result.data;

  const repair = await generateText({
    model,
    system,
    temperature: 0,
    ...llmCallOptions('structured'),
    prompt: `Fix this ${name} JSON so it validates. Return ONLY JSON.

Validation error:
${validationMessage(result.error)}

Original JSON/text:
${first.text}`,
  });

  try {
    rawParsed = extractFirstJsonObject(repair.text);
  } catch (error) {
    rawParsed = await repairJsonSyntax({ model, system, name, text: repair.text, error });
  }

  parsed = normalize ? normalize(rawParsed) : rawParsed;
  result = schema.safeParse(parsed);
  if (result.success) return result.data;

  throw new Error(`Structured output validation failed for ${name}: ${validationMessage(result.error)}`);
}

export function normalizeResearchPlan(value: any) {
  return {
    recommendation: normalizeEnum(pick(value, ['recommendation', 'rating', '评级', '建议']), RATING_MAP),
    rationale: asString(pick(value, ['rationale', 'reasoning', '理由', '分析'])),
    strategic_actions: asString(pick(value, ['strategic_actions', 'strategicActions', 'actions', '行动', '策略'])),
  };
}

export function normalizeTraderProposal(value: any) {
  return {
    action: normalizeEnum(pick(value, ['action', 'recommendation', '操作', '建议']), ACTION_MAP),
    reasoning: asString(pick(value, ['reasoning', 'rationale', '理由', '分析'])),
    entry_price: asOptionalNumber(pick(value, ['entry_price', 'entryPrice', 'entry', '入场价'])),
    stop_loss: asOptionalNumber(pick(value, ['stop_loss', 'stopLoss', 'stop', '止损'])),
    position_sizing: pick(value, ['position_sizing', 'positionSizing', 'sizing', '仓位'])
      ? asString(pick(value, ['position_sizing', 'positionSizing', 'sizing', '仓位']))
      : undefined,
  };
}

export function normalizePortfolioDecision(value: any) {
  return {
    rating: normalizeEnum(pick(value, ['rating', 'recommendation', '评级', '建议']), RATING_MAP),
    executive_summary: cleanDecisionText(pick(value, ['executive_summary', 'executiveSummary', 'summary', '摘要'])),
    investment_thesis: cleanDecisionText(pick(value, ['investment_thesis', 'investmentThesis', 'thesis', '投资论点'])),
    user_position_guidance: pick(value, ['user_position_guidance', 'userPositionGuidance', 'position_guidance', '持仓建议', '仓位建议'])
      ? cleanDecisionText(pick(value, ['user_position_guidance', 'userPositionGuidance', 'position_guidance', '持仓建议', '仓位建议']))
      : undefined,
    short_term_guidance: cleanDecisionText(pick(value, ['short_term_guidance', 'shortTermGuidance', 'short_term', '短期建议', '短期'])),
    medium_term_guidance: cleanDecisionText(pick(value, ['medium_term_guidance', 'mediumTermGuidance', 'medium_term', '中期建议', '中期'])),
    long_term_guidance: cleanDecisionText(pick(value, ['long_term_guidance', 'longTermGuidance', 'long_term', '长期建议', '长期'])),
    price_target: asOptionalNumber(pick(value, ['price_target', 'priceTarget', 'target', '目标价'])),
    time_horizon: pick(value, ['time_horizon', 'timeHorizon', 'horizon', '时间周期'])
      ? asString(pick(value, ['time_horizon', 'timeHorizon', 'horizon', '时间周期']))
      : undefined,
  };
}
