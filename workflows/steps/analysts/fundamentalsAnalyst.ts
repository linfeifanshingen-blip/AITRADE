import fs from 'node:fs';
import path from 'node:path';
import { streamText } from 'ai';
import { getQuickThink, llmCallOptions } from '@/lib/ai';
import { getFundamentals, getStatement } from '@/lib/fundamentals';
import { languageInstruction } from '@/lib/language';
import { searchFundamentalResearch } from '@/lib/news';
import type { Emit } from '@/workflows/types';

const promptText = fs.readFileSync(
  path.join(process.cwd(), 'data/prompts/fundamentals.md'),
  'utf8'
);

async function withTimeout<T>(label: string, fn: () => Promise<T>, timeoutMs = 15000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timeout after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function safeData<T>(label: string, fn: () => Promise<T>): Promise<T | { error: string; label: string }> {
  try {
    return await withTimeout(label, fn);
  } catch (e: any) {
    return { label, error: e?.message || String(e) };
  }
}

function isDataError(value: any): value is { error: string; label: string } {
  return Boolean(value && typeof value === 'object' && 'error' in value && 'label' in value);
}

function statementRows(value: any) {
  if (!Array.isArray(value)) return value;
  return value.slice(0, 4).map(row => Object.fromEntries(
    Object.entries(row || {}).filter(([, item]) => item != null)
  ));
}

function formatData(value: any) {
  if (isDataError(value)) return value;
  if (Array.isArray(value)) return statementRows(value);
  return value;
}

function formatResearch(value: any) {
  if (isDataError(value)) return value;
  const items = Array.isArray(value?.items) ? value.items : [];
  const providers = Array.isArray(value?.providers) ? value.providers : [];
  return {
    query: value?.query || null,
    count: value?.count ?? items.length,
    providers: providers.map((provider: any) => ({
      provider: provider.provider,
      count: provider.count,
      status: provider.status,
      detail: provider.detail,
    })),
    items: items.slice(0, 10).map((item: any) => ({
      provider: item.provider,
      title: item.title,
      url: item.url,
      published_date: item.published_date,
      content: item.content,
    })),
  };
}

function fmtNumber(value: any) {
  const n = typeof value === 'number' ? value : null;
  if (n == null || !Number.isFinite(n)) return '暂无';
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(2);
}

function fmtPct(value: any) {
  const n = typeof value === 'number' ? value : null;
  if (n == null || !Number.isFinite(n)) return '暂无';
  return `${n.toFixed(2)}%`;
}

function fmtPrice(value: any, currency = 'USD') {
  const n = typeof value === 'number' ? value : null;
  if (n == null || !Number.isFinite(n)) return '暂无';
  return `${currency} ${n.toFixed(2)}`;
}

function buildFallbackReport({
  ticker,
  date,
  fundamentals,
  income,
  balance,
  cashflow,
  research,
}: {
  ticker: string;
  date: string;
  fundamentals: any;
  income: any;
  balance: any;
  cashflow: any;
  research: any;
}) {
  const f = isDataError(fundamentals) ? {} : fundamentals;
  const profile = f.profile || {};
  const valuation = f.valuation || {};
  const profitability = f.profitability || {};
  const growth = f.growth || {};
  const sheet = f.balance_sheet || {};
  const cf = f.cashflow || {};
  const analyst = f.analyst || {};
  const price = f.price || {};
  const source = f.source || 'Futu OpenD / Yahoo Finance / SEC companyfacts / Nasdaq / Stooq';
  const diagnostics = [
    f.quote_error ? `行情快照：${f.quote_error}` : null,
    f.futu_error ? `富途 OpenD：${f.futu_error}` : null,
    f.yahoo_error ? `Yahoo Finance：${f.yahoo_error}` : null,
  ].filter(Boolean).join('；');
  const latestIncome = Array.isArray(income) ? income[0] : null;
  const latestBalance = Array.isArray(balance) ? balance[0] : null;
  const latestCashflow = Array.isArray(cashflow) ? cashflow[0] : null;
  const eastmoneyLatest = f.eastmoney_financials?.latest_report || null;
  const researchData = isDataError(research) ? null : research;
  const researchItems = Array.isArray(researchData?.items) ? researchData.items.slice(0, 6) : [];
  const researchProviderView = Array.isArray(researchData?.providers)
    ? researchData.providers
        .filter((provider: any) => provider?.count || provider?.status === 'ok')
        .slice(0, 6)
        .map((provider: any) => `${provider.provider}:${provider.count}`)
        .join('；')
    : '';
  const researchView = researchItems.length
    ? researchItems.map((item: any, index: number) => `${index + 1}. ${item.title || 'Untitled'}（${item.provider || 'web'}${item.published_date ? `，${item.published_date}` : ''}）\n   ${item.content || ''}\n   ${item.url || ''}`).join('\n')
    : '本轮未检索到足够稳定的公开研报/公告摘要，基本面判断应更多依赖结构化财务字段，并在交易前人工复核港交所公告或公司 IR 材料。';

  const growthView = [
    `收入同比增速：${fmtPct(growth.revenue_growth_yoy_pct)}`,
    `盈利同比增速：${fmtPct(growth.earnings_growth_yoy_pct)}`,
    `最新报告期：${eastmoneyLatest?.reportName || latestIncome?.reportName || latestIncome?.endDate || '暂无'}`,
    `营业收入：${fmtNumber(latestIncome?.totalRevenue ?? latestIncome?.revenue)}`,
    `归母净利润：${fmtNumber(latestIncome?.netIncome ?? eastmoneyLatest?.parentNetProfit)}`,
  ].join('；');

  const qualityView = [
    `毛利率：${fmtPct(profitability.gross_margin_pct)}`,
    `经营利润率：${fmtPct(profitability.operating_margin_pct)}`,
    `净利率：${fmtPct(profitability.profit_margin_pct)}`,
    `ROE：${fmtPct(profitability.roe_pct)}`,
    `ROIC：${fmtPct(profitability.roic_pct)}`,
    `经营现金流：${fmtNumber(cf.operating_cashflow ?? latestCashflow?.operatingCashflow)}`,
  ].join('；');

  const valuationView = [
    `市值：${fmtNumber(valuation.market_cap)}`,
    `TTM PE：${fmtNumber(valuation.pe_trailing)}`,
    `Forward PE：${fmtNumber(valuation.pe_forward)}`,
    `PS：${fmtNumber(valuation.ps_trailing)}`,
    `PB：${fmtNumber(valuation.pb)}`,
    `EV/EBITDA：${fmtNumber(valuation.ev_ebitda)}`,
  ].join('；');

  const balanceView = [
    `现金：${fmtNumber(sheet.total_cash ?? latestBalance?.cash)}`,
    `总资产：${fmtNumber(sheet.total_assets ?? latestBalance?.totalAssets)}`,
    `总负债：${fmtNumber(sheet.total_liabilities ?? latestBalance?.totalLiabilities)}`,
    `总债务：${fmtNumber(sheet.total_debt)}`,
    `债务权益比：${fmtNumber(sheet.debt_to_equity)}`,
    `资产负债率：${fmtPct(sheet.debt_asset_ratio_pct)}`,
    `流动比率：${fmtNumber(sheet.current_ratio)}`,
    `速动比率：${fmtNumber(sheet.quick_ratio)}`,
  ].join('；');

  return `## 基本面结论
${ticker} 的基本面快照基于 ${source}，统计日期为 ${date}。公司名称：${profile.name || ticker}；行业：${profile.sector || '待公开资料补充'} / ${profile.industry || '待公开资料补充'}；当前价格：${fmtPrice(price.current, price.currency || 'USD')}。

## 增长与盈利能力
${growthView}。如果收入增速、盈利增速和利润率同时维持高位，说明公司仍处于较强基本面区间；若增长放缓而估值仍高，则后续股价更依赖预期兑现。

## 估值
${valuationView}。估值判断需要和公司所处赛道增速、利润率、现金流确定性一起看，不能只看单一 PE。

## 资产负债表/现金流质量
${balanceView}。现金流和债务结构决定公司在宏观利率、行业周期和资本开支压力下的抗压能力。

## 分析师预期
目标均价：${fmtPrice(analyst.target_mean, price.currency || 'USD')}；最高目标价：${fmtPrice(analyst.target_high, price.currency || 'USD')}；最低目标价：${fmtPrice(analyst.target_low, price.currency || 'USD')}；分析师数量：${fmtNumber(analyst.analyst_count)}；推荐均值：${fmtNumber(analyst.recommendation_mean)}。

## 公开研报/公告补充
${researchProviderView ? `检索来源命中：${researchProviderView}。\n` : ''}${researchView}

## 对交易决策的关键含义
短期更关注财报、指引、估值分位和资金风险偏好；中期关注收入/利润增速是否延续；长期关注行业空间、护城河、现金流质量和资本回报。若技术面已经过热，而基本面没有继续上修，建仓应更强调分批和回撤纪律。

## 数据来源
本段优先采用富途 OpenD 行情快照；若 OpenD 不可用，会尝试富途网页公开快照；A股补充东方财富 F10 财务摘要，港股/A股行情与K线补充东方财富公开接口，同时交叉使用 Yahoo Finance、SEC companyfacts、Nasdaq 公开页面、Stooq 行情字段，以及公开研报/公告/业绩材料搜索摘要。${diagnostics ? `\n\n## 数据源诊断\n${diagnostics}。如果这是 A 股或港股标的，富途不可用时系统会自动尝试富途网页和东方财富公开接口；若仍失败，请检查本机网络是否能访问对应数据源。` : ''}`;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function markdownChunks(text: string, chunkSize = 28) {
  const parts = text
    .split(/(\n\n|。|；|：|，|、|\n)/)
    .filter(part => part.length > 0);
  const chunks: string[] = [];
  let current = '';

  for (const part of parts) {
    if (current.length + part.length > chunkSize && current) {
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
    await sleep(38);
  }
}

export async function fundamentalsAnalyst({
  ticker,
  date,
  emit,
}: {
  ticker: string;
  date: string;
  emit: Emit;
}): Promise<{ fundamentals_report: string }> {
  emit('agent', { node: 'Fundamentals Analyst', status: 'running' });
  emit('agent-progress', { node: 'Fundamentals Analyst', message: '正在读取基本面快照、三张表和公开研报/公告补充材料…' });
  const start = Date.now();

  try {
    const [fundamentals, income, balance, cashflow, research] = await Promise.all([
      safeData('fundamentals', () => getFundamentals(ticker)),
      safeData('income statement', () => getStatement(ticker, 'income', 'annual')),
      safeData('balance sheet', () => getStatement(ticker, 'balance', 'annual')),
      safeData('cashflow', () => getStatement(ticker, 'cashflow', 'annual')),
      safeData('public fundamental research', () => searchFundamentalResearch(ticker, date, 365)),
    ]);

    emit('agent-progress', { node: 'Fundamentals Analyst', message: '财务和公开资料已就绪，正在生成基本面报告…' });
    let text = '';
    try {
      const result = streamText({
        model: getQuickThink(),
        system: promptText + languageInstruction(),
        prompt: `Analyze the fundamentals of **${ticker}** as of **${date}** from the pre-fetched financial data below. Do not request tools.

Write a detailed downstream-ready markdown research memo:
- Start with a concise fundamental judgment, not a data dump.
- Quantify growth, margins, cash generation, balance-sheet pressure, valuation, and analyst expectations whenever the data supports it.
- Compare the available annual statement rows before making trajectory claims.
- Use the public research / announcements snippets as supplemental evidence for business drivers, segment growth, guidance, valuation framing, target-price changes, and risk triggers.
- Separate reported facts from inference. Do not invent missing figures or peer comparisons.
- Cite source titles or URLs from the supplemental research when using those claims.
- Preserve the evidence, counterevidence, catalysts, risk triggers, and handoff summary that later bull/bear, trader, and risk agents need.
- End with a markdown table of the key metrics, why each matters, and the trading implication.

## Fundamental snapshot
${JSON.stringify(formatData(fundamentals), null, 2)}

## Annual income statements
${JSON.stringify(formatData(income), null, 2)}

## Annual balance sheets
${JSON.stringify(formatData(balance), null, 2)}

## Annual cashflow statements
${JSON.stringify(formatData(cashflow), null, 2)}

## Public research / announcements supplement
${JSON.stringify(formatResearch(research), null, 2)}`,
        temperature: 0.25,
        maxTokens: 2400,
        ...llmCallOptions('stream'),
      });

      for await (const delta of result.textStream) {
        text += delta;
        emit('stream', { node: 'Fundamentals Analyst', delta });
      }
    } catch (modelError: any) {
      console.warn('[Fundamentals Analyst] model generation failed; using deterministic report', modelError?.message || String(modelError));
      emit('agent-progress', { node: 'Fundamentals Analyst', message: '模型流中断，正在使用已获取财务数据生成本地报告…' });
      text = buildFallbackReport({ ticker, date, fundamentals, income, balance, cashflow, research });
      await emitMarkdownStream(emit, 'Fundamentals Analyst', text);
    }

    if (!text.trim()) {
      text = buildFallbackReport({ ticker, date, fundamentals, income, balance, cashflow, research });
      await emitMarkdownStream(emit, 'Fundamentals Analyst', text);
    }

    const elapsed = (Date.now() - start) / 1000;
    emit('agent', { node: 'Fundamentals Analyst', status: 'done', report: text, elapsed });
    return { fundamentals_report: text };
  } catch (e: any) {
    emit('error', { node: 'Fundamentals Analyst', message: e.message });
    throw e;
  }
}
