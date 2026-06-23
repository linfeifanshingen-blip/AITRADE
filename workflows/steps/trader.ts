import fs from 'node:fs';
import path from 'node:path';
import { getQuickThink, llmCallOptions } from "@/lib/ai";
import { TraderProposalSchema, type TraderProposal, type ResearchPlan } from '@/lib/schemas';
import { generateStructuredObject, normalizeTraderProposal } from '@/lib/structured';
import { bilingualAction } from '@/lib/labels';
import { languageInstruction } from '@/lib/language';
import type { Emit, AnalystReports } from '@/workflows/types';

const promptText = fs.readFileSync(
  path.join(process.cwd(), 'data/prompts/trader.md'),
  'utf8'
);

export async function trader({
  ticker,
  date,
  reports,
  plan,
  emit,
}: {
  ticker: string;
  date: string;
  reports: AnalystReports;
  plan: ResearchPlan;
  emit: Emit;
}): Promise<TraderProposal> {
  emit('agent', { node: 'Trader', status: 'running' });
  const start = Date.now();

  const prompt = `Ticker: **${ticker}** as of **${date}**

## Research Manager's Investment Plan

Recommendation: **${plan.recommendation}**
Rationale: ${plan.rationale}
Strategic Actions: ${plan.strategic_actions}

## Supporting Reports (excerpts)

**Macro and Sector:**
${reports.macro_report.slice(0, 1200)}

**Market:**
${reports.market_report.slice(0, 1500)}

**Fundamentals:**
${reports.fundamentals_report.slice(0, 1500)}

**Intelligence Map:**
${reports.intelligence_report.slice(0, 1400)}

  Now produce your structured trader proposal.`;

  try {
    const object = await generateStructuredObject({
      model: getQuickThink(),
      system: promptText + languageInstruction(),
      prompt,
      schema: TraderProposalSchema,
      normalize: normalizeTraderProposal,
      name: 'TraderProposal',
      temperature: 0.3,
      ...llmCallOptions("stream"),
    });

    const elapsed = (Date.now() - start) / 1000;
    const reportMd = `**交易动作: ${bilingualAction(object.action)}**\n\n**理由:** ${object.reasoning}` +
      (object.entry_price != null ? `\n\n**入场价:** ${object.entry_price}` : '') +
      (object.stop_loss != null ? `\n**止损:** ${object.stop_loss}` : '') +
      (object.position_sizing ? `\n**仓位建议:** ${object.position_sizing}` : '');
    emit('agent', { node: 'Trader', status: 'done', report: reportMd, elapsed });
    return object;
  } catch (e: any) {
    emit('error', { node: 'Trader', message: e.message });
    emit('agent', { node: 'Trader', status: 'error', report: e.message });
    throw e;
  }
}
