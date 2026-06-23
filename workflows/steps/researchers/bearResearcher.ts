import fs from 'node:fs';
import path from 'node:path';
import { streamText } from 'ai';
import { getDeepThink, llmCallOptions } from "@/lib/ai";
import { languageInstruction } from '@/lib/language';
import type { Emit, DebateState, AnalystReports } from '@/workflows/types';

const promptText = fs.readFileSync(
  path.join(process.cwd(), 'data/prompts/bear.md'),
  'utf8'
);

export async function bearResearcher({
  ticker,
  date,
  reports,
  debate,
  emit,
}: {
  ticker: string;
  date: string;
  reports: AnalystReports;
  debate: DebateState;
  emit: Emit;
}): Promise<DebateState> {
  emit('debate', {
    phase: 'research',
    side: 'bear',
    history: debate.bear_history,
    round: debate.count + 1,
    status: 'running',
  });
  const start = Date.now();

  const prompt = `Ticker: **${ticker}** as of **${date}**

## Resources

**Macro and sector trend report:**
${reports.macro_report}

**Market research report:**
${reports.market_report}

**Integrated intelligence map (official facts, news, sector context, market discussion):**
${reports.intelligence_report}

**Company fundamentals report:**
${reports.fundamentals_report}

**Debate history so far:**
${debate.history || '(this is the first round)'}

**Last bull argument:**
${debate.bull_history.split('\n').slice(-15).join('\n') || '(no bull argument yet — open the rebuttal)'}

Now deliver a high-density bear memo for a single-pass debate. Keep it concise but rigorous:
- 3 strongest bearish arguments grounded in the reports
- direct pre-buttal to the most likely bull objections
- concrete levels/catalysts that would invalidate or intensify the bearish thesis
- conclude with how defensive the trader should be`;

  try {
    const result = streamText({
      model: getDeepThink(),
      system: promptText + languageInstruction(),
      prompt,
      temperature: 0.6,
      ...llmCallOptions("stream"),
    });

    let text = '';
    const headerEmitted = `**Bear Analyst (round ${debate.count + 1}):** `;
    emit('debate-stream', { phase: 'research', side: 'bear', delta: headerEmitted });
    for await (const delta of result.textStream) {
      text += delta;
      emit('debate-stream', { phase: 'research', side: 'bear', delta });
    }

    const argument = `${headerEmitted}${text}`;
    const newDebate: DebateState = {
      history: (debate.history + '\n\n' + argument).trim(),
      bull_history: debate.bull_history,
      bear_history: (debate.bear_history + '\n\n' + argument).trim(),
      count: debate.count + 1,
    };

    const elapsed = (Date.now() - start) / 1000;
    emit('debate', {
      phase: 'research',
      side: 'bear',
      history: newDebate.bear_history,
      round: newDebate.count,
      status: 'done',
      elapsed,
    });
    return newDebate;
  } catch (e: any) {
    emit('error', { node: 'Bear Researcher', message: e.message });
    emit('debate', {
      phase: 'research',
      side: 'bear',
      history: debate.bear_history,
      status: 'error',
    });
    throw e;
  }
}
