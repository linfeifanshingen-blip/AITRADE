import type { PriceBar } from './prices';
import { parseTicker } from './markets';
import dns from 'node:dns';

const EM_KLINE_URL = 'https://push2his.eastmoney.com/api/qt/stock/kline/get';
const EM_QUOTE_URL = 'https://push2.eastmoney.com/api/qt/stock/get';
const EM_F10_URL = 'https://datacenter.eastmoney.com/securities/api/data/get';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  // Best effort: Eastmoney often closes IPv6 sockets from local Node fetch.
}

function toYyyymmdd(date: string) {
  return date.replaceAll('-', '');
}

function eastmoneySecid(symbol: string) {
  const parsed = parseTicker(symbol);
  if (parsed.market === 'HK') return `116.${parsed.code}`;
  if (parsed.market === 'CN_SH') return `1.${parsed.code}`;
  if (parsed.market === 'CN_SZ') return `0.${parsed.code}`;
  throw new Error(`eastmoney unsupported market ${parsed.market}`);
}

function priceDivisor(symbol: string) {
  return parseTicker(symbol).market === 'HK' ? 1000 : 100;
}

async function fetchJson(input: string | URL, timeoutMs = 9000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(input, {
      headers: {
        'User-Agent': UA,
        Referer: 'https://quote.eastmoney.com/',
      },
      signal: controller.signal,
    });
    if (!r.ok) throw new Error(`eastmoney HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timeout);
  }
}

function reportDate(value: any) {
  const raw = String(value || '').trim();
  return raw ? raw.slice(0, 10) : null;
}

function finiteNumber(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function inferTotalAssets(totalLiabilities: number | null, debtAssetRatioPct: number | null) {
  if (totalLiabilities == null || debtAssetRatioPct == null || debtAssetRatioPct <= 0) return null;
  return totalLiabilities / (debtAssetRatioPct / 100);
}

function inferShareCount(netIncome: number | null, eps: number | null) {
  if (netIncome == null || eps == null || eps === 0) return null;
  return netIncome / eps;
}

function normalizeFinanceRow(row: any) {
  const totalRevenue = finiteNumber(row.TOTALOPERATEREVE);
  const grossProfit = finiteNumber(row.MLR);
  const netIncome = finiteNumber(row.PARENTNETPROFIT);
  const eps = finiteNumber(row.EPSJB);
  const totalLiabilities = finiteNumber(row.LIABILITY);
  const debtAssetRatioPct = finiteNumber(row.ZCFZL);
  const totalAssets = inferTotalAssets(totalLiabilities, debtAssetRatioPct);
  const totalEquity = totalAssets != null && totalLiabilities != null ? totalAssets - totalLiabilities : null;
  const shareCount = inferShareCount(netIncome, eps);
  const operatingCashflowPerShare = finiteNumber(row.MGJYXJJE);

  return {
    endDate: reportDate(row.REPORT_DATE),
    reportName: row.REPORT_DATE_NAME || row.REPORT_TYPE || null,
    noticeDate: reportDate(row.NOTICE_DATE),
    currency: row.CURRENCY || null,
    totalRevenue,
    grossProfit,
    parentNetProfit: netIncome,
    deductedParentNetProfit: finiteNumber(row.KCFJCXSYJLR),
    eps,
    bookValuePerShare: finiteNumber(row.BPS),
    revenueGrowthYoyPct: finiteNumber(row.TOTALOPERATEREVETZ),
    netProfitGrowthYoyPct: finiteNumber(row.PARENTNETPROFITTZ),
    roePct: finiteNumber(row.ROEJQ),
    roicPct: finiteNumber(row.ROIC),
    grossMarginPct: finiteNumber(row.XSMLL),
    netMarginPct: finiteNumber(row.XSJLL),
    debtAssetRatioPct,
    currentRatio: finiteNumber(row.LD),
    quickRatio: finiteNumber(row.SD),
    operatingCashflowPerShare,
    operatingCashflow: shareCount != null && operatingCashflowPerShare != null
      ? shareCount * operatingCashflowPerShare
      : null,
    totalAssets,
    totalLiabilities,
    totalEquity,
    staffNum: finiteNumber(row.STAFF_NUM),
    raw: row,
  };
}

export async function getEastmoneyFinancialSummary(symbol: string) {
  const parsed = parseTicker(symbol);
  if (parsed.market !== 'CN_SH' && parsed.market !== 'CN_SZ') {
    return { source: 'Eastmoney F10', symbol: parsed.symbol, rows: [], latest: null };
  }

  const url = new URL(EM_F10_URL);
  url.searchParams.set('type', 'RPT_F10_FINANCE_MAINFINADATA');
  url.searchParams.set('sty', 'APP_F10_MAINFINADATA');
  url.searchParams.set('filter', `(SECUCODE="${parsed.symbol}")`);
  url.searchParams.set('p', '1');
  url.searchParams.set('ps', '8');
  url.searchParams.set('sr', '-1');
  url.searchParams.set('st', 'REPORT_DATE');
  url.searchParams.set('source', 'HSF10');
  url.searchParams.set('client', 'PC');

  const j = await fetchJson(url, 9000);
  const rawRows = j?.result?.data || [];
  const rows = rawRows.map(normalizeFinanceRow).filter((row: any) => row.endDate);
  return {
    source: 'Eastmoney F10',
    symbol: parsed.symbol,
    rows,
    latest: rows[0] || null,
  };
}

export async function getEastmoneyStatement(
  symbol: string,
  type: 'income' | 'balance' | 'cashflow',
) {
  const summary = await getEastmoneyFinancialSummary(symbol);
  return summary.rows.map((row: any) => {
    if (type === 'income') {
      return {
        endDate: row.endDate,
        reportName: row.reportName,
        totalRevenue: row.totalRevenue,
        revenue: row.totalRevenue,
        grossProfit: row.grossProfit,
        operatingIncome: null,
        netIncome: row.parentNetProfit,
        deductedNetIncome: row.deductedParentNetProfit,
        eps: row.eps,
      };
    }
    if (type === 'balance') {
      return {
        endDate: row.endDate,
        reportName: row.reportName,
        totalAssets: row.totalAssets,
        totalLiabilities: row.totalLiabilities,
        stockholdersEquity: row.totalEquity,
        bookValuePerShare: row.bookValuePerShare,
        debtAssetRatioPct: row.debtAssetRatioPct,
      };
    }
    return {
      endDate: row.endDate,
      reportName: row.reportName,
      operatingCashflow: row.operatingCashflow,
      operatingCashflowPerShare: row.operatingCashflowPerShare,
      capex: null,
      freeCashflow: null,
    };
  });
}

export function isEastmoneySupported(symbol: string) {
  const market = parseTicker(symbol).market;
  return market === 'HK' || market === 'CN_SH' || market === 'CN_SZ';
}

export async function getEastmoneyPrices(symbol: string, startDate: string, endDate: string): Promise<PriceBar[]> {
  if (!isEastmoneySupported(symbol)) throw new Error(`eastmoney unsupported symbol ${symbol}`);

  const url = new URL(EM_KLINE_URL);
  url.searchParams.set('secid', eastmoneySecid(symbol));
  url.searchParams.set('fields1', 'f1,f2,f3,f4,f5,f6');
  url.searchParams.set('fields2', 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61');
  url.searchParams.set('klt', '101');
  url.searchParams.set('fqt', '1');
  url.searchParams.set('beg', toYyyymmdd(startDate));
  url.searchParams.set('end', toYyyymmdd(endDate));

  const j = await fetchJson(url);
  const rows: string[] = j?.data?.klines || [];
  const bars = rows.map(row => {
    const [date, open, close, high, low, volume] = row.split(',');
    return {
      date,
      ts: Math.floor(new Date(date + 'T00:00:00Z').getTime() / 1000),
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume || 0),
    };
  }).filter(bar => bar.date && Number.isFinite(bar.close));

  if (!bars.length) throw new Error(`eastmoney ${symbol} empty`);
  return bars;
}

function scaled(value: any, divisor: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > -1e10 ? n / divisor : null;
}

function nullableNumber(value: any) {
  const n = Number(value);
  return Number.isFinite(n) && n > -1e10 ? n : null;
}

export async function getEastmoneyQuoteSnapshot(symbol: string) {
  if (!isEastmoneySupported(symbol)) throw new Error(`eastmoney unsupported symbol ${symbol}`);

  const divisor = priceDivisor(symbol);
  const parsed = parseTicker(symbol);
  const url = new URL(EM_QUOTE_URL);
  url.searchParams.set('secid', eastmoneySecid(symbol));
  url.searchParams.set('fields', 'f43,f44,f45,f46,f47,f48,f57,f58,f60,f116,f162,f167,f168,f169,f170');

  const j = await fetchJson(url);
  const d = j?.data;
  if (!d) throw new Error(`eastmoney quote ${symbol} empty`);

  return {
    source: 'Eastmoney',
    symbol: parsed.symbol,
    name: d.f58 || null,
    current: scaled(d.f43, divisor),
    previous_close: scaled(d.f60, divisor),
    day_change_pct: scaled(d.f170, 100),
    open: scaled(d.f46, divisor),
    high: scaled(d.f44, divisor),
    low: scaled(d.f45, divisor),
    volume: nullableNumber(d.f47),
    turnover: nullableNumber(d.f48),
    turnover_rate_pct: scaled(d.f168, 100),
    market_cap: nullableNumber(d.f116),
    pe_ttm: nullableNumber(d.f162),
    pb: nullableNumber(d.f167),
    update_time: null,
    exchange_market: parsed.market,
    currency: parsed.currency,
  };
}
