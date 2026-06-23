import fs from 'node:fs';
import path from 'node:path';
import { streamText } from 'ai';
import { getDeepThink, llmCallOptions } from "@/lib/ai";
import { languageInstruction } from '@/lib/language';
import type { Emit, RiskState, AnalystReports } from '@/workflows/types';
import type { TraderProposal } from '@/lib/schemas';

const promptText = fs.readFileSync(
  path.join(process.cwd(), 'data/prompts/neutral.md'),
  'utf8'
);

export async function neutralDebator({
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
    side: 'neutral',
    history: risk.neutral_history,
    round: risk.count + 1,
    status: 'running',
  });
  const start = Date.now();

  const traderText = `Action: **${trader.action}**\nReasoning: ${trader.reasoning}`;
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

**Aggressive:** ${risk.aggressive_history.split('\n').slice(-10).join('\n') || '(not yet)'}
**Conservative:** ${risk.conservative_history.split('\n').slice(-10).join('\n') || '(not yet)'}

Now deliver a concise balanced risk memo. This is a parallel committee round, so anticipate the likely aggressive and conservative objections yourself. Include:
- base-case probability balance
- conditions for adding vs trimming
- whether the trader's entry/stop/sizing are balanced enough`;

  try {
    const result = streamText({
      model: getDeepThink(),
      system: promptText + languageInstruction(),
      prompt,
      temperature: 0.5,
      ...llmCallOptions("stream"),
    });

    let text = '';
    const header = `**Neutral Analyst:** `;
    emit('debate-stream', { phase: 'risk', side: 'neutral', delta: header });
    for await (const delta of result.textStream) {
      text += delta;
      emit('debate-stream', { phase: 'risk', side: 'neutral', delta });
    }

    const argument = `${header}${text}`;
    const newRisk: RiskState = {
      history: (risk.history + '\n\n' + argument).trim(),
      aggressive_history: risk.aggressive_history,
      neutral_history: (risk.neutral_history + '\n\n' + argument).trim(),
      conservative_history: risk.conservative_history,
      count: risk.count + 1,
    };

    const elapsed = (Date.now() - start) / 1000;
    emit('debate', {
      phase: 'risk',
      side: 'neutral',
      history: newRisk.neutral_history,
      round: newRisk.count,
      status: 'done',
      elapsed,
    });
    return newRisk;
  } catch (e: any) {
    emit('error', { node: 'Neutral', message: e.message });
    emit('debate', { phase: 'risk', side: 'neutral', history: risk.neutral_history, status: 'error' });
    throw e;
  }
}
