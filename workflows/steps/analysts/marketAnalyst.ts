import fs from 'node:fs';
import path from 'node:path';
import { streamText } from 'ai';
import { getQuickThink, llmCallOptions } from "@/lib/ai";
import { getStockPrices, getIndicator, type IndicatorName } from '@/lib/prices';
import { languageInstruction } from '@/lib/language';
import type { Emit } from '@/workflows/types';

const promptText = fs.readFileSync(
  path.join(process.cwd(), 'data/prompts/market.md'),
  'utf8'
);

const INDICATORS: IndicatorName[] = [
  '50_SMA', '200_SMA', '10_EMA', 'MACD', 'RSI',
  'BB_upper', 'BB_middle', 'BB_lower', 'ATR', 'VWMA',
];

function fmt(value: any, digits = 2) {
  const n = typeof value === 'number' ? value : null;
  return n != null && Number.isFinite(n) ? n.toFixed(digits) : '暂无';
}

function fmtPct(value: any) {
  const n = typeof value === 'number' ? value : null;
  return n != null && Number.isFinite(n) ? `${n.toFixed(2)}%` : '暂无';
}

function indicatorLatest(indicators: any[], name: IndicatorName) {
  return indicators.find(item => item.indicator === name)?.latest?.value ?? null;
}

function buildFallbackReport({
  ticker,
  date,
  bars,
  indicators,
  dataError,
}: {
  ticker: string;
  date: string;
  bars: any[];
  indicators: any[];
  dataError?: string | null;
}) {
  const latest = bars[bars.length - 1];
  const previous = bars[bars.length - 2];
  const closes = bars.map(b => b.close).filter((n: any) => typeof n === 'number');
  const recentHigh = closes.length ? Math.max(...closes.slice(-20)) : null;
  const recentLow = closes.length ? Math.min(...closes.slice(-20)) : null;
  const changePct = latest?.close != null && previous?.close
    ? ((latest.close - previous.close) / previous.close) * 100
    : null;
  const sma50 = indicatorLatest(indicators, '50_SMA');
  const sma200 = indicatorLatest(indicators, '200_SMA');
  const rsi = indicatorLatest(indicators, 'RSI');
  const macd = indicatorLatest(indicators, 'MACD');
  const atr = indicatorLatest(indicators, 'ATR');
  const bbUpper = indicatorLatest(indicators, 'BB_upper');
  const bbLower = indicatorLatest(indicators, 'BB_lower');

  const trend = latest?.close != null && sma50 != null && sma200 != null
    ? latest.close > sma50 && sma50 > sma200
      ? '多头趋势占优，价格位于 50 日均线上方，且中期均线结构偏强。'
      : latest.close < sma50 && sma50 < sma200
        ? '空头趋势占优，价格低于 50 日均线，且中期均线结构偏弱。'
        : '趋势结构处于混合状态，需要结合量能和关键价位确认。'
    : '趋势判断以最近价格区间和可用指标为主。';

  const momentum = rsi != null
    ? rsi >= 70
      ? 'RSI 处于偏热区间，短线追高需要更严格的回撤纪律。'
      : rsi <= 30
        ? 'RSI 处于偏冷区间，存在技术修复可能，但仍需等待价格确认。'
        : 'RSI 位于中性区间，动能没有极端过热或过冷。'
    : '动能指标暂以价格行为交叉验证。';

  return `## 技术面结论
${ticker} 截至 ${date} 的技术面以最近 ${bars.length} 条日线和本地计算指标为依据。最新收盘价：${fmt(latest?.close)}；单日变化：${fmtPct(changePct)}。${trend}

## 趋势与均线
50 日均线：${fmt(sma50)}；200 日均线：${fmt(sma200)}；MACD：${fmt(macd)}。若价格继续站稳 50 日均线并保持高低点上移，趋势延续概率更高；若跌破 50 日均线并放量，则需要降低短线假设。

## 动能与波动
RSI：${fmt(rsi)}；ATR：${fmt(atr)}；布林上轨：${fmt(bbUpper)}；布林下轨：${fmt(bbLower)}。${momentum}

## 支撑与阻力
近 20 日观察阻力：${fmt(recentHigh)}；近 20 日观察支撑：${fmt(recentLow)}。有效突破阻力通常需要成交量或消息面配合；跌破支撑则说明短线风险重新占优。

## 交易含义
短线不宜只凭单一指标行动。若价格在关键支撑上方企稳，可考虑分批观察；若价格远离均线且 RSI 偏热，应等待回撤或新的催化确认。止损应围绕近端支撑、ATR 波动和仓位大小设置。
${dataError ? `\n## 数据记录\n行情源记录：${dataError}` : ''}`;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function markdownChunks(text: string, chunkSize = 56) {
  const parts = text.split(/(\n\n|。|；|：|，|\n)/).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  for (const part of parts) {
    if (current && current.length + part.length > chunkSize) {
      chunks.push(current);
      current = part;
    } else {
      current += part;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function emitMarkdownStream(emit: Emit, node: string, text: string) {
  for (const chunk of markdownChunks(text)) {
    emit('stream', { node, delta: chunk });
    await sleep(18);
  }
}

export async function marketAnalyst({
  ticker,
  date,
  emit,
}: {
  ticker: string;
  date: string;
  emit: Emit;
}): Promise<{ market_report: string }> {
  emit('agent', { node: 'Market Analyst', status: 'running' });
  const start = Date.now();

  const lookbackStart = new Date(new Date(date).getTime() - 180 * 86400000)
    .toISOString().slice(0, 10);

  try {
    const barsResult = await getStockPrices(ticker, lookbackStart, date)
      .then(bars => ({ bars, error: null as string | null }))
      .catch(e => ({ bars: [], error: e?.message || String(e) }));
    const indicatorResults = barsResult.bars.length
      ? await Promise.allSettled(INDICATORS.map(indicator => getIndicator(ticker, indicator, date, 30)))
      : [];

    const trimmedBars = barsResult.bars.slice(-90);
    const indicators = indicatorResults.map((r, i) => {
      if (r.status === 'fulfilled') {
        return {
          indicator: r.value.indicator,
          latest: r.value.values[r.value.values.length - 1],
          series: r.value.values.slice(-16),
        };
      }
      return { indicator: INDICATORS[i], error: r.reason?.message || 'indicator failed' };
    });

    let text = '';
    try {
      const result = streamText({
        model: getQuickThink(),
        system: promptText + languageInstruction(),
        prompt: `Analyze ticker **${ticker}** as of **${date}** using the pre-fetched market data below. Do not request tools.

Write a detailed downstream-ready markdown memo and end with a compact summary table. Focus on trend, momentum, volatility, volume confirmation, key support/resistance, invalidation points, scenario triggers, and trading implications.
Preserve enough technical evidence for later agents to debate what is confirmed versus what is merely a setup.
If price data is unavailable, clearly state the data-source limitation and avoid inventing price levels.

## Price data
${JSON.stringify({
  symbol: ticker,
  data_error: barsResult.error,
  count: trimmedBars.length,
  latest: trimmedBars[trimmedBars.length - 1],
  series: trimmedBars.map(b => ({
    date: b.date,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
  })),
}, null, 2)}

## Technical indicators
${JSON.stringify(indicators, null, 2)}`,
        temperature: 0.3,
        maxTokens: 1800,
        ...llmCallOptions("stream"),
      });

      for await (const delta of result.textStream) {
        text += delta;
        emit('stream', { node: 'Market Analyst', delta });
      }
    } catch (modelError: any) {
      console.warn('[Market Analyst] model generation failed; using deterministic report', modelError?.message || String(modelError));
      text = buildFallbackReport({
        ticker,
        date,
        bars: trimmedBars,
        indicators,
        dataError: barsResult.error,
      });
      await emitMarkdownStream(emit, 'Market Analyst', text);
    }

    if (!text.trim()) {
      text = buildFallbackReport({
        ticker,
        date,
        bars: trimmedBars,
        indicators,
        dataError: barsResult.error,
      });
      await emitMarkdownStream(emit, 'Market Analyst', text);
    }

    const elapsed = (Date.now() - start) / 1000;
    emit('agent', { node: 'Market Analyst', status: 'done', report: text, elapsed });
    return { market_report: text };
  } catch (e: any) {
    console.warn('[Market Analyst] unexpected failure', e?.message || String(e));
    const text = `## 技术面结论\n${ticker} 的技术分析在本轮运行中遇到异常，但不会中断整体投研流程。后续研究主管应更多参考宏观、情报和基本面，并等待下一轮行情数据确认。\n\n## 交易含义\n在技术面暂不可用时，不建议仅凭价格直觉追涨杀跌；应等待价格重新回到可观察的支撑、阻力和成交量结构后再决策。`;
    await emitMarkdownStream(emit, 'Market Analyst', text);
    const elapsed = (Date.now() - start) / 1000;
    emit('agent', { node: 'Market Analyst', status: 'done', report: text, elapsed });
    return { market_report: text };
  }
}
