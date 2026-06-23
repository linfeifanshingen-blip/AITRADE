/**
 * Fundamentals with Yahoo primary and SEC companyfacts fallback.
 */

import YahooFinance from 'yahoo-finance2';
import { memo } from './cache';
import { getFutuQuoteSnapshot, type FutuQuoteSnapshot } from './futu';
import { parseTicker } from './markets';
import { getFutunnWebQuoteSnapshot } from './futunnPublic';
import { getCryptoFundamentals } from './crypto';
import {
  getEastmoneyFinancialSummary,
  getEastmoneyQuoteSnapshot,
  getEastmoneyStatement,
  isEastmoneySupported,
} from './eastmoney';

const yahooFinance = new YahooFinance({
  suppressNotices: ['yahooSurvey', 'ripHistorical'],
  logger: {
    info: () => {},
    warn: () => {},
    error: console.error,
    debug: () => {},
    dir: () => {},
  },
} as any);

const SEC_UA = 'silicon-trader/0.1 local research contact@example.com';
const PUBLIC_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36';
const NASDAQ_HEADERS = {
  'User-Agent': PUBLIC_UA,
  Accept: 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  Origin: 'https://www.nasdaq.com',
  Referer: 'https://www.nasdaq.com/',
};

const CIK_BY_SYMBOL: Record<string, string> = {
  AAPL: '0000320193',
  MSFT: '0000789019',
  GOOGL: '0001652044',
  GOOG: '0001652044',
  AMZN: '0001018724',
  META: '0001326801',
  NVDA: '0001045810',
  TSLA: '0001318605',
  INTC: '0000050863',
  AMD: '0000002488',
  NFLX: '0001065280',
  ORCL: '0001341439',
  CRM: '0001108524',
  IBM: '0000051143',
  QCOM: '0000804328',
  AVGO: '0001730168',
  MU: '0000723125',
};

let secTickerMapPromise: Promise<Record<string, string>> | null = null;

function num(x: any): number | null {
  if (x == null) return null;
  if (typeof x === 'number') return x;
  if (typeof x === 'object' && 'raw' in x) return x.raw ?? null;
  return null;
}

function pct(x: any): number | null {
  const n = num(x);
  return n != null ? n * 100 : null;
}

