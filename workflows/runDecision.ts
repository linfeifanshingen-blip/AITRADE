/**
 * Main workflow: orchestrates the 11 agents and emits SSE events.
 *
 * Full pipeline:
 *   Phase 2: 4 analysts (concurrency-limited)
 *   Phase 3: bull/bear debate → Research Manager
 *   Phase 4: Trader → Risk Committee (3-way debate) → Portfolio Manager
 */

import { marketAnalyst } from './steps/analysts/marketAnalyst';
import { macroTrendAnalyst } from './steps/analysts/macroTrendAnalyst';
import { intelligenceAnalyst } from './steps/analysts/intelligenceAnalyst';
import { fundamentalsAnalyst } from './steps/analysts/fundamentalsAnalyst';
import { bullResearcher } from './steps/researchers/bullResearcher';
import { bearResearcher } from './steps/researchers/bearResearcher';
import { researchManager } from './steps/researchers/researchManager';
import { trader } from './steps/trader';
import { aggressiveDebator } from './steps/risk/aggressiveDebator';
import { neutralDebator } from './steps/risk/neutralDebator';
import { conservativeDebator } from './steps/risk/conservativeDebator';
import { portfolioManager } from './steps/risk/portfolioManager';
import type { Emit, RunState, UserPositionContext } from './types';
import { kvSet, kvZAdd, KV_KEYS } from '@/lib/kv';
import { ratingLabelForPosition } from '@/lib/labels';
import { currentModelProvider, withModelProvider, type ModelProvider } from '@/lib/ai';

const MAX_DEBATE_ROUNDS = Number(process.env.MAX_DEBATE_ROUNDS ?? 1);
const MAX_RISK_ROUNDS = Number(process.env.MAX_RISK_ROUNDS ?? 1);
const REPORT_CONTEXT_CHARS = Number(process.env.REPORT_CONTEXT_CHARS ?? 5600);

/**
 * Smart report truncation: keep head + tail, but try to preserve
 * paragraph boundaries so the conclusion isn't mid-sentence.
 * Also reserves at least 30% of budget for the tail where
 * the rating + investment thesis usually live.
 */
function unwrapSettled<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === 'fulfilled' ? result.value : null;
}

function compactReport(text: string, maxChars = REPORT_CONTEXT_CHARS) {
  if (!text || text.length <= maxChars) return text || '';
  const paragraphs = text.split(/\n{2,}/);
  if (paragraphs.length <= 2) {
    const head = Math.floor(maxChars * 0.65);
    const tail = maxChars - head;
    return `${text.slice(0, head)}\n\n...[中间内容已压缩以加速推理]...\n\n${text.slice(-tail)}`;
  }
  const headBudget = Math.floor(maxChars * 0.65);
  const headParts: string[] = [];
  let idx = 0;
  for (; idx < paragraphs.length; idx++) {
    const para = paragraphs[idx];
    const joined = headParts.join('\n\n');
    const candidate = joined ? joined.length + 2 + para.length : para.length;
    if (candidate <= headBudget) {
      headParts.push(para);
    } else {
      break;
    }
  }
  const tailParts: string[] = [];
  const tailBudget = maxChars - (headParts.join('\n\n').length || 0);
  for (let tailIdx = paragraphs.length - 1; tailIdx > idx; tailIdx--) {
    const para = paragraphs[tailIdx];
    const joined = tailParts.join('\n\n');
    const candidate = joined ? joined.length + 2 + para.length : para.length;
    if (candidate <= tailBudget) {
      tailParts.unshift(para);
    } else {
      break;
    }
  }
  const skipped = paragraphs.length - headParts.length - tailParts.length;
  const parts = [...headParts];
  if (skipped > 0) {
    parts.push(`\n...[中间 ${skipped} 段已压缩，共 ${text.length} 字符]...\n`);
  }
  parts.push(...tailParts);
  return parts.join('\n\n');
}

