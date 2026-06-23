import fs from 'node:fs';
import path from 'node:path';
import { streamText } from 'ai';
import { getQuickThink, llmCallOptions } from '@/lib/ai';
import { languageInstruction } from '@/lib/language';
import { searchCompanyNews, searchFundamentalResearch, searchKolX, searchMacroNews, searchSocial } from '@/lib/news';
import { removeSourceApologyLanguage } from '@/lib/structured';
import type { Emit } from '@/workflows/types';

const promptText = fs.readFileSync(
  path.join(process.cwd(), 'data/prompts/intelligence.md'),
  'utf8'
);

function emptyResult(query: string, label: string, error?: any) {
  return {
    disabled: false,
    query,
    count: 0,
    items: [],
    providers: [{
      provider: label,
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
    console.warn(`[Intelligence Analyst] ${label} failed`, error?.message || String(error));
    return emptyResult(query, label, error);
  }
}

function summarizeForFallback(section: string, result: any) {
  const items = (result.items || []).slice(0, 5);
  if (!items.length) return `## ${section}\n本轮将该线索作为后续跟踪项处理，暂不把它单独作为交易证据。`;
  return `## ${section}\n${items.map((item: any, index: number) => [
    `${index + 1}. **${item.title || '未命名情报'}**`,
    item.provider ? `来源：${item.provider}` : '',
    item.published_date ? `时间：${item.published_date}` : '',
    item.content ? `要点：${String(item.content).slice(0, 260)}` : '',
    item.url ? `链接：${item.url}` : '',
  ].filter(Boolean).join('\n')).join('\n\n')}`;
}

function formatItems(result: any, limit = 8) {
  const items = result.items || [];
  return {
    query: result.query,
    count: items.length,
    represented_providers: Array.from(new Set(items.map((item: any) => item.provider).filter(Boolean))),
    items: items.slice(0, limit).map((item: any) => ({
      provider: item.provider,
      title: item.title,
      url: item.url,
      snippet: String(item.content || '').slice(0, 520),
      published: item.published_date,
      score: item.score,
    })),
  };
}

function buildFallbackReport(
  ticker: string,
  date: string,
  officialDisclosure: any,
  companyNews: any,
  macroNews: any,
  social: any,
  xVoices: any,
) {
  const allItems = [
    ...(officialDisclosure.items || []),
    ...(companyNews.items || []),
    ...(macroNews.items || []),
    ...(social.items || []),
    ...(xVoices.items || []),
  ];
  const providers = Array.from(new Set(allItems.map((item: any) => item.provider).filter(Boolean)));
  return removeSourceApologyLanguage(`## 简要情报结论
${ticker} 在 ${date} 的情报地图已按“公司事实/财经新闻、宏观与赛道、市场讨论、X 高信号舆情”四条线整理。当前可用来源包括：${providers.slice(0, 10).join('、') || '公开财经与监管信息'}。

## 情报地图
${summarizeForFallback('官方公告/交易所/研报披露线索', officialDisclosure)}

${summarizeForFallback('公司与官方/财经线索', companyNews)}

${summarizeForFallback('宏观与赛道线索', macroNews)}

${summarizeForFallback('市场讨论与叙事线索', social)}

${summarizeForFallback('X 高信号讨论与分歧', xVoices)}

## 交易含义
短期重点看最新公告、财报指引、估值变化和市场叙事是否同向；中期重点看赛道需求、利润率和资本开支；长期重点看竞争壁垒、监管环境和产业周期位置。以上情报应交给研究主管与投资经理，和技术面、基本面、宏观趋势一起交叉验证。`);
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function chunks(text: string, size = 36) {
  const parts = text.split(/(\n\n|。|；|，|\n)/).filter(Boolean);
  const out: string[] = [];
  let current = '';
  for (const part of parts) {
    if (current && current.length + part.length > size) {
      out.push(current);
      current = part;
    } else {
      current += part;
    }
  }
  if (current) out.push(current);
  return out;
}

async function emitMarkdownStream(emit: Emit, text: string) {
  for (const chunk of chunks(text)) {
    emit('stream', { node: 'Intelligence Analyst', delta: chunk });
    await sleep(35);
  }
}

export async function intelligenceAnalyst({
  ticker,
  date,
  emit,
}: {
  ticker: string;
  date: string;
  emit: Emit;
}): Promise<{ intelligence_report: string }> {
  emit('agent', { node: 'Intelligence Analyst', status: 'running' });
  const start = Date.now();

  try {
    emit('agent-progress', { node: 'Intelligence Analyst', message: '正在抓取官方公告、交易所资讯、财经新闻和市场讨论…' });
    const [officialDisclosure, companyNews, macroNews, social, xVoices] = await Promise.all([
      safeSearch('official_disclosure', `${ticker} official disclosure`, () => searchFundamentalResearch(ticker, date, 365)),
      safeSearch('company_news', `${ticker} company news`, () => searchCompanyNews(ticker, date, 14)),
      safeSearch('macro_news', 'macro market news', () => searchMacroNews(date, 14)),
      safeSearch('social_signal', `${ticker} market discussion`, () => searchSocial(ticker, 14)),
      safeSearch('x_high_signal', `${ticker} X high-signal voices`, () => searchKolX(ticker, date, 45)),
    ]);
    emit('agent-progress', { node: 'Intelligence Analyst', message: '官方披露与舆情证据已就绪，正在生成情报地图…' });

    let text = '';
    try {
      const result = streamText({
        model: getQuickThink(),
        system: promptText + languageInstruction(),
        prompt: `Build a decision-useful intelligence map for **${ticker}** as of **${date}** from the pre-fetched evidence below. Do not request tools.

Treat X/Twitter search evidence as public-discussion and narrative evidence, not as confirmed company facts. The X high-signal section is fetched through xAI Grok X Search when represented by a grok_x_* provider.

Source disclosure rules:
- Describe only the usable represented providers and item evidence below.
- Do not mention missing, unavailable, insufficient, limited, failed, skipped, or misconfigured sources.
- Do not write that direct official announcements or authoritative sources are lacking when the official disclosure section contains items from cninfo, hkex_rss, sse_official, szse_official, bse_official, official_site, eastmoney, reuters, bloomberg, yahoo_finance, or other represented providers.
- Distinguish official facts, authoritative reporting, X/public discussion, and inference.
- Surface competing bullish and bearish narratives instead of collapsing the social signal into one mood.
- Preserve the catalyst timeline, possible narrative shifts, counterevidence, confidence level, and handoff summary that later agents need for debate.

## Official filings, exchange notices, research pages, and regulatory disclosures
${JSON.stringify(formatItems(officialDisclosure, 14), null, 2)}

## Company, official, and finance news
${JSON.stringify(formatItems(companyNews, 12), null, 2)}

## Macro and market backdrop
${JSON.stringify(formatItems(macroNews, 10), null, 2)}

## Broad public discussion proxies
${JSON.stringify(formatItems(social, 12), null, 2)}

## X high-signal voices and discussion
${JSON.stringify(formatItems(xVoices, 12), null, 2)}`,
        temperature: 0.3,
        maxTokens: 2000,
        ...llmCallOptions('stream'),
      });

      for await (const delta of result.textStream) {
        text += delta;
        emit('stream', { node: 'Intelligence Analyst', delta });
      }
    } catch (modelError: any) {
      console.warn('[Intelligence Analyst] model generation failed; using deterministic report', modelError?.message || String(modelError));
      text = buildFallbackReport(ticker, date, officialDisclosure, companyNews, macroNews, social, xVoices);
      await emitMarkdownStream(emit, text);
    }

    if (!text.trim()) {
      text = buildFallbackReport(ticker, date, officialDisclosure, companyNews, macroNews, social, xVoices);
      await emitMarkdownStream(emit, text);
    }

    const cleanedText = removeSourceApologyLanguage(text);
    const elapsed = (Date.now() - start) / 1000;
    emit('agent', { node: 'Intelligence Analyst', status: 'done', report: cleanedText, elapsed });
    return { intelligence_report: cleanedText };
  } catch (e: any) {
    console.warn('[Intelligence Analyst] unexpected failure', e?.message || String(e));
    const text = buildFallbackReport(
      ticker,
      date,
      emptyResult(`${ticker} official disclosure`, 'official_disclosure', e),
      emptyResult(`${ticker} company news`, 'company_news', e),
      emptyResult('macro market news', 'macro_news', e),
      emptyResult(`${ticker} market discussion`, 'social_signal', e),
      emptyResult(`${ticker} X high-signal voices`, 'x_high_signal', e),
    );
    const elapsed = (Date.now() - start) / 1000;
    await emitMarkdownStream(emit, text);
    emit('agent', { node: 'Intelligence Analyst', status: 'done', report: text, elapsed });
    return { intelligence_report: text };
  }
}
