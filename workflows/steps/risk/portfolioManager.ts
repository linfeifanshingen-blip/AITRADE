import fs from 'node:fs';
import path from 'node:path';
import { getQuickThink } from "@/lib/ai";
import { PortfolioDecisionSchema, type PortfolioDecision, type ResearchPlan, type TraderProposal } from '@/lib/schemas';
import { extractFirstJsonObject, generateStructuredObject, normalizePortfolioDecision } from '@/lib/structured';
import { bilingualAction, bilingualRatingForPosition } from '@/lib/labels';
import { languageInstruction } from '@/lib/language';
import type { Emit, AnalystReports, UserPositionContext } from '@/workflows/types';

const promptText = fs.readFileSync(
  path.join(process.cwd(), 'data/prompts/portfolioManager.md'),
  'utf8'
);

function cleanInlineText(text?: string) {
  return String(text || '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/[�]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeHtml(text?: string) {
  return cleanInlineText(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function describeUserContext(userContext?: UserPositionContext) {
  if (!userContext?.hasPosition) {
    return '提问人当前未持仓该标的，询问该标的的核心目的通常是判断是否适合建仓，以及在什么价格/催化剂/风险条件下建仓。本次结论必须用“适合建仓 / 可分批建仓 / 等待建仓 / 暂不建仓 / 不建议建仓”的语境回答，不能把建议写成“减持”或“卖出”。';
  }
  const averageCostText = userContext.averageCost != null ? `${userContext.averageCost}` : '未提供';
  return `提问人当前已持仓该标的，持仓均价为 ${averageCostText}。本次结论必须结合该成本，回答继续持有、加仓、减仓、止损/止盈或等待的条件。`;
}

function extractResponsesText(payload: any) {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  const chunks: string[] = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') chunks.push(content.text);
      if (typeof content?.value === 'string') chunks.push(content.value);
    }
  }
  return chunks.join('\n').trim();
}

async function generatePortfolioDecisionViaOpenAIResponses({
  system,
  prompt,
}: {
  system: string;
  prompt: string;
}): Promise<PortfolioDecision> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured for OpenAI Responses fallback');
  const baseURL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.OPENAI_DEEP_MODEL || process.env.OPENAI_MODEL || process.env.OPENAI_QUICK_MODEL || 'gpt-5.5';
  const response = await fetch(`${baseURL}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: system }],
        },
        {
          role: 'user',
          content: [{
            type: 'input_text',
            text: `${prompt}

Return ONLY one valid JSON object. Required keys:
rating, executive_summary, investment_thesis, user_position_guidance, short_term_guidance, medium_term_guidance, long_term_guidance, price_target, time_horizon.
rating must be one of: Buy, Overweight, Hold, Underweight, Sell.`,
          }],
        },
      ],
      text: { format: { type: 'json_object' } },
    }),
    signal: AbortSignal.timeout(Number(process.env.OPENAI_LLM_TIMEOUT_MS || process.env.LLM_TIMEOUT_MS || 240000)),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`OpenAI Responses fallback failed: HTTP ${response.status} ${body.slice(0, 400)}`);
  }

  const payload = await response.json();
  const text = extractResponsesText(payload);
  const raw = extractFirstJsonObject(text);
  const normalized = normalizePortfolioDecision(raw);
  const parsed = PortfolioDecisionSchema.safeParse(normalized);
  if (!parsed.success) {
    throw new Error(`OpenAI Responses fallback validation failed: ${parsed.error.message}`);
  }
  return parsed.data;
}

export async function portfolioManager({
  ticker,
  date,
  plan,
  trader,
  reports,
  riskHistory,
  userContext,
  pastContext,
  emit,
}: {
  ticker: string;
  date: string;
  plan: ResearchPlan;
  trader: TraderProposal;
  reports?: AnalystReports;
  riskHistory: string;
  userContext?: UserPositionContext;
  pastContext?: string;
  emit: Emit;
}): Promise<PortfolioDecision> {
  emit('agent', { node: 'Portfolio Manager', status: 'running' });
  const start = Date.now();

  const lessonsBlock = pastContext
    ? `\n\n## Lessons from Prior Decisions\n\n${pastContext}\n`
    : '';

  const prompt = `Ticker: **${ticker}** as of **${date}**

## Research Manager's Plan

Rating: **${plan.recommendation}**
Rationale: ${plan.rationale}
Strategic Actions: ${plan.strategic_actions}

## Trader's Proposal

Action: **${bilingualAction(trader.action)}**
Reasoning: ${trader.reasoning}
${trader.entry_price != null ? `Entry: ${trader.entry_price}\n` : ''}${trader.stop_loss != null ? `Stop-loss: ${trader.stop_loss}\n` : ''}${trader.position_sizing ? `Position sizing: ${trader.position_sizing}\n` : ''}
${lessonsBlock}
## Requester Position Context

${describeUserContext(userContext)}

## Analyst Report Reminders

${reports ? `Macro/Sector: ${reports.macro_report.slice(0, 1000)}

Market: ${reports.market_report.slice(0, 900)}

Fundamentals: ${reports.fundamentals_report.slice(0, 900)}

Intelligence Map: ${reports.intelligence_report.slice(0, 1200)}` : '(not provided)'}

## Risk Committee Debate

${riskHistory}

Now produce the structured Portfolio Manager decision.

Hard requirements:
- The final decision must explicitly reconcile the Trader's Proposal. If you follow it, say why. If you override it, say exactly which risk or evidence justifies the override.
- The investment_thesis must mention the trader action, entry/stop/position sizing when available, and connect it to the final rating.
- The investment_thesis must explicitly incorporate the macro/sector trend report. Explain whether the current macro environment and the ticker's sub-industry trend are a tailwind, headwind, or mixed setup for the final decision.
- Fill short_term_guidance, medium_term_guidance, and long_term_guidance. Use these default periods unless evidence suggests a better framing: short term = 0-4 weeks, medium term = 1-3 months, long term = 6-12 months. Each field must state the period, action stance, key trigger, and risk control.
- executive_summary must be 2-3 complete Chinese sentences. Do not end with a raw indicator fragment such as "RSI 76" or any unfinished clause.
- short_term_guidance, medium_term_guidance, long_term_guidance, executive_summary, and user_position_guidance must be plain Chinese prose only. Do not use markdown tables, pipe characters, broken bullets, JSON fragments, or stray symbols.
- The user_position_guidance field must explicitly incorporate Requester Position Context and begin with a direct answer to the user's real action question.
- If the requester does not hold shares, treat the decision as a new-entry decision. Translate rating semantics as: Buy = 适合建仓, Overweight = 可分批建仓, Hold = 等待建仓, Underweight = 暂不建仓, Sell = 不建议建仓. In Chinese prose, do not tell a no-position user to "减持" or "卖出"; instead explain whether to open a position now, wait, or avoid entry, with entry trigger, stop/risk limit, and first-position sizing when possible.
- If the requester holds shares, reference the average cost and explain whether to continue holding, add, trim, take profit, or stop-loss relative to that cost.
- Use English enum tokens only in the JSON rating field, but write executive_summary and investment_thesis in Chinese.`;

  try {
    let object: PortfolioDecision;
    try {
      object = await generateStructuredObject({
      model: getQuickThink(),
      system: promptText + languageInstruction(),
      prompt,
      schema: PortfolioDecisionSchema,
      normalize: normalizePortfolioDecision,
      name: 'PortfolioDecision',
      temperature: 0.3,
      });
    } catch (structuredError: any) {
      const message = structuredError?.message || String(structuredError);
      if (!/Failed to process successful response/i.test(message)) {
        throw structuredError;
      }
      emit('warn', { message: 'Portfolio Manager 的 SDK 解析响应失败，已切换到 OpenAI Responses 原生兜底。' });
      object = await generatePortfolioDecisionViaOpenAIResponses({
        system: promptText + languageInstruction(),
        prompt,
      });
    }

    const elapsed = (Date.now() - start) / 1000;
    const ratingText = bilingualRatingForPosition(object.rating, userContext?.hasPosition !== false);
    const reportMd = `<div class="pm-callout pm-callout-primary"><div class="pm-callout-title">最终评级</div><div class="pm-callout-value">${escapeHtml(ratingText)}</div><div>${escapeHtml(object.executive_summary)}</div></div>

## 投资论点

${object.investment_thesis}` +
      (object.user_position_guidance ? `\n\n<div class="pm-callout"><div class="pm-callout-title">结合你的持仓情况</div><div>${escapeHtml(object.user_position_guidance)}</div></div>` : '') +
      `\n\n## 时间维度建议\n\n<div class="pm-horizon-grid">` +
      (object.short_term_guidance ? `<div class="pm-horizon pm-horizon-short"><strong>短期（0-4周）</strong><br/>${escapeHtml(object.short_term_guidance)}</div>` : '') +
      (object.medium_term_guidance ? `<div class="pm-horizon pm-horizon-medium"><strong>中期（1-3个月）</strong><br/>${escapeHtml(object.medium_term_guidance)}</div>` : '') +
      (object.long_term_guidance ? `<div class="pm-horizon pm-horizon-long"><strong>长期（6-12个月）</strong><br/>${escapeHtml(object.long_term_guidance)}</div>` : '') +
      `</div>` +
      (object.price_target != null ? `\n\n**目标价:** ${object.price_target}` : '') +
      (object.time_horizon ? `\n\n**主要观察周期:** ${object.time_horizon}` : '');
    emit('agent', { node: 'Portfolio Manager', status: 'done', report: reportMd, elapsed });
    return object;
  } catch (e: any) {
    emit('error', { node: 'Portfolio Manager', message: e.message });
    emit('agent', { node: 'Portfolio Manager', status: 'error', report: e.message });
    throw e;
  }
}