function modelStrategy(selected?: ModelProvider) {
  const provider = selected || currentModelProvider();
  return {
    selected: provider,
    pipelineProvider: provider,
    judgeProvider: provider,
    finalProvider: provider,
    pipelineChain: [provider],
    judgeChain: [provider],
    finalChain: [provider],
    isHybrid: false,
  };
}

async function withProviderChain<T>({
  providers,
  label,
  emit,
  fn,
}: {
  providers: ModelProvider[];
  label: string;
  emit: Emit;
  fn: () => Promise<T>;
}) {
  let lastError: any;
  const uniqueProviders = Array.from(new Set(providers));
  for (let i = 0; i < uniqueProviders.length; i += 1) {
    const provider = uniqueProviders[i];
    try {
      return await withModelProvider(provider, fn);
    } catch (error: any) {
      lastError = error;
      const nextProvider = uniqueProviders[i + 1];
      if (nextProvider) {
        emit('warn', { message: `${label} 使用 ${provider} 失败，已自动切换到 ${nextProvider} 继续。` });
      }
    }
  }
  throw lastError;
}

export async function runDecision({
  runId,
  ticker,
  date,
  userContext,
  modelProvider,
  modelTier,
  emit,
}: {
  runId: string;
  ticker: string;
  date: string;
  userContext?: UserPositionContext;
  modelProvider?: ModelProvider;
  modelTier?: 'quick' | 'deep' | null;
  emit: Emit;
}): Promise<RunState> {
  return withModelProvider(modelProvider, async () => {
    const startedAt = Date.now();
    const selectedProvider = currentModelProvider();
    const strategy = modelStrategy(selectedProvider);
    emit('started', {
      runId,
      ticker,
      date,
      userContext,
      modelProvider: selectedProvider,
      modelStrategy: strategy.isHybrid
        ? { mode: 'smart-mix', pipelineChain: strategy.pipelineChain, finalChain: strategy.finalChain }
        : { mode: 'single-provider', provider: strategy.selected },
    });

    const state: RunState = { runId, ticker, date, userContext, modelProvider: selectedProvider, startedAt };

    // ------- Phase 2: 4 analysts (concurrency-limited) -------
    // Kimi free tier caps org concurrency at 3 — run in batches of 2 so heaviest
    // (Market + Fundamentals) don't both compete with the news/social pair.
    const providerForConcurrency = strategy.pipelineProvider;
    const providerConcurrency = process.env[`${providerForConcurrency.toUpperCase()}_LLM_CONCURRENCY`];
    const defaultConcurrency = 4;
    const concurrency = Number(providerConcurrency ?? process.env.LLM_CONCURRENCY ?? defaultConcurrency);
    const runPipeline = <T,>(label: string, fn: () => Promise<T>) => withProviderChain({
      providers: strategy.pipelineChain,
      label,
      emit,
      fn,
    });
    const tasks = [
      () => runPipeline('Macro Analyst', () => macroTrendAnalyst({ ticker, date, emit }))
        .then(r => { state.macro_report = r.macro_report; })
        .catch(e => { state.macro_report = `[Macro Analyst failed] ${e.message}`;
          emit('agent', { node: 'Macro Analyst', status: 'error', report: e.message }); }),
      () => runPipeline('Market Analyst', () => marketAnalyst({ ticker, date, emit }))
        .then(r => { state.market_report = r.market_report; })
        .catch(e => { state.market_report = `[Market Analyst failed] ${e.message}`;
          emit('agent', { node: 'Market Analyst', status: 'error', report: e.message }); }),
      () => runPipeline('Fundamentals Analyst', () => fundamentalsAnalyst({ ticker, date, emit }))
        .then(r => { state.fundamentals_report = r.fundamentals_report; })
        .catch(e => { state.fundamentals_report = `[Fundamentals Analyst failed] ${e.message}`;
          emit('agent', { node: 'Fundamentals Analyst', status: 'error', report: e.message }); }),
      () => runPipeline('Intelligence Analyst', () => intelligenceAnalyst({ ticker, date, emit }))
        .then(r => { state.intelligence_report = r.intelligence_report; })
        .catch(e => { state.intelligence_report = `[Intelligence Analyst failed] ${e.message}`;
          emit('agent', { node: 'Intelligence Analyst', status: 'error', report: e.message }); }),
    ];

    let idx = 0;
    const workers = Array.from({ length: concurrency }, async () => {
      while (true) {
        const i = idx++;
        if (i >= tasks.length) return;
        await tasks[i]();
      }
    });
    await Promise.all(workers);

    // ------- Phase 3: Bull/Bear debate + Research Manager -------
    const reports = {
      macro_report: state.macro_report || '',
      market_report: state.market_report || '',
      intelligence_report: state.intelligence_report || '',
      fundamentals_report: state.fundamentals_report || '',
    };
    const compactReports = {
      macro_report: compactReport(reports.macro_report),
      market_report: compactReport(reports.market_report),
      intelligence_report: compactReport(reports.intelligence_report),
      fundamentals_report: compactReport(reports.fundamentals_report),
    };
    let debateState = { bull_history: '', bear_history: '', history: '', count: 0 };
    if (MAX_DEBATE_ROUNDS <= 1) {
      const [bullResult, bearResult] = await Promise.allSettled([
        runPipeline('Bull Researcher', () => bullResearcher({ ticker, date, reports: compactReports, debate: debateState, emit })),
        runPipeline('Bear Researcher', () => bearResearcher({ ticker, date, reports: compactReports, debate: debateState, emit })),
      ]);
      const [bullOk, bearOk] = [bullResult, bearResult].map(unwrapSettled);
      if (bullResult.status === 'rejected') {
        emit('error', { node: 'Bull Researcher', message: (bullResult.reason as Error)?.message || String(bullResult.reason) });
        emit('debate', { phase: 'research', side: 'bull', history: '', status: 'error' });
      }
      if (bearResult.status === 'rejected') {
        emit('error', { node: 'Bear Researcher', message: (bearResult.reason as Error)?.message || String(bearResult.reason) });
        emit('debate', { phase: 'research', side: 'bear', history: '', status: 'error' });
      }
      debateState = {
        bull_history: bullOk?.bull_history || '',
        bear_history: bearOk?.bear_history || '',
        history: [bullOk?.bull_history, bearOk?.bear_history].filter(Boolean).join('\n\n'),
        count: 1,
      };
    } else {
      for (let round = 0; round < MAX_DEBATE_ROUNDS; round++) {
        try {
          debateState = await runPipeline('Bull Researcher', () => bullResearcher({ ticker, date, reports: compactReports, debate: debateState, emit }));
        } catch (e: any) {
          emit('error', { node: 'Bull Researcher', message: e.message });
          emit('debate', { phase: 'research', side: 'bull', history: debateState.bull_history, status: 'error' });
        }
        try {
          debateState = await runPipeline('Bear Researcher', () => bearResearcher({ ticker, date, reports: compactReports, debate: debateState, emit }));
        } catch (e: any) {
          emit('error', { node: 'Bear Researcher', message: e.message });
          emit('debate', { phase: 'research', side: 'bear', history: debateState.bear_history, status: 'error' });
        }
      }
    }
    state.investment_debate = {
      bull_history: debateState.bull_history,
      bear_history: debateState.bear_history,
      count: debateState.count,
    };

    const plan = await withProviderChain({
      providers: strategy.judgeChain,
      label: 'Research Manager',
      emit,
      fn: () => researchManager({ ticker, date, history: debateState.history, emit }),
    });
    state.research_plan = plan;

    // ------- Phase 4: Trader + Risk Committee + Portfolio Manager -------
    const traderPlan = await runPipeline('Trader', () => trader({ ticker, date, reports: compactReports, plan, emit }));
    state.trader_plan = traderPlan;

    let riskState = {
      aggressive_history: '', neutral_history: '', conservative_history: '',
      history: '', count: 0,
    };
    if (MAX_RISK_ROUNDS <= 1) {
      const riskResults = await Promise.allSettled([
        runPipeline('Aggressive Risk', () => aggressiveDebator({ ticker, date, reports: compactReports, trader: traderPlan, risk: riskState, emit })),
        runPipeline('Neutral Risk', () => neutralDebator({ ticker, date, reports: compactReports, trader: traderPlan, risk: riskState, emit })),
        runPipeline('Conservative Risk', () => conservativeDebator({ ticker, date, reports: compactReports, trader: traderPlan, risk: riskState, emit })),
      ]);
      const [aggOk, neuOk, conOk] = riskResults.map(unwrapSettled);
      const [aggRes, neuRes, conRes] = riskResults;
      if (aggRes.status === 'rejected') {
        emit('error', { node: 'Aggressive Risk', message: (aggRes.reason as Error)?.message || String(aggRes.reason) });
        emit('debate', { phase: 'risk', side: 'aggressive', history: '', status: 'error' });
      }
      if (neuRes.status === 'rejected') {
        emit('error', { node: 'Neutral Risk', message: (neuRes.reason as Error)?.message || String(neuRes.reason) });
        emit('debate', { phase: 'risk', side: 'neutral', history: '', status: 'error' });
      }
      if (conRes.status === 'rejected') {
        emit('error', { node: 'Conservative Risk', message: (conRes.reason as Error)?.message || String(conRes.reason) });
        emit('debate', { phase: 'risk', side: 'conservative', history: '', status: 'error' });
      }
      riskState = {
        aggressive_history: aggOk?.aggressive_history || '',
        neutral_history: neuOk?.neutral_history || '',
        conservative_history: conOk?.conservative_history || '',
        history: [
          aggOk?.aggressive_history,
          neuOk?.neutral_history,
          conOk?.conservative_history,
        ].filter(Boolean).join('\n\n'),
        count: 1,
      };
    } else {
      for (let round = 0; round < MAX_RISK_ROUNDS; round++) {
        riskState = await runPipeline('Aggressive Risk', () => aggressiveDebator({ ticker, date, reports: compactReports, trader: traderPlan, risk: riskState, emit }));
        riskState = await runPipeline('Neutral Risk', () => neutralDebator({ ticker, date, reports: compactReports, trader: traderPlan, risk: riskState, emit }));
        riskState = await runPipeline('Conservative Risk', () => conservativeDebator({ ticker, date, reports: compactReports, trader: traderPlan, risk: riskState, emit }));
      }
    }
    state.risk_debate = {
      aggressive_history: riskState.aggressive_history,
      neutral_history: riskState.neutral_history,
      conservative_history: riskState.conservative_history,
      count: riskState.count,
    };

    const finalDecision = await withProviderChain({
      providers: strategy.finalChain,
      label: 'Portfolio Manager',
      emit,
      fn: () => portfolioManager({
        ticker, date, plan, trader: traderPlan, reports: compactReports,
        riskHistory: riskState.history, userContext, emit,
      }),
    });
    state.final_decision = finalDecision;

    // Phase 3+4: full code now live (dead TODO comments removed)

    // Compute duration BEFORE emitting complete (was used before defined — ReferenceError)
    const duration = (Date.now() - startedAt) / 1000;

    // Emit final decision
    const decisionStub = finalDecision.rating;
    emit('complete', {
      decision: decisionStub,
      decision_label: ratingLabelForPosition(decisionStub, userContext?.hasPosition !== false),
      final_decision: finalDecision,
      user_context: userContext,
      runId,
      duration,
    });

    // Persist run — best-effort: log warning but don't fail the run
    try {
      await kvSet(KV_KEYS.run(runId), state);
      await kvZAdd(KV_KEYS.runsIndex, startedAt, runId);
      await kvZAdd(KV_KEYS.runsByTicker(ticker), startedAt, runId);
    } catch (e) {
      const msg = (e as Error).message;
      emit('warn', { message: `KV persist failed: ${msg}` });
      // P1 FIX: also emit as 'error' so the UI shows it prominently
      emit('error', { node: 'KV', message: `运行记录保存失败，结果将不会出现在历史页面: ${msg}` });
    }

    state.duration_seconds = duration;
    state.finishedAt = Date.now();

    return state;
  }, modelTier);
}