async function fetchWithTimeout(input: string | URL, init: RequestInit = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: init.signal || controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

async function safeWithError<T>(fn: () => Promise<T>): Promise<{ value: T | null; error: string | null }> {
  try {
    return { value: await fn(), error: null };
  } catch (error: any) {
    return { value: null, error: error?.message || String(error) };
  }
}

async function localTimeout<T>(label: string, fn: () => Promise<T>, timeoutMs: number): Promise<T> {
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

function valueOf(row: any) {
  return row && typeof row === 'object' && 'value' in row ? row.value : row;
}

function parseMoney(value: any): number | null {
  const raw = String(valueOf(value) ?? '').trim();
  if (!raw || raw === 'N/A' || raw === '--') return null;
  const multiplier = /T$/i.test(raw) ? 1e12 : /B$/i.test(raw) ? 1e9 : /M$/i.test(raw) ? 1e6 : 1;
  const n = Number(raw.replace(/[,$%]/g, '').replace(/[TBM]$/i, ''));
  return Number.isFinite(n) ? n * multiplier : null;
}

function parseNasdaqFinancialAmount(value: any): number | null {
  const parsed = parseMoney(value);
  if (parsed == null) return null;
  return parsed * 1000;
}

function parsePercentValue(value: any): number | null {
  const raw = String(valueOf(value) ?? '').trim();
  if (!raw || raw === 'N/A' || raw === '--') return null;
  const n = Number(raw.replace(/[,%$]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function parseRatioValue(value: any): number | null {
  const pct = parsePercentValue(value);
  if (pct == null) return null;
  return /%/.test(String(valueOf(value) ?? '')) ? pct / 100 : pct;
}

function parseRange(value: any): { high: number | null; low: number | null } {
  const raw = String(valueOf(value) ?? '');
  const nums = raw.match(/\$?[\d,.]+/g)?.map(parseMoney).filter((x): x is number => x != null) || [];
  return { high: nums[0] ?? null, low: nums[1] ?? null };
}

function stooqSymbol(symbol: string) {
  const s = symbol.trim().toLowerCase();
  if (s.includes('.') || s.includes('-')) return s.replace('-', '.');
  return `${s}.us`;
}

async function getStooqQuote(symbol: string) {
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSymbol(symbol))}&f=sd2t2ohlcv&h&e=csv`;
  const r = await fetchWithTimeout(url, {
    headers: { 'User-Agent': PUBLIC_UA },
  }, 8000);
  if (!r.ok) throw new Error(`stooq quote ${symbol} ${r.status}`);
  const csv = await r.text();
  const [header, row] = csv.trim().split(/\r?\n/);
  if (!header || !row) throw new Error(`stooq quote ${symbol} empty`);
  const keys = header.split(',').map(x => x.trim());
  const values = row.split(',').map(x => x.trim());
  const out = Object.fromEntries(keys.map((key, i) => [key, values[i]]));
  return {
    current: parseMoney(out.Close),
    open: parseMoney(out.Open),
    high: parseMoney(out.High),
    low: parseMoney(out.Low),
    volume: parseMoney(out.Volume),
    date: out.Date,
    time: out.Time,
  };
}

export async function getFundamentals(symbol: string) {
  const dayKey = new Date().toISOString().slice(0, 10);
  const parsed = parseTicker(symbol);
  const cacheKey = `cache:fundamentals:v7:${parsed.symbol}:${dayKey}`;
  return memo(cacheKey, async () => {
    if (parsed.market === 'CRYPTO') {
      return await getCryptoFundamentals(parsed.symbol);
    }
    const quotePromise = getPreferredQuoteSnapshot(symbol);
    const yahooPromise = safe(() => localTimeout('yahoo fundamentals', () => getYahooFundamentals(parsed.yahooSymbol), 5000));
    const isAhk = parsed.market === 'HK' || parsed.market === 'CN_SH' || parsed.market === 'CN_SZ';
    if (isAhk) {
      const [quote, eastmoneyFinancials] = await Promise.all([
        quotePromise,
        safe(() => localTimeout('eastmoney financial summary', () => getEastmoneyFinancialSummary(parsed.symbol), 7000)),
      ]);
      const yahoo = await yahooPromise;
      if (yahoo) {
        return enrichWithEastmoneyFinancials(
          mergeFutuFundamentals({ ...yahoo, symbol: parsed.symbol, quote_error: quote.error }, quote.value),
          eastmoneyFinancials,
        );
      }
      return getAhkFundamentals(
        parsed.symbol,
        'Yahoo Finance unavailable for A/HK in this run',
        quote.value,
        quote.error,
        eastmoneyFinancials,
      );
    }
    const publicPromise = (async () => {
      const quote = await quotePromise;
      return getPublicFundamentals(symbol, 'Yahoo Finance unavailable in this run', quote.value);
    })();

    const yahoo = await yahooPromise;
    if (yahoo) {
      const quote = await quotePromise;
      return mergeFutuFundamentals({ ...yahoo, quote_error: quote.error }, quote.value);
    }
    return await publicPromise;
  }, { ttlSec: 6 * 3600, shouldCache: hasFundamentalSignal });
}

async function getPreferredQuoteSnapshot(symbol: string): Promise<{ value: FutuQuoteSnapshot | null; error: string | null }> {
  const futu = await safeWithError(() => localTimeout('futu quote', () => getFutuQuoteSnapshot(symbol), 3500));
  if (futu.value) return futu;
  const futunnWeb = await safeWithError(() => localTimeout('futunn web quote', () => getFutunnWebQuoteSnapshot(symbol), 6500));
  if (futunnWeb.value) {
    return {
      value: futunnWeb.value,
      error: futu.error ? `Futu OpenD failed: ${futu.error}; using Futunn web quote fallback` : null,
    };
  }
  if (!isEastmoneySupported(symbol)) return futu;
  const eastmoney = await safeWithError(() => localTimeout('eastmoney quote', () => getEastmoneyQuoteSnapshot(symbol) as Promise<any>, 5000));
  if (eastmoney.value) {
    return {
      value: eastmoney.value as FutuQuoteSnapshot,
      error: [
        futu.error ? `Futu OpenD failed: ${futu.error}` : null,
        futunnWeb.error ? `Futunn Web failed: ${futunnWeb.error}` : null,
        'using Eastmoney quote fallback',
      ].filter(Boolean).join('; '),
    };
  }
  return {
    value: null,
    error: [
      futu.error ? `Futu OpenD: ${futu.error}` : null,
      futunnWeb.error ? `Futunn Web: ${futunnWeb.error}` : null,
      eastmoney.error ? `Eastmoney: ${eastmoney.error}` : null,
    ]
      .filter(Boolean)
      .join('; ') || null,
  };
}

function getAhkFundamentals(
  symbol: string,
  yahooError: string,
  futuQuote?: FutuQuoteSnapshot | null,
  futuError?: string | null,
  eastmoneyFinancials?: any | null,
) {
  const parsed = parseTicker(symbol);
  const marketName = parsed.market === 'HK' ? '港股' : parsed.market === 'CN_SH' ? 'A股沪市' : 'A股深市';
  return enrichWithEastmoneyFinancials(mergeFutuFundamentals({
    source: futuQuote ? 'Futu OpenD quote snapshot' : 'A/HK public fallback',
    yahoo_error: yahooError,
    quote_error: futuError || null,
    symbol: parsed.symbol,
    profile: {
      name: futuQuote?.name || parsed.symbol,
      sector: null,
      industry: null,
      country: parsed.market === 'HK' ? 'HK' : 'CN',
      summary: `${marketName}标的。当前版本优先接入富途 OpenD 行情/估值快照；完整三表需要后续接入交易所公告、巨潮资讯、港交所公告或富途财务接口。`,
      exchange: marketName,
    },
    valuation: {
      market_cap: futuQuote?.market_cap ?? null,
      pe_trailing: futuQuote?.pe_ttm ?? null,
      pe_forward: null,
      ps_trailing: null,
      pb: futuQuote?.pb ?? null,
      ev_ebitda: null,
      peg_ratio: null,
    },
    profitability: {
      gross_margin_pct: null,
      operating_margin_pct: null,
      profit_margin_pct: null,
      ebitda_margin_pct: null,
      roe_pct: null,
      roa_pct: null,
    },
    growth: {
      revenue_growth_yoy_pct: null,
      earnings_growth_yoy_pct: null,
    },
    balance_sheet: {
      total_cash: null,
      total_debt: null,
      debt_to_equity: null,
      current_ratio: null,
      quick_ratio: null,
    },
    cashflow: {
      operating_cashflow: null,
      free_cashflow: null,
    },
    analyst: {
      target_mean: null,
      target_high: null,
      target_low: null,
      recommendation_mean: null,
      analyst_count: null,
      strong_buy: null,
      buy: null,
      hold: null,
      sell: null,
      strong_sell: null,
    },
    price: {
      current: futuQuote?.current ?? null,
      currency: parsed.currency,
      previous_close: futuQuote?.previous_close ?? null,
      day_change_pct: futuQuote?.day_change_pct ?? null,
      week52_high: futuQuote?.week52_high ?? null,
      week52_low: futuQuote?.week52_low ?? null,
      volume: futuQuote?.volume ?? null,
      turnover: futuQuote?.turnover ?? null,
      turnover_rate_pct: futuQuote?.turnover_rate_pct ?? null,
      latest_quote_time: futuQuote?.update_time ?? null,
      provider_priority: futuQuote ? 'Futu OpenD' : 'none',
    },
  }, futuQuote ?? null), eastmoneyFinancials);
}

function hasFundamentalSignal(value: any) {
  return Boolean(
    value?.profile?.summary
    || value?.profile?.sector
    || value?.valuation?.market_cap
    || value?.profitability?.profit_margin_pct != null
    || value?.growth?.revenue_growth_yoy_pct != null
    || value?.cashflow?.operating_cashflow != null
    || value?.balance_sheet?.total_assets != null
    || value?.price?.current != null
  );
}

function mergeFutuFundamentals(base: any, futuQuote: FutuQuoteSnapshot | null) {
  if (!futuQuote) return base;
  const source = futuQuote.source || 'Futu OpenD';
  return {
    ...base,
    source: [source, base.source].filter(Boolean).join(' + '),
    profile: {
      ...base.profile,
      name: futuQuote.name || base.profile?.name,
    },
    valuation: {
      ...base.valuation,
      market_cap: futuQuote.market_cap ?? base.valuation?.market_cap,
      pe_trailing: futuQuote.pe_ttm ?? base.valuation?.pe_trailing,
      pb: futuQuote.pb ?? base.valuation?.pb,
    },
    price: {
      ...base.price,
      current: futuQuote.current ?? base.price?.current,
      currency: base.price?.currency || futuQuote.currency || 'USD',
      previous_close: futuQuote.previous_close ?? base.price?.previous_close,
      day_change_pct: futuQuote.day_change_pct ?? base.price?.day_change_pct,
      open: futuQuote.open ?? base.price?.open,
      high: futuQuote.high ?? base.price?.high,
      low: futuQuote.low ?? base.price?.low,
      week52_high: futuQuote.week52_high ?? base.price?.week52_high,
      week52_low: futuQuote.week52_low ?? base.price?.week52_low,
      volume: futuQuote.volume ?? base.price?.volume,
      turnover: futuQuote.turnover ?? base.price?.turnover,
      turnover_rate_pct: futuQuote.turnover_rate_pct ?? base.price?.turnover_rate_pct,
      latest_quote_time: futuQuote.update_time ?? base.price?.latest_quote_time,
      provider_priority: source,
    },
  };
}

function enrichWithEastmoneyFinancials(base: any, eastmoneyFinancials?: any | null) {
  const latest = eastmoneyFinancials?.latest;
  if (!latest) return base;

  const marketCap = base.valuation?.market_cap ?? null;
  return {
    ...base,
    source: [
      base.source,
      eastmoneyFinancials.source ? `${eastmoneyFinancials.source} financial summary` : null,
    ].filter(Boolean).join(' + '),
    profile: {
      ...base.profile,
      summary: base.profile?.summary || '东方财富 F10 提供最近报告期的A股财务摘要、盈利能力和偿债指标。',
    },
    valuation: {
      ...base.valuation,
      pe_trailing: base.valuation?.pe_trailing ?? (marketCap && latest.parentNetProfit ? marketCap / latest.parentNetProfit : null),
      ps_trailing: base.valuation?.ps_trailing ?? (marketCap && latest.totalRevenue ? marketCap / latest.totalRevenue : null),
      pb: base.valuation?.pb ?? (marketCap && latest.totalEquity ? marketCap / latest.totalEquity : null),
    },
    profitability: {
      ...base.profitability,
      gross_margin_pct: latest.grossMarginPct ?? base.profitability?.gross_margin_pct,
      profit_margin_pct: latest.netMarginPct ?? base.profitability?.profit_margin_pct,
      roe_pct: latest.roePct ?? base.profitability?.roe_pct,
      roic_pct: latest.roicPct ?? base.profitability?.roic_pct,
    },
    growth: {
      ...base.growth,
      revenue_growth_yoy_pct: latest.revenueGrowthYoyPct ?? base.growth?.revenue_growth_yoy_pct,
      earnings_growth_yoy_pct: latest.netProfitGrowthYoyPct ?? base.growth?.earnings_growth_yoy_pct,
    },
    balance_sheet: {
      ...base.balance_sheet,
      total_assets: latest.totalAssets ?? base.balance_sheet?.total_assets,
      total_liabilities: latest.totalLiabilities ?? base.balance_sheet?.total_liabilities,
      total_equity: latest.totalEquity ?? base.balance_sheet?.total_equity,
      debt_to_equity: latest.totalEquity && latest.totalLiabilities ? (latest.totalLiabilities / latest.totalEquity) * 100 : base.balance_sheet?.debt_to_equity,
      debt_asset_ratio_pct: latest.debtAssetRatioPct ?? base.balance_sheet?.debt_asset_ratio_pct,
      current_ratio: latest.currentRatio ?? base.balance_sheet?.current_ratio,
      quick_ratio: latest.quickRatio ?? base.balance_sheet?.quick_ratio,
      book_value_per_share: latest.bookValuePerShare ?? base.balance_sheet?.book_value_per_share,
    },
    cashflow: {
      ...base.cashflow,
      operating_cashflow: latest.operatingCashflow ?? base.cashflow?.operating_cashflow,
      operating_cashflow_per_share: latest.operatingCashflowPerShare ?? base.cashflow?.operating_cashflow_per_share,
    },
    eastmoney_financials: {
      latest_report: latest,
      recent_reports: eastmoneyFinancials.rows?.slice(0, 6) || [],
    },
  };
}

async function getYahooFundamentals(symbol: string) {
  const r = await yahooFinance.quoteSummary(symbol, {
    modules: [
      'assetProfile', 'summaryDetail', 'price',
      'defaultKeyStatistics', 'financialData', 'recommendationTrend',
    ],
  });

  const profile: any = r.assetProfile || {};
  const detail: any = r.summaryDetail || {};
  const price: any = r.price || {};
  const stats: any = r.defaultKeyStatistics || {};
  const fin: any = r.financialData || {};
  const rec: any = r.recommendationTrend?.trend?.[0] || {};

  return {
    source: 'Yahoo Finance',
    symbol,
    profile: {
      name: price.longName || price.shortName,
      sector: profile.sector,
      industry: profile.industry,
      country: profile.country,
      employees: profile.fullTimeEmployees,
      summary: (profile.longBusinessSummary || '').slice(0, 800),
    },
    valuation: {
      market_cap: num(price.marketCap),
      pe_trailing: num(detail.trailingPE),
      pe_forward: num(detail.forwardPE),
      ps_trailing: num(stats.priceToSalesTrailing12Months),
      pb: num(stats.priceToBook),
      ev_ebitda: num(stats.enterpriseToEbitda),
      peg_ratio: num(stats.pegRatio),
    },
    profitability: {
      gross_margin_pct: pct(fin.grossMargins),
      operating_margin_pct: pct(fin.operatingMargins),
      profit_margin_pct: pct(fin.profitMargins),
      ebitda_margin_pct: pct(fin.ebitdaMargins),
      roe_pct: pct(fin.returnOnEquity),
      roa_pct: pct(fin.returnOnAssets),
    },
    growth: {
      revenue_growth_yoy_pct: pct(fin.revenueGrowth),
      earnings_growth_yoy_pct: pct(fin.earningsGrowth),
    },
    balance_sheet: {
      total_cash: num(fin.totalCash),
      total_debt: num(fin.totalDebt),
      debt_to_equity: num(fin.debtToEquity),
      current_ratio: num(fin.currentRatio),
      quick_ratio: num(fin.quickRatio),
    },
    cashflow: {
      operating_cashflow: num(fin.operatingCashflow),
      free_cashflow: num(fin.freeCashflow),
    },
    analyst: {
      target_mean: num(fin.targetMeanPrice),
      target_high: num(fin.targetHighPrice),
      target_low: num(fin.targetLowPrice),
      recommendation_mean: num(fin.recommendationMean),
      analyst_count: num(fin.numberOfAnalystOpinions),
      strong_buy: rec.strongBuy ?? null,
      buy: rec.buy ?? null,
      hold: rec.hold ?? null,
      sell: rec.sell ?? null,
      strong_sell: rec.strongSell ?? null,
    },
    price: {
      current: num(price.regularMarketPrice),
      currency: price.currency,
      day_change_pct: pct(detail.regularMarketChangePercent),
      week52_high: num(detail.fiftyTwoWeekHigh),
      week52_low: num(detail.fiftyTwoWeekLow),
    },
  };
}

async function getSecTickerMap() {
  if (!secTickerMapPromise) {
    secTickerMapPromise = (async () => {
      const url = 'https://www.sec.gov/files/company_tickers.json';
      const r = await fetchWithTimeout(url, {
        headers: {
          'User-Agent': SEC_UA,
          Accept: 'application/json',
        },
      }, 10000);
      if (!r.ok) throw new Error(`SEC company_tickers ${r.status}`);
      const data = await r.json();
      const entries = Object.values(data || {}) as Array<{ ticker?: string; cik_str?: number }>;
      return Object.fromEntries(entries
        .filter(row => row.ticker && row.cik_str)
        .map(row => [String(row.ticker).toUpperCase(), String(row.cik_str).padStart(10, '0')]));
    })();
  }
  return secTickerMapPromise;
}

async function cikForSymbol(symbol: string) {
  const normalized = symbol.toUpperCase().replace('-', '.');
  const staticCik = CIK_BY_SYMBOL[symbol.toUpperCase()] || CIK_BY_SYMBOL[normalized];
  if (staticCik) return staticCik;
  const map = await getSecTickerMap();
  return map[symbol.toUpperCase()] || map[normalized] || null;
}

async function secCompanyFacts(symbol: string) {
  const cik = await cikForSymbol(symbol);
  if (!cik) throw new Error(`SEC fallback has no CIK mapping for ${symbol}`);
  const dayKey = new Date().toISOString().slice(0, 10);
  return memo(`cache:sec:companyfacts:${symbol.toUpperCase()}:${dayKey}`, async () => {
    const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
    const r = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': SEC_UA,
        Accept: 'application/json',
      },
    }, 8000);
    if (!r.ok) throw new Error(`SEC companyfacts ${symbol} ${r.status}`);
    return await r.json();
  }, { ttlSec: 6 * 3600 });
}

function factList(facts: any, names: string[], unit = 'USD') {
  const usgaap = facts?.facts?.['us-gaap'] || {};
  for (const name of names) {
    const units = usgaap[name]?.units || {};
    const arr = units[unit] || units.shares || units.pure || Object.values(units)[0];
    if (Array.isArray(arr) && arr.length) {
      return arr
        .filter((x: any) => typeof x.val === 'number')
        .sort((a: any, b: any) => String(a.end || '').localeCompare(String(b.end || '')));
    }
  }
  return [];
}

function latestFact(facts: any, names: string[], unit = 'USD') {
  const arr = factList(facts, names, unit);
  return arr[arr.length - 1]?.val ?? null;
}

function annualFacts(facts: any, names: string[], unit = 'USD') {
  const byYear = new Map<string, any>();
  for (const item of factList(facts, names, unit)) {
    const year = item.fy || (item.end ? Number(String(item.end).slice(0, 4)) : undefined);
    if (!year) continue;
    const form = String(item.form || '');
    if (!['10-K', '10-K/A', '20-F', '40-F'].includes(form)) continue;
    const existing = byYear.get(String(year));
    if (!existing || String(item.filed || '') > String(existing.filed || '')) {
      byYear.set(String(year), item);
    }
  }
  return [...byYear.values()].sort((a, b) => Number(b.fy) - Number(a.fy));
}

async function getSecFundamentals(symbol: string, yahooError: string) {
  const facts = await secCompanyFacts(symbol);
  const revenue = latestFact(facts, [
    'RevenueFromContractWithCustomerExcludingAssessedTax',
    'Revenues',
    'SalesRevenueNet',
  ]);
  const netIncome = latestFact(facts, ['NetIncomeLoss', 'ProfitLoss']);
  const operatingIncome = latestFact(facts, ['OperatingIncomeLoss']);
  const grossProfit = latestFact(facts, ['GrossProfit']);
  const assets = latestFact(facts, ['Assets']);
  const liabilities = latestFact(facts, ['Liabilities']);
  const equity = latestFact(facts, ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest']);
  const cash = latestFact(facts, [
    'CashAndCashEquivalentsAtCarryingValue',
    'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents',
  ]);
  const debtCurrent = latestFact(facts, ['ShortTermBorrowings', 'DebtCurrent', 'ShortTermDebtCurrent']);
  const debtLong = latestFact(facts, ['LongTermDebtNoncurrent', 'LongTermDebt']);
  const opCashflow = latestFact(facts, ['NetCashProvidedByUsedInOperatingActivities']);
  const capex = latestFact(facts, ['PaymentsToAcquirePropertyPlantAndEquipment']);

  return {
    source: 'SEC companyfacts',
    yahoo_error: yahooError,
    symbol,
    profile: {
      name: facts.entityName,
      sector: null,
      industry: null,
      country: 'US',
      employees: null,
      summary: 'SEC XBRL companyfacts provides standardized company filings and financial statement facts.',
    },
    valuation: {
      market_cap: null,
      pe_trailing: null,
      pe_forward: null,
      ps_trailing: null,
      pb: null,
      ev_ebitda: null,
      peg_ratio: null,
    },
    profitability: {
      gross_margin_pct: revenue && grossProfit ? (grossProfit / revenue) * 100 : null,
      operating_margin_pct: revenue && operatingIncome ? (operatingIncome / revenue) * 100 : null,
      profit_margin_pct: revenue && netIncome ? (netIncome / revenue) * 100 : null,
      ebitda_margin_pct: null,
      roe_pct: equity && netIncome ? (netIncome / equity) * 100 : null,
      roa_pct: assets && netIncome ? (netIncome / assets) * 100 : null,
    },
    growth: {
      revenue_growth_yoy_pct: null,
      earnings_growth_yoy_pct: null,
    },
    balance_sheet: {
      total_cash: cash,
      total_debt: (debtCurrent || 0) + (debtLong || 0) || null,
      debt_to_equity: equity ? (((debtCurrent || 0) + (debtLong || 0)) / equity) * 100 : null,
      current_ratio: null,
      quick_ratio: null,
      total_assets: assets,
      total_liabilities: liabilities,
      total_equity: equity,
    },
    cashflow: {
      operating_cashflow: opCashflow,
      free_cashflow: opCashflow != null && capex != null ? opCashflow - capex : null,
      capex,
    },
    analyst: {
      target_mean: null,
      target_high: null,
      target_low: null,
      recommendation_mean: null,
      analyst_count: null,
      strong_buy: null,
      buy: null,
      hold: null,
      sell: null,
      strong_sell: null,
    },
    price: {
      current: null,
      currency: 'USD',
      day_change_pct: null,
      week52_high: null,
      week52_low: null,
    },
  };
}

async function getNasdaqProfile(symbol: string) {
  const url = `https://api.nasdaq.com/api/company/${encodeURIComponent(symbol.toUpperCase())}/company-profile`;
  const r = await fetchWithTimeout(url, { headers: NASDAQ_HEADERS }, 10000);
  if (!r.ok) throw new Error(`nasdaq profile ${symbol} ${r.status}`);
  return await r.json();
}

async function getNasdaqSummary(symbol: string) {
  const url = `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol.toUpperCase())}/summary?assetclass=stocks`;
  const r = await fetchWithTimeout(url, { headers: NASDAQ_HEADERS }, 10000);
  if (!r.ok) throw new Error(`nasdaq summary ${symbol} ${r.status}`);
  return await r.json();
}

async function getNasdaqFinancials(symbol: string) {
  const dayKey = new Date().toISOString().slice(0, 10);
  return memo(`cache:nasdaq:financials:v1:${symbol.toUpperCase()}:${dayKey}`, async () => {
    const url = `https://api.nasdaq.com/api/company/${encodeURIComponent(symbol.toUpperCase())}/financials?frequency=1`;
    const r = await fetchWithTimeout(url, { headers: NASDAQ_HEADERS }, 10000);
    if (!r.ok) throw new Error(`nasdaq financials ${symbol} ${r.status}`);
    return await r.json();
  }, { ttlSec: 6 * 3600 });
}

function nasdaqRows(financials: any, table: 'incomeStatementTable' | 'balanceSheetTable' | 'cashFlowTable' | 'financialRatiosTable') {
  return financials?.data?.[table]?.rows || [];
}

function nasdaqHeaders(financials: any, table: 'incomeStatementTable' | 'balanceSheetTable' | 'cashFlowTable' | 'financialRatiosTable') {
  return financials?.data?.[table]?.headers || {};
}

function nasdaqRow(financials: any, table: 'incomeStatementTable' | 'balanceSheetTable' | 'cashFlowTable' | 'financialRatiosTable', label: string) {
  const normalized = label.toLowerCase();
  return nasdaqRows(financials, table).find((row: any) => String(row.value1 || '').trim().toLowerCase() === normalized) || null;
}

function nasdaqAmount(financials: any, table: 'incomeStatementTable' | 'balanceSheetTable' | 'cashFlowTable', label: string, col = 'value2') {
  return parseNasdaqFinancialAmount(nasdaqRow(financials, table, label)?.[col]);
}

function nasdaqPercent(financials: any, label: string, col = 'value2') {
  return parsePercentValue(nasdaqRow(financials, 'financialRatiosTable', label)?.[col]);
}

function nasdaqRatio(financials: any, label: string, col = 'value2') {
  return parseRatioValue(nasdaqRow(financials, 'financialRatiosTable', label)?.[col]);
}

function calcGrowth(current: number | null, previous: number | null) {
  if (current == null || previous == null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function blankFundamentals(symbol: string, yahooError: string) {
  return {
    source: 'Public market data',
    yahoo_error: yahooError,
    symbol,
    profile: {
      name: symbol,
      sector: null,
      industry: null,
      country: 'US',
      employees: null,
      summary: null,
    },
    valuation: {
      market_cap: null,
      pe_trailing: null,
      pe_forward: null,
      ps_trailing: null,
      pb: null,
      ev_ebitda: null,
      peg_ratio: null,
    },
    profitability: {
      gross_margin_pct: null,
      operating_margin_pct: null,
      profit_margin_pct: null,
      ebitda_margin_pct: null,
      roe_pct: null,
      roa_pct: null,
    },
    growth: {
      revenue_growth_yoy_pct: null,
      earnings_growth_yoy_pct: null,
    },
    balance_sheet: {
      total_cash: null,
      total_debt: null,
      debt_to_equity: null,
      current_ratio: null,
      quick_ratio: null,
    },
    cashflow: {
      operating_cashflow: null,
      free_cashflow: null,
    },
    analyst: {
      target_mean: null,
      target_high: null,
      target_low: null,
      recommendation_mean: null,
      analyst_count: null,
      strong_buy: null,
      buy: null,
      hold: null,
      sell: null,
      strong_sell: null,
    },
    price: {
      current: null,
      currency: 'USD',
      day_change_pct: null,
      week52_high: null,
      week52_low: null,
    },
  };
}

async function getPublicFundamentals(symbol: string, yahooError: string, futuQuote?: FutuQuoteSnapshot | null) {
  const [sec, nasdaqProfile, nasdaqSummary, nasdaqFinancials, stooqQuote] = await Promise.all([
    safe(() => getSecFundamentals(symbol, yahooError)),
    safe(() => getNasdaqProfile(symbol)),
    safe(() => getNasdaqSummary(symbol)),
    safe(() => getNasdaqFinancials(symbol)),
    safe(() => getStooqQuote(symbol)),
  ]);

  const base: any = sec || blankFundamentals(symbol, yahooError);
  const profile = nasdaqProfile?.data || {};
  const summary = nasdaqSummary?.data?.summaryData || {};
  const range52 = parseRange(summary.FiftTwoWeekHighLow);
  const previousClose = parseMoney(summary.PreviousClose);
  const currentPrice = futuQuote?.current ?? stooqQuote?.current ?? previousClose;
  const latestRevenue = nasdaqAmount(nasdaqFinancials, 'incomeStatementTable', 'Total Revenue');
  const previousRevenue = nasdaqAmount(nasdaqFinancials, 'incomeStatementTable', 'Total Revenue', 'value3');
  const latestNetIncome = nasdaqAmount(nasdaqFinancials, 'incomeStatementTable', 'Net Income');
  const previousNetIncome = nasdaqAmount(nasdaqFinancials, 'incomeStatementTable', 'Net Income', 'value3');
  const operatingIncome = nasdaqAmount(nasdaqFinancials, 'incomeStatementTable', 'Operating Income');
  const grossProfit = nasdaqAmount(nasdaqFinancials, 'incomeStatementTable', 'Gross Profit');
  const totalAssets = nasdaqAmount(nasdaqFinancials, 'balanceSheetTable', 'Total Assets');
  const totalLiabilities = nasdaqAmount(nasdaqFinancials, 'balanceSheetTable', 'Total Liabilities');
  const totalEquity = nasdaqAmount(nasdaqFinancials, 'balanceSheetTable', 'Total Equity');
  const cash = nasdaqAmount(nasdaqFinancials, 'balanceSheetTable', 'Cash and Cash Equivalents');
  const shortDebt = nasdaqAmount(nasdaqFinancials, 'balanceSheetTable', 'Short-Term Debt / Current Portion of Long-Term Debt') || 0;
  const longDebt = nasdaqAmount(nasdaqFinancials, 'balanceSheetTable', 'Long-Term Debt') || 0;
  const operatingCashflow = nasdaqAmount(nasdaqFinancials, 'cashFlowTable', 'Net Cash Flow-Operating');
  const capex = nasdaqAmount(nasdaqFinancials, 'cashFlowTable', 'Capital Expenditures');
  const marketCap = parseMoney(summary.MarketCap) ?? base.valuation?.market_cap;

  return mergeFutuFundamentals({
    ...base,
    source: [
      nasdaqProfile || nasdaqSummary ? 'Nasdaq public profile/summary' : null,
      nasdaqFinancials ? 'Nasdaq annual financials' : null,
      stooqQuote ? 'Stooq quote' : null,
      sec ? 'SEC companyfacts' : null,
    ].filter(Boolean).join(' + ') || 'Public market data',
    profile: {
      ...base.profile,
      name: valueOf(profile.CompanyName) || base.profile?.name || symbol,
      sector: valueOf(profile.Sector) || valueOf(summary.Sector) || base.profile?.sector,
      industry: valueOf(profile.Industry) || valueOf(summary.Industry) || base.profile?.industry,
      country: valueOf(profile.Region) || base.profile?.country || 'US',
      summary: valueOf(profile.CompanyDescription) || base.profile?.summary,
      website: valueOf(profile.CompanyUrl) || null,
      exchange: valueOf(summary.Exchange) || null,
    },
    valuation: {
      ...base.valuation,
      market_cap: marketCap,
      pe_trailing: marketCap && latestNetIncome ? marketCap / latestNetIncome : base.valuation?.pe_trailing,
      ps_trailing: marketCap && latestRevenue ? marketCap / latestRevenue : base.valuation?.ps_trailing,
      pb: marketCap && totalEquity ? marketCap / totalEquity : base.valuation?.pb,
    },
    profitability: {
      ...base.profitability,
      gross_margin_pct: nasdaqPercent(nasdaqFinancials, 'Gross Margin') ?? (latestRevenue && grossProfit ? (grossProfit / latestRevenue) * 100 : base.profitability?.gross_margin_pct),
      operating_margin_pct: nasdaqPercent(nasdaqFinancials, 'Operating Margin') ?? (latestRevenue && operatingIncome ? (operatingIncome / latestRevenue) * 100 : base.profitability?.operating_margin_pct),
      profit_margin_pct: nasdaqPercent(nasdaqFinancials, 'Profit Margin') ?? (latestRevenue && latestNetIncome ? (latestNetIncome / latestRevenue) * 100 : base.profitability?.profit_margin_pct),
      roe_pct: nasdaqPercent(nasdaqFinancials, 'After Tax ROE') ?? (totalEquity && latestNetIncome ? (latestNetIncome / totalEquity) * 100 : base.profitability?.roe_pct),
    },
    growth: {
      ...base.growth,
      revenue_growth_yoy_pct: calcGrowth(latestRevenue, previousRevenue) ?? base.growth?.revenue_growth_yoy_pct,
      earnings_growth_yoy_pct: calcGrowth(latestNetIncome, previousNetIncome) ?? base.growth?.earnings_growth_yoy_pct,
    },
    balance_sheet: {
      ...base.balance_sheet,
      total_cash: cash ?? base.balance_sheet?.total_cash,
      total_debt: shortDebt + longDebt || base.balance_sheet?.total_debt,
      debt_to_equity: totalEquity && (shortDebt + longDebt) ? ((shortDebt + longDebt) / totalEquity) * 100 : base.balance_sheet?.debt_to_equity,
      current_ratio: nasdaqRatio(nasdaqFinancials, 'Current Ratio') ?? base.balance_sheet?.current_ratio,
      quick_ratio: nasdaqRatio(nasdaqFinancials, 'Quick Ratio') ?? base.balance_sheet?.quick_ratio,
      total_assets: totalAssets ?? base.balance_sheet?.total_assets,
      total_liabilities: totalLiabilities ?? base.balance_sheet?.total_liabilities,
      total_equity: totalEquity ?? base.balance_sheet?.total_equity,
    },
    cashflow: {
      ...base.cashflow,
      operating_cashflow: operatingCashflow ?? base.cashflow?.operating_cashflow,
      free_cashflow: operatingCashflow != null && capex != null ? operatingCashflow + capex : base.cashflow?.free_cashflow,
      capex: capex ?? base.cashflow?.capex,
    },
    analyst: {
      ...base.analyst,
      target_mean: parseMoney(summary.OneYrTarget) ?? base.analyst?.target_mean,
    },
    price: {
      ...base.price,
      current: currentPrice ?? base.price?.current,
      currency: 'USD',
      previous_close: futuQuote?.previous_close ?? previousClose,
      day_change_pct: currentPrice != null && (futuQuote?.previous_close ?? previousClose) ? ((currentPrice - (futuQuote?.previous_close ?? previousClose)!) / (futuQuote?.previous_close ?? previousClose)!) * 100 : base.price?.day_change_pct,
      week52_high: range52.high ?? base.price?.week52_high,
      week52_low: range52.low ?? base.price?.week52_low,
      latest_quote_time: futuQuote?.update_time ?? (stooqQuote?.date ? `${stooqQuote.date} ${stooqQuote.time || ''}`.trim() : null),
      volume: futuQuote?.volume ?? stooqQuote?.volume ?? parseMoney(summary.ShareVolume),
      average_volume: parseMoney(summary.AverageVolume),
    },
  }, futuQuote);
}

export async function getStatement(
  symbol: string,
  type: 'income' | 'balance' | 'cashflow',
  freq: 'annual' | 'quarterly' = 'annual',
) {
  const dayKey = new Date().toISOString().slice(0, 10);
  const parsed = parseTicker(symbol);
  const cacheKey = `cache:statement:v4:${parsed.symbol}:${type}:${freq}:${dayKey}`;
  return memo(cacheKey, async () => {
    if (parsed.market === 'CRYPTO') return [];
    if (parsed.market === 'HK' || parsed.market === 'CN_SH' || parsed.market === 'CN_SZ') {
      try {
        return await localTimeout(`eastmoney ${type} statement`, () => getEastmoneyStatement(parsed.symbol, type), 7000);
      } catch {}
      try {
        return await localTimeout(`yahoo ${type} statement`, () => getYahooStatement(parsed.yahooSymbol, type, freq), 4500);
      } catch {
        return [];
      }
    }
    try {
      return await localTimeout(`nasdaq ${type} statement`, () => getNasdaqStatement(symbol, type), 7000);
    } catch {}
    try {
      return await localTimeout(`yahoo ${type} statement`, () => getYahooStatement(symbol, type, freq), 4500);
    } catch {
      return await localTimeout(`sec ${type} statement`, () => getSecStatement(symbol, type), 8500);
    }
  }, { ttlSec: 6 * 3600 });
}

async function getNasdaqStatement(
  symbol: string,
  type: 'income' | 'balance' | 'cashflow',
) {
  const financials = await getNasdaqFinancials(symbol);
  const table = type === 'income'
    ? 'incomeStatementTable'
    : type === 'balance'
      ? 'balanceSheetTable'
      : 'cashFlowTable';
  const headers = nasdaqHeaders(financials, table);
  const columns = ['value2', 'value3', 'value4', 'value5'];

  const rows = columns.map((col) => {
    if (type === 'income') {
      return {
        endDate: headers[col],
        totalRevenue: nasdaqAmount(financials, table, 'Total Revenue', col),
        revenue: nasdaqAmount(financials, table, 'Total Revenue', col),
        grossProfit: nasdaqAmount(financials, table, 'Gross Profit', col),
        operatingIncome: nasdaqAmount(financials, table, 'Operating Income', col),
        netIncome: nasdaqAmount(financials, table, 'Net Income', col),
      };
    }
    if (type === 'balance') {
      const shortDebt = nasdaqAmount(financials, table, 'Short-Term Debt / Current Portion of Long-Term Debt', col) || 0;
      const longDebt = nasdaqAmount(financials, table, 'Long-Term Debt', col) || 0;
      return {
        endDate: headers[col],
        totalAssets: nasdaqAmount(financials, table, 'Total Assets', col),
        totalLiabilities: nasdaqAmount(financials, table, 'Total Liabilities', col),
        stockholdersEquity: nasdaqAmount(financials, table, 'Total Equity', col),
        cash: nasdaqAmount(financials, table, 'Cash and Cash Equivalents', col),
        totalDebt: shortDebt + longDebt || null,
      };
    }
    const operatingCashflow = nasdaqAmount(financials, table, 'Net Cash Flow-Operating', col);
    const capex = nasdaqAmount(financials, table, 'Capital Expenditures', col);
    return {
      endDate: headers[col],
      operatingCashflow,
      capex,
      freeCashflow: operatingCashflow != null && capex != null ? operatingCashflow + capex : null,
    };
  });

  return rows.filter(row => row.endDate);
}

async function getYahooStatement(
  symbol: string,
  type: 'income' | 'balance' | 'cashflow',
  freq: 'annual' | 'quarterly' = 'annual',
) {
  const moduleMap: Record<string, string> = {
    income:   freq === 'annual' ? 'incomeStatementHistory'  : 'incomeStatementHistoryQuarterly',
    balance:  freq === 'annual' ? 'balanceSheetHistory'     : 'balanceSheetHistoryQuarterly',
    cashflow: freq === 'annual' ? 'cashflowStatementHistory': 'cashflowStatementHistoryQuarterly',
  };
  const arrKey = type === 'income'  ? 'incomeStatementHistory'
              : type === 'balance' ? 'balanceSheetStatements'
              : 'cashflowStatements';

  const r: any = await yahooFinance.quoteSummary(symbol, {
    modules: [moduleMap[type]] as any,
  });

  const arr = r[moduleMap[type]]?.[arrKey] || [];
  return arr.slice(0, 4).map((p: any) => {
    const out: Record<string, any> = { endDate: p.endDate?.fmt ?? p.endDate };
    for (const [k, v] of Object.entries(p)) {
      if (k === 'endDate' || k === 'maxAge') continue;
      out[k] = num(v);
    }
    return out;
  });
}

async function getSecStatement(symbol: string, type: 'income' | 'balance' | 'cashflow') {
  const facts = await secCompanyFacts(symbol);

  const rows = Array.from({ length: 4 }, (_, i) => {
    if (type === 'income') {
      const rev = annualFacts(facts, ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet'])[i];
      const op = annualFacts(facts, ['OperatingIncomeLoss'])[i];
      const ni = annualFacts(facts, ['NetIncomeLoss', 'ProfitLoss'])[i];
      return {
        endDate: rev?.end || op?.end || ni?.end,
        revenue: rev?.val ?? null,
        operatingIncome: op?.val ?? null,
        netIncome: ni?.val ?? null,
      };
    }
    if (type === 'balance') {
      const assets = annualFacts(facts, ['Assets'])[i];
      const liabilities = annualFacts(facts, ['Liabilities'])[i];
      const equity = annualFacts(facts, ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'])[i];
      const cash = annualFacts(facts, ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'])[i];
      return {
        endDate: assets?.end || liabilities?.end || equity?.end,
        totalAssets: assets?.val ?? null,
        totalLiabilities: liabilities?.val ?? null,
        stockholdersEquity: equity?.val ?? null,
        cash: cash?.val ?? null,
      };
    }
    const ocf = annualFacts(facts, ['NetCashProvidedByUsedInOperatingActivities'])[i];
    const capex = annualFacts(facts, ['PaymentsToAcquirePropertyPlantAndEquipment'])[i];
    return {
      endDate: ocf?.end || capex?.end,
      operatingCashflow: ocf?.val ?? null,
      capex: capex?.val ?? null,
      freeCashflow: ocf?.val != null && capex?.val != null ? ocf.val - capex.val : null,
    };
  });

  return rows.filter(r => r.endDate);
}
