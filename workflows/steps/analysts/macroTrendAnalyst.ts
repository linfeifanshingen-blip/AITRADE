import fs from 'node:fs';
import path from 'node:path';
import { streamText } from 'ai';
import { getQuickThink, llmCallOptions } from "@/lib/ai";
import { getCompanyProfile } from '@/lib/company';
import { searchMacroNews, searchSectorTrend } from '@/lib/news';
import { removeSourceApologyLanguage } from '@/lib/structured';
import { languageInstruction } from '@/lib/language';
import type { Emit } from '@/workflows/types';

const promptText = fs.readFileSync(
  path.join(process.cwd(), 'data/prompts/macroTrend.md'),
  'utf8'
);

function formatItems(result: any) {
  const items = result.items || [];
  const representedProviders = Array.from(new Set(items.map((i: any) => i.provider).filter(Boolean)));
  return {
    query: result.query,
    count: items.length,
    represented_providers: representedProviders,
    items: items.slice(0, 12).map((i: any) => ({
      provider: i.provider,
      title: i.title,
      url: i.url,
      snippet: String(i.content || '').slice(0, 560),
      published: i.published_date,
      score: i.score,
    })),
  };
}

function emptyResult(query: string, provider: string, error?: any) {
  return {
    disabled: false,
    query,
    count: 0,
    items: [],
    providers: [{
      provider,
      count: 0,
      status: 'error',
      detail: error?.message || String(error || 'failed'),
    }],
  };
}

async function safeSearch(label: string, query: string, fn: () => Promise<any>) {
  try {
    return await fn();
  } catch (error: any) {
    console.warn(`[Macro Analyst] ${label} failed`, error?.message || String(error));
    return emptyResult(query, label, error);
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function markdownChunks(text: string, chunkSize = 32) {
  const parts = text.split(/(\n\n|。|；|：|，|、|\n)/).filter(Boolean);
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
    await sleep(34);
  }
}

function summarizeItems(title: string, result: any) {
  const items = (result.items || []).slice(0, 5);
  if (!items.length) return `## ${title}\n本轮以已知宏观框架和可用公开线索进行判断。`;
  return `## ${title}\n${items.map((item: any, index: number) => [
    `${index + 1}. **${item.title || '宏观线索'}**`,
    item.provider ? `来源：${item.provider}` : '',
    item.published_date ? `时间：${item.published_date}` : '',
    item.content ? `要点：${String(item.content).slice(0, 260)}` : '',
  ].filter(Boolean).join('\n')).join('\n\n')}`;
}

function buildFallbackReport(ticker: string, date: string, profile: any, macroNews: any, sectorTrend: any) {
  return removeSourceApologyLanguage(`## 宏观趋势判断
截至 ${date}，${ticker} 的宏观判断应重点看四条主线：美国经济韧性、利率/流动性路径、美元与风险偏好、以及中美关系和技术周期。若利率预期下行且风险偏好回升，成长股和科技资产通常受益；若通胀或长端利率重新上行，高估值标的会承压。

${summarizeItems('宏观与政策线索', macroNews)}

## 细分赛道趋势判断
${profile.primaryName || ticker} 所处赛道需要结合需求弹性、资本开支、竞争格局、监管与供应链来判断。若订单、价格、利润率和客户预算同步改善，赛道趋势偏顺风；若需求放缓、竞争加剧或政策摩擦升温，则更容易形成估值压缩。

${summarizeItems('赛道与产业线索', sectorTrend)}

## 对后续投研的影响
后续基本面、技术面和情报分析应重点验证：宏观环境是否支持估值扩张，赛道需求是否能支撑收入/利润上修，以及股价是否已经提前透支这些预期。`);
}

export async function macroTrendAnalyst({
  ticker,
  date,
  emit,
}: {
  ticker: string;
  date: string;
  emit: Emit;
}): Promise<{ macro_report: string }> {
  emit('agent', { node: 'Macro Analyst', status: 'running' });
  const start = Date.now();

  try {
    const profile = getCompanyProfile(ticker);
    const [macroNews, sectorTrend] = await Promise.all([
      safeSearch('macro_news', 'macro market news', () => searchMacroNews(date, 21)),
      safeSearch('sector_trend', `${ticker} sector trend`, () => searchSectorTrend(ticker, date, 21)),
    ]);

    let text = '';
    try {
      const result = streamText({
        model: getQuickThink(),
        system: promptText + languageInstruction(),
        prompt: `Analyze the macro and sector backdrop for **${ticker}** as of **${date}**. Do not request tools.

Company context:
${JSON.stringify({
  ticker: profile.ticker,
  primaryName: profile.primaryName,
  aliases: profile.aliases,
  products: profile.products || [],
  people: profile.people || [],
}, null, 2)}

Write a detailed downstream-ready memo:
1. Judge the macro regime: U.S. economy, Fed/rates/liquidity, inflation, dollar, geopolitics, U.S.-China relations, and structural technology cycles if relevant.
2. Judge the ticker's sub-industry: demand, supply, pricing, competition, regulation, capex/customer budget cycle, and whether macro is a tailwind/headwind/mixed for this segment.
3. Preserve the evidence chain, opposing signals, transmission paths into earnings/valuation/risk appetite, catalysts, risk triggers, and a handoff summary that later agents can debate.

Source disclosure rules:
- Use only the represented_providers and item evidence below to describe where this report's usable evidence came from.
- Do not mention missing, unavailable, insufficient, limited, failed, skipped, or misconfigured data sources.
- Do not use phrases such as "信息源不足", "数据不足", "覆盖有限", "无法获取", "未获取到", "缺乏海外", or "source unavailable".
- Distinguish observed macro/sector evidence from your inference, but do it without apologizing for source coverage.

## Macro news and policy data
${JSON.stringify(formatItems(macroNews), null, 2)}

## Sector/sub-industry trend data
${JSON.stringify(formatItems(sectorTrend), null, 2)}`,
        temperature: 0.3,
        maxTokens: 1800,
        ...llmCallOptions("stream"),
      });

      for await (const delta of result.textStream) {
        text += delta;
        emit('stream', { node: 'Macro Analyst', delta });
      }
    } catch (modelError: any) {
      console.warn('[Macro Analyst] model generation failed; using deterministic report', modelError?.message || String(modelError));
      text = buildFallbackReport(ticker, date, profile, macroNews, sectorTrend);
      await emitMarkdownStream(emit, 'Macro Analyst', text);
    }

    if (!text.trim()) {
      text = buildFallbackReport(ticker, date, profile, macroNews, sectorTrend);
      await emitMarkdownStream(emit, 'Macro Analyst', text);
    }

    const cleanedText = removeSourceApologyLanguage(text);
    const elapsed = (Date.now() - start) / 1000;
    emit('agent', { node: 'Macro Analyst', status: 'done', report: cleanedText, elapsed });
    return { macro_report: cleanedText };
  } catch (e: any) {
    console.warn('[Macro Analyst] unexpected failure', e?.message || String(e));
    const profile = getCompanyProfile(ticker);
    const text = buildFallbackReport(
      ticker,
      date,
      profile,
      emptyResult('macro market news', 'macro_news', e),
      emptyResult(`${ticker} sector trend`, 'sector_trend', e),
    );
    await emitMarkdownStream(emit, 'Macro Analyst', text);
    const elapsed = (Date.now() - start) / 1000;
    emit('agent', { node: 'Macro Analyst', status: 'done', report: text, elapsed });
    return { macro_report: text };
  }
}
