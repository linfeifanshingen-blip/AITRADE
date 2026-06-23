/**
 * Stock price + technical indicator fetcher.
 *
 * Pattern: Yahoo Finance v8/chart direct fetch (no key, polite UA), TI computed
 * locally with `technicalindicators` npm.
 *
 * Replicates TradingAgents' yfinance-backed get_stock_data + get_indicators.
 */

import { SMA, EMA, MACD, RSI, BollingerBands, ATR, VWAP } from 'technicalindicators';
import { memo } from './cache';
import { getFutuPrices, isFutuPriceEnabled, isFutuPriceRequired } from './futu';
import { parseTicker } from './markets';
import { getEastmoneyPrices, isEastmoneySupported } from './eastmoney';
import { getBinanceKlines, getCryptoCompareDailyPrices } from './crypto';

const YF_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart';
const UA = 'Mozilla/5.0 (silicon-trader/0.1)';

async function fetchWithTimeout(input: string | URL, init: RequestInit = {}, timeoutMs = 9000) {
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

export interface PriceBar {
  date: string;       // YYYY-MM-DD
  ts: number;         // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function getStockPrices(
  symbol: string,
  startDate: string,
  endDate: string,
): Promise<PriceBar[]> {
  const parsed = parseTicker(symbol);
  const cacheKey = `cache:prices:${parsed.symbol}:${startDate}:${endDate}`;
  return memo(cacheKey, async () => {
    const errors: string[] = [];

    if (parsed.market === 'CRYPTO') {
      try {
        return await getBinanceKlines(parsed.symbol, startDate, endDate);
      } catch (binanceError: any) {
        errors.push(`Binance ${binanceError?.message || binanceError}`);
      }
      try {
        return await getCryptoCompareDailyPrices(parsed.symbol, startDate, endDate);
      } catch (cryptoCompareError: any) {
        errors.push(`CryptoCompare ${cryptoCompareError?.message || cryptoCompareError}`);
      }
      try {
        return await getYahooPrices(parsed.yahooSymbol, startDate, endDate);
      } catch (yahooError: any) {
        errors.push(`Yahoo ${yahooError?.message || yahooError}`);
        throw new Error(`crypto price data failed for ${symbol}: ${errors.join('; ')}`);
      }
    }

    if (isFutuPriceEnabled()) {
      try {
        return await getFutuPrices(symbol, startDate, endDate);
      } catch (futuError: any) {
        errors.push(`Futu ${futuError?.message || futuError}`);
        if (isFutuPriceRequired()) {
          throw new Error(`price data failed for ${symbol}: ${errors.join('; ')}`);
        }
      }
    }

    if (isEastmoneySupported(symbol)) {
      try {
        return await getEastmoneyPrices(symbol, startDate, endDate);
      } catch (eastmoneyError: any) {
        errors.push(`Eastmoney ${eastmoneyError?.message || eastmoneyError}`);
      }
    }

    try {
      return await getYahooPrices(parsed.yahooSymbol, startDate, endDate);
    } catch (yahooError: any) {
      errors.push(`Yahoo ${yahooError?.message || yahooError}`);
      try {
        return await getNasdaqPrices(parsed.symbol, startDate, endDate);
      } catch (nasdaqError: any) {
        errors.push(`Nasdaq ${nasdaqError?.message || nasdaqError}`);
        try {
          return await getStooqPrices(parsed.symbol, startDate, endDate);
        } catch (stooqError: any) {
          errors.push(`Stooq ${stooqError?.message || stooqError}`);
          throw new Error(
            `price data failed for ${symbol}: ${errors.join('; ')}`
          );
        }
      }
    }
  });
}

async function getYahooPrices(symbol: string, startDate: string, endDate: string): Promise<PriceBar[]> {
    const t1 = Math.floor(new Date(startDate).getTime() / 1000);
    const t2 = Math.floor(new Date(endDate + 'T23:59:59').getTime() / 1000);
    const url = `${YF_CHART}/${encodeURIComponent(symbol)}?period1=${t1}&period2=${t2}&interval=1d`;
    const r = await fetchWithTimeout(url, { headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error(`yahoo ${symbol} ${r.status}`);
    const j = await r.json();
    const result = j?.chart?.result?.[0];
    if (!result) throw new Error(`yahoo ${symbol} empty`);
    const ts: number[] = result.timestamp || [];
    const q = result.indicators?.quote?.[0] || {};
    return ts.map((t, i) => ({
      date: new Date(t * 1000).toISOString().slice(0, 10),
      ts: t,
      open: q.open?.[i] ?? null,
      high: q.high?.[i] ?? null,
      low: q.low?.[i] ?? null,
      close: q.close?.[i] ?? null,
      volume: q.volume?.[i] ?? 0,
    })).filter(b => b.close != null) as PriceBar[];
}

function toYyyymmdd(date: string) {
  return date.replaceAll('-', '');
}

function stooqSymbol(symbol: string) {
  const s = symbol.trim().toLowerCase();
  if (s.includes('.') || s.includes('-')) return s.replace('-', '.');
  return `${s}.us`;
}

function parseCsvLine(line: string) {
  return line.split(',').map(x => x.trim());
}

async function getStooqPrices(symbol: string, startDate: string, endDate: string): Promise<PriceBar[]> {
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol(symbol))}&d1=${toYyyymmdd(startDate)}&d2=${toYyyymmdd(endDate)}&i=d`;
  const r = await fetchWithTimeout(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`stooq ${symbol} ${r.status}`);
  const csv = await r.text();
  const rows = csv.trim().split(/\r?\n/).slice(1);
  const bars = rows.map(line => {
    const [date, open, high, low, close, volume] = parseCsvLine(line);
    const ts = Math.floor(new Date(date + 'T00:00:00Z').getTime() / 1000);
    return {
      date,
      ts,
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume || 0),
    };
  }).filter(b => b.date && Number.isFinite(b.close));
  if (!bars.length) throw new Error(`stooq ${symbol} empty`);
  return bars;
}

function parseNasdaqNumber(value: string) {
  const n = Number(String(value || '').replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

function mmddyyyyToIso(value: string) {
  const [mm, dd, yyyy] = String(value).split('/');
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

async function getNasdaqPrices(symbol: string, startDate: string, endDate: string): Promise<PriceBar[]> {
  if (!/^[A-Z.=-]{1,10}$/i.test(symbol)) throw new Error(`nasdaq unsupported symbol ${symbol}`);
  const url = `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol.toUpperCase())}/historical?assetclass=stocks&fromdate=${startDate}&todate=${endDate}&limit=9999`;
  const r = await fetchWithTimeout(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
      Accept: 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      Origin: 'https://www.nasdaq.com',
      Referer: 'https://www.nasdaq.com/',
    },
  });
  if (!r.ok) throw new Error(`nasdaq ${symbol} ${r.status}`);
  const j = await r.json();
  const rows = j?.data?.tradesTable?.rows || [];
  const bars = rows.map((row: any) => {
    const date = mmddyyyyToIso(row.date);
    return {
      date,
      ts: Math.floor(new Date(date + 'T00:00:00Z').getTime() / 1000),
      open: parseNasdaqNumber(row.open),
      high: parseNasdaqNumber(row.high),
      low: parseNasdaqNumber(row.low),
      close: parseNasdaqNumber(row.close),
      volume: parseNasdaqNumber(row.volume),
    };
  }).filter((b: PriceBar) => b.date && Number.isFinite(b.close))
    .sort((a: PriceBar, b: PriceBar) => a.ts - b.ts);
  if (!bars.length) throw new Error(`nasdaq ${symbol} empty`);
  return bars;
}

export type IndicatorName =
  | '50_SMA' | '200_SMA' | '10_EMA'
  | 'MACD' | 'RSI'
  | 'BB_upper' | 'BB_middle' | 'BB_lower'
  | 'ATR' | 'VWMA';

export async function getIndicator(
  symbol: string,
  indicator: IndicatorName,
  currDate: string,
  lookBackDays = 60,
): Promise<{ indicator: IndicatorName; symbol: string; values: { date: string; value: number }[] }> {
  // Pull enough calendar history for the slowest indicator plus display rows.
  // 200 trading sessions routinely span well over 280 calendar days.
  const warmupCalendarDays = indicator === '200_SMA' ? 420 : 300;
  const start = new Date(new Date(currDate).getTime() - (lookBackDays + warmupCalendarDays) * 86400000)
    .toISOString().slice(0, 10);
  const bars = await getStockPrices(symbol, start, currDate);
  const closes = bars.map(b => b.close);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const volumes = bars.map(b => b.volume);
  const dates = bars.map(b => b.date);

  let series: number[] = [];
  let offset = 0;

  switch (indicator) {
    case '50_SMA':
      series = SMA.calculate({ period: 50, values: closes });
      offset = 49;
      break;
    case '200_SMA':
      series = SMA.calculate({ period: 200, values: closes });
      offset = 199;
      break;
    case '10_EMA':
      series = EMA.calculate({ period: 10, values: closes });
      offset = 9;
      break;
    case 'RSI':
      series = RSI.calculate({ period: 14, values: closes });
      offset = 14;
      break;
    case 'MACD': {
      const m = MACD.calculate({
        values: closes,
        fastPeriod: 12, slowPeriod: 26, signalPeriod: 9,
        SimpleMAOscillator: false, SimpleMASignal: false,
      });
      series = m.map(x => x.MACD ?? 0);
      offset = 25;
      break;
    }
    case 'BB_upper':
    case 'BB_middle':
    case 'BB_lower': {
      const bb = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes });
      const key = indicator === 'BB_upper' ? 'upper' : indicator === 'BB_lower' ? 'lower' : 'middle';
      series = bb.map(x => (x as any)[key]);
      offset = 19;
      break;
    }
    case 'ATR':
      series = ATR.calculate({ period: 14, high: highs, low: lows, close: closes });
      offset = 14;
      break;
    case 'VWMA': {
      // VWAP is not exactly VWMA; close approximation: rolling 20-period VWMA
      const period = 20;
      for (let i = period - 1; i < closes.length; i++) {
        let pv = 0, v = 0;
        for (let j = i - period + 1; j <= i; j++) { pv += closes[j] * volumes[j]; v += volumes[j]; }
        series.push(v ? pv / v : closes[i]);
      }
      offset = period - 1;
      break;
    }
  }

  const values = series.map((value, i) => ({ date: dates[offset + i], value }))
    .filter(p => Number.isFinite(p.value))
    .slice(-lookBackDays);

  return { indicator, symbol, values };
}
