import fs from 'node:fs';
import path from 'node:path';
import { streamText } from 'ai';
import { getDeepThink, llmCallOptions } from "@/lib/ai";
import { languageInstruction } from '@/lib/language';
import type { Emit, RiskState, AnalystReports } from '@/workflows/types';
import type { TraderProposal } from '@/lib/schemas';

const promptText = fs.readFileSync(
  path.join(process.cwd(), 'data/prompts/conservative.md'),
  'utf8'
);

export async function conservativeDebator({
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
    side: 'conservative',
    history: risk.conservative_history,
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
**Neutral:** ${risk.neutral_history.split('\n').slice(-10).join('\n') || '(not yet)'}

Now deliver a concise conservative risk memo. This is a parallel committee round, so anticipate the likely aggressive and neutral objections yourself. Include:
- principal risks and downside path
- specific triggers for avoiding or reducing exposure
- whether the trader's entry/stop/sizing are protective enough`;

  try {
    const result = streamText({
      model: getDeepThink(),
      system: promptText + languageInstruction(),
      prompt,
      temperature: 0.5,
      ...llmCallOptions("stream"),
    });

    let text = '';
    const header = `**Conservative Analyst:** `;
    emit('debate-stream', { phase: 'risk', side: 'conservative', delta: header });
    for await (const delta of result.textStream) {
      text += delta;
      emit('debate-stream', { phase: 'risk', side: 'conservative', delta });
    }

    const argument = `${header}${text}`;
    const newRisk: RiskState = {
      history: (risk.history + '\n\n' + argument).trim(),
      aggressive_history: risk.aggressive_history,
      neutral_history: risk.neutral_history,
      conservative_history: (risk.conservative_history + '\n\n' + argument).trim(),
      count: risk.count + 1,
    };

    const elapsed = (Date.now() - start) / 1000;
    emit('debate', {
      phase: 'risk',
      side: 'conservative',
      history: newRisk.conservative_history,
      round: newRisk.count,
      status: 'done',
      elapsed,
    });
    return newRisk;
  } catch (e: any) {
    emit('error', { node: 'Conservative', message: e.message });
    emit('debate', { phase: 'risk', side: 'conservative', history: risk.conservative_history, status: 'error' });
    throw e;
  }
}
