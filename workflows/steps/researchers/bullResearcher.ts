import fs from 'node:fs';
import path from 'node:path';
import { streamText } from 'ai';
import { getDeepThink, llmCallOptions } from "@/lib/ai";
import { languageInstruction } from '@/lib/language';
import type { Emit, DebateState, AnalystReports } from '@/workflows/types';

const promptText = fs.readFileSync(
  path.join(process.cwd(), 'data/prompts/bull.md'),
  'utf8'
);

export async function bullResearcher({
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
    side: 'bull',
    history: debate.bull_history,
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

**Last bear argument:**
${debate.bear_history.split('\n').slice(-15).join('\n') || '(no bear argument yet — open the debate)'}

Now deliver a high-density bull memo for a single-pass debate. Keep it concise but rigorous:
- 3 strongest bullish arguments grounded in the reports
- direct pre-buttal to the most likely bear objections
- concrete levels/catalysts that would confirm the bullish thesis
- conclude with how aggressive the trader should be`;

  try {
    const result = streamText({
      model: getDeepThink(),
      system: promptText + languageInstruction(),
      prompt,
      temperature: 0.6,
      ...llmCallOptions("stream"),
    });

    let text = '';
    const headerEmitted = `**Bull Analyst (round ${debate.count + 1}):** `;
    emit('debate-stream', { phase: 'research', side: 'bull', delta: headerEmitted });
    for await (const delta of result.textStream) {
      text += delta;
      emit('debate-stream', { phase: 'research', side: 'bull', delta });
    }

    const argument = `${headerEmitted}${text}`;
    const newDebate: DebateState = {
      history: (debate.history + '\n\n' + argument).trim(),
      bull_history: (debate.bull_history + '\n\n' + argument).trim(),
      bear_history: debate.bear_history,
      count: debate.count + 1,
    };

    const elapsed = (Date.now() - start) / 1000;
    emit('debate', {
      phase: 'research',
      side: 'bull',
      history: newDebate.bull_history,
      round: newDebate.count,
      status: 'done',
      elapsed,
    });
    return newDebate;
  } catch (e: any) {
    emit('error', { node: 'Bull Researcher', message: e.message });
    emit('debate', {
      phase: 'research',
      side: 'bull',
      history: debate.bull_history,
      status: 'error',
    });
    throw e;
  }
}
