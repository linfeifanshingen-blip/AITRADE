import fs from 'node:fs';
import path from 'node:path';
import { getQuickThink } from "@/lib/ai";
import { ResearchPlanSchema, type ResearchPlan } from '@/lib/schemas';
import { generateStructuredObject, normalizeResearchPlan } from '@/lib/structured';
import { bilingualRating } from '@/lib/labels';
import { languageInstruction } from '@/lib/language';
import type { Emit } from '@/workflows/types';

const promptText = fs.readFileSync(
  path.join(process.cwd(), 'data/prompts/researchManager.md'),
  'utf8'
);

export async function researchManager({
  ticker,
  date,
  history,
  emit,
}: {
  ticker: string;
  date: string;
  history: string;
  emit: Emit;
}): Promise<ResearchPlan> {
  emit('agent', { node: 'Research Manager', status: 'running' });
  const start = Date.now();

  const prompt = `Ticker: **${ticker}** as of **${date}**

## Bull/Bear Debate History

${history}

  Now deliver your structured investment plan.`;

  try {
    const object = await generateStructuredObject({
      model: getQuickThink(),
      system: promptText + languageInstruction(),
      prompt,
      schema: ResearchPlanSchema,
      normalize: normalizeResearchPlan,
      name: 'ResearchPlan',
      temperature: 0.3,
    });

    const elapsed = (Date.now() - start) / 1000;
    const reportMd = `**研究结论: ${bilingualRating(object.recommendation)}**\n\n**理由:** ${object.rationale}\n\n**策略动作:** ${object.strategic_actions}`;
    emit('agent', {
      node: 'Research Manager',
      status: 'done',
      report: reportMd,
      elapsed,
    });
    return object;
  } catch (e: any) {
    emit('error', { node: 'Research Manager', message: e.message });
    emit('agent', { node: 'Research Manager', status: 'error', report: e.message });
    throw e;
  }
}
