import fs from 'node:fs';
import path from 'node:path';
import { streamText } from 'ai';
import { getDeepThink, llmCallOptions } from "@/lib/ai";
import { languageInstruction } from '@/lib/language';
import type { Emit, RiskState, AnalystReports } from '@/workflows/types';
import type { TraderProposal } from '@/lib/schemas';

const promptText = fs.readFileSync(
  path.join(process.cwd(), 'data/prompts/aggressive.md'),
  'utf8'
);

export async function aggressiveDebator({
  ticker,
  date,
  reports,
  trader,
  risk,
  emit,
}: {
  ticker: string;
  date: string;
  reports: AnalystReports;
  trader: TraderProposal;
  risk: RiskState;
  emit: Emit;
}): Promise<RiskState> {
  emit('debate', {
    phase: 'risk',
    side: 'aggressive',
    history: risk.aggressive_history,
    round: risk.count + 1,
    status: 'running',
  });
  const start = Date.now();

  const traderText = `Action: **${trader.action}**\nReasoning: ${trader.reasoning}` +
    (trader.entry_price != null ? `\nEntry: ${trader.entry_price}` : '') +
    (trader.stop_loss != null ? `\nStop-loss: ${trader.stop_loss}` : '');

  const prompt = `Ticker: **${ticker}** as of **${date}**

## Trader's decision

${traderText}

## Reports (key excerpts)

**Macro/Sector:** ${reports.macro_report.slice(0, 700)}
**Market:** ${reports.market_report.slice(0, 800)}
**Fundamentals:** ${reports.fundamentals_report.slice(0, 800)}
**Intelligence Map:** ${reports.intelligence_report.slice(0, 900)}

## Debate so far

${risk.history || '(open the debate)'}

## Last opposing arguments

**Conservative:** ${risk.conservative_history.split('\n').slice(-10).join('\n') || '(not yet)'}
**Neutral:** ${risk.neutral_history.split('\n').slice(-10).join('\n') || '(not yet)'}

Now deliver a concise high-conviction aggressive risk memo. This is a parallel committee round, so anticipate the likely neutral and conservative objections yourself. Include:
- upside path and asymmetric reward
- risk limits that still allow an aggressive stance
- whether the trader should increase, keep, or reduce the proposed sizing`;

  try {
    const result = streamText({
      model: getDeepThink(),
      system: promptText + languageInstruction(),
      prompt,
      temperature: 0.6,
      ...llmCallOptions("stream"),
    });

    let text = '';
    const header = `**Aggressive Analyst:** `;
    emit('debate-stream', { phase: 'risk', side: 'aggressive', delta: header });
    for await (const delta of result.textStream) {
      text += delta;
      emit('debate-stream', { phase: 'risk', side: 'aggressive', delta });
    }

    const argument = `${header}${text}`;
    const newRisk: RiskState = {
      history: (risk.history + '\n\n' + argument).trim(),
      aggressive_history: (risk.aggressive_history + '\n\n' + argument).trim(),
      neutral_history: risk.neutral_history,
      conservative_history: risk.conservative_history,
      count: risk.count + 1,
    };

    const elapsed = (Date.now() - start) / 1000;
    emit('debate', {
      phase: 'risk',
      side: 'aggressive',
      history: newRisk.aggressive_history,
      round: newRisk.count,
      status: 'done',
      elapsed,
    });
    return newRisk;
  } catch (e: any) {
    emit('error', { node: 'Aggressive', message: e.message });
    emit('debate', { phase: 'risk', side: 'aggressive', history: risk.aggressive_history, status: 'error' });
    throw e;
  }
}
