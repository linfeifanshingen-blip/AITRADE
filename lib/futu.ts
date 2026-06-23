import type { PriceBar } from './prices';
import { parseTicker } from './markets';
import net from 'node:net';

const FUTU_MARKET = {
  HK: 1,
  US: 11,
  CN_SH: 21,
  CN_SZ: 22,
};

const FUTU_KL_DAY = 2;
const FUTU_REHAB = {
  none: 0,
  forward: 1,
  backward: 2,
};

const FUTU_FIELDS = 1 | 2 | 4 | 8 | 32;
const FUTU_FAILURE_COOLDOWN_MS = 30_000;

interface FutuSecurity {
  market: number;
  code: string;
}

let futuUnavailableUntil = 0;
let lastFutuConnectionError: string | null = null;

export interface FutuQuoteSnapshot {
  source: 'Futu OpenD' | 'Futunn Web' | 'Eastmoney';
  symbol: string;
  name?: string | null;
  current?: number | null;
  previous_close?: number | null;
  day_change_pct?: number | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  volume?: number | null;
  turnover?: number | null;
  turnover_rate_pct?: number | null;
  week52_high?: number | null;
  week52_low?: number | null;
  market_cap?: number | null;
  pe_ttm?: number | null;
  pb?: number | null;
  eps?: number | null;
  update_time?: string | null;
  list_time?: string | null;
  exchange_market?: number | string | null;
  currency?: string | null;
}

function boolEnv(value: string | undefined, fallback = false) {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function futuProviderMode() {
  return String(process.env.PRICE_PROVIDER || 'auto').trim().toLowerCase();
}

export function isFutuPriceEnabled() {
  const mode = futuProviderMode();
  return mode === 'futu' || mode === 'futu-only' || boolEnv(process.env.FUTU_ENABLED);
}

export function isFutuPriceRequired() {
  return futuProviderMode() === 'futu-only';
}

function futuConfig() {
  const port = Number(process.env.FUTU_WS_PORT || process.env.FUTU_OPEND_PORT || 8080);
  return {
    host: process.env.FUTU_WS_HOST || process.env.FUTU_OPEND_HOST || '127.0.0.1',
    port: Number.isFinite(port) ? port : 8080,
    ssl: boolEnv(process.env.FUTU_WS_SSL, false),
    key: process.env.FUTU_WS_KEY || process.env.FUTU_OPEND_KEY || undefined,
    timeoutMs: Number(process.env.FUTU_TIMEOUT_MS || 5000),
    rehabType: FUTU_REHAB[String(process.env.FUTU_REHAB_TYPE || 'none').toLowerCase() as keyof typeof FUTU_REHAB] ?? FUTU_REHAB.none,
  };
}

function publicFutuConfig() {
  const config = futuConfig();
  return {
    host: config.host,
    port: config.port,
    ssl: config.ssl,
    hasKey: Boolean(config.key),
    timeoutMs: config.timeoutMs,
    rehabType: config.rehabType,
  };
}

function probeTcp(host: string, port: number, timeoutMs = 500): Promise<boolean> {
  return new Promise(resolve => {
    const socket = net.createConnection({ host, port });
    const done = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

async function assertFutuGatewayReachable() {
  const config = futuConfig();
  if (Date.now() < futuUnavailableUntil) {
    throw new Error(lastFutuConnectionError || `futu opend unavailable ${config.host}:${config.port}`);
  }
  const reachable = await probeTcp(config.host, config.port);
  if (!reachable) {
    lastFutuConnectionError = `futu opend not listening at ${config.host}:${config.port}`;
    futuUnavailableUntil = Date.now() + FUTU_FAILURE_COOLDOWN_MS;
    throw new Error(lastFutuConnectionError);
  }
}

function futuMarketOverride() {
  const market = String(process.env.FUTU_MARKET || '').trim().toUpperCase();
  if (market === 'HK') return FUTU_MARKET.HK;
  if (market === 'US') return FUTU_MARKET.US;
  if (market === 'SH' || market === 'SS' || market === 'CN_SH' || market === 'CNSH') return FUTU_MARKET.CN_SH;
  if (market === 'SZ' || market === 'CN_SZ' || market === 'CNSZ') return FUTU_MARKET.CN_SZ;
  return null;
}

function toFutuSecurity(symbol: string): FutuSecurity {
  const parsed = parseTicker(symbol);
  const override = parsed.market === 'US' ? futuMarketOverride() : null;
  const market = parsed.market === 'HK'
    ? FUTU_MARKET.HK
    : parsed.market === 'CN_SH'
      ? FUTU_MARKET.CN_SH
      : parsed.market === 'CN_SZ'
        ? FUTU_MARKET.CN_SZ
        : FUTU_MARKET.US;
  return { market: override || market, code: parsed.code };
}

function numberFromProto(value: any, fallback = 0) {
  if (value == null) return fallback;
  if (typeof value === 'number') return value;
  if (typeof value?.toNumber === 'function') return value.toNumber();
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function nullableNumber(value: any): number | null {
  const n = numberFromProto(value, NaN);
  return Number.isFinite(n) ? n : null;
}

function normalizeKLineTime(value: any) {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const timestamp = Number(raw);
  if (Number.isFinite(timestamp) && timestamp > 0) {
    const ms = timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  return raw.slice(0, 10);
}

async function connectFutu() {
  const config = futuConfig();
  await assertFutuGatewayReachable();
  const mod = await import('futu-api');
  const Client = mod.default;
  const client = new Client();

  return new Promise<any>((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      closeFutu(client);
      reject(new Error(`futu opend timeout ${config.host}:${config.port}`));
    }, config.timeoutMs);

    client.onlogin = (ok: boolean, msg: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (ok) {
        resolve(client);
      } else {
        closeFutu(client);
        reject(new Error(`futu opend login failed: ${String(msg)}`));
      }
    };

    try {
      client.start(config.host, config.port, config.ssl, config.key);
    } catch (error: any) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      closeFutu(client);
      reject(error);
    }
  });
}

export async function getFutuConnectionStatus(options: { login?: boolean } = {}) {
  const enabled = isFutuPriceEnabled();
  const config = futuConfig();
  const tcpReachable = await probeTcp(config.host, config.port, 800);
  const status: any = {
    enabled,
    required: isFutuPriceRequired(),
    mode: futuProviderMode(),
    config: publicFutuConfig(),
    tcpReachable,
    sdkLogin: null,
    message: tcpReachable
      ? 'Futu OpenD TCP gateway is reachable.'
      : `Futu OpenD is not listening at ${config.host}:${config.port}. Start Futu OpenD or change FUTU_WS_HOST/FUTU_WS_PORT.`,
    lastError: lastFutuConnectionError,
  };

  if (!enabled || !tcpReachable || !options.login) return status;

  try {
    const client = await connectFutu();
    closeFutu(client);
    status.sdkLogin = true;
    status.message = 'Futu OpenD SDK login succeeded.';
  } catch (error: any) {
    status.sdkLogin = false;
    status.message = error?.message || String(error);
  }
  return status;
}

function closeFutu(client: any) {
  try {
    client?.websock?.close?.();
  } catch {
    // The Futu SDK may already have closed the socket.
  }
  try {
    client?.stop?.();
  } catch {
    // Best-effort cleanup only.
  }
}

export async function getFutuPrices(symbol: string, startDate: string, endDate: string): Promise<PriceBar[]> {
  if (!isFutuPriceEnabled()) throw new Error('futu disabled');

  const config = futuConfig();
  const security = toFutuSecurity(symbol);
  const client = await connectFutu();
  const bars: PriceBar[] = [];
  let nextReqKey: any = undefined;

  try {
    for (let page = 0; page < 10; page += 1) {
      const response = await client.RequestHistoryKL({
        c2s: {
          rehabType: config.rehabType,
          klType: FUTU_KL_DAY,
          security,
          beginTime: startDate,
          endTime: endDate,
          maxAckKLNum: 1000,
          needKLFieldsFlag: FUTU_FIELDS,
          ...(nextReqKey ? { nextReqKey } : {}),
        },
      });

      const klList = response?.s2c?.klList || [];
      for (const item of klList) {
        if (item?.isBlank) continue;
        const date = normalizeKLineTime(item.time || item.timestamp);
        const ts = Math.floor(new Date(date + 'T00:00:00Z').getTime() / 1000);
        bars.push({
          date,
          ts,
          open: numberFromProto(item.openPrice, NaN),
          high: numberFromProto(item.highPrice, NaN),
          low: numberFromProto(item.lowPrice, NaN),
          close: numberFromProto(item.closePrice, NaN),
          volume: numberFromProto(item.volume, 0),
        });
      }

      nextReqKey = response?.s2c?.nextReqKey;
      if (!nextReqKey) break;
    }
  } finally {
    closeFutu(client);
  }

  const clean = bars
    .filter(bar => bar.date && Number.isFinite(bar.close))
    .sort((a, b) => a.ts - b.ts);

  if (!clean.length) throw new Error(`futu ${symbol} empty`);
  return clean;
}

export async function getFutuQuoteSnapshot(symbol: string): Promise<FutuQuoteSnapshot> {
  if (!isFutuPriceEnabled()) throw new Error('futu disabled');

  const security = toFutuSecurity(symbol);
  const client = await connectFutu();

  try {
    const [basicResult, snapshotResult, staticResult] = await Promise.allSettled([
      client.GetBasicQot({ c2s: { securityList: [security] } }),
      client.GetSecuritySnapshot({ c2s: { securityList: [security] } }),
      client.GetStaticInfo({ c2s: { securityList: [security] } }),
    ]);

    const basic = basicResult.status === 'fulfilled'
      ? basicResult.value?.s2c?.basicQotList?.[0]
      : null;
    const snapshot = snapshotResult.status === 'fulfilled'
      ? snapshotResult.value?.s2c?.snapshotList?.[0]
      : null;
    const staticInfo = staticResult.status === 'fulfilled'
      ? staticResult.value?.s2c?.staticInfoList?.[0]
      : null;
    const snapBasic = snapshot?.basic || {};
    const equity = snapshot?.equityExData || {};
    const staticBasic = staticInfo?.basic || {};
    const current = nullableNumber(snapBasic.curPrice ?? basic?.curPrice);
    const previousClose = nullableNumber(snapBasic.lastClosePrice ?? basic?.lastClosePrice);

    if (current == null && !basic && !snapshot && !staticInfo) {
      throw new Error(`futu quote ${symbol} empty`);
    }

    return {
      source: 'Futu OpenD',
      symbol,
      name: snapBasic.name || basic?.name || staticBasic.name || null,
      current,
      previous_close: previousClose,
      day_change_pct: current != null && previousClose ? ((current - previousClose) / previousClose) * 100 : null,
      open: nullableNumber(snapBasic.openPrice ?? basic?.openPrice),
      high: nullableNumber(snapBasic.highPrice ?? basic?.highPrice),
      low: nullableNumber(snapBasic.lowPrice ?? basic?.lowPrice),
      volume: nullableNumber(snapBasic.volume ?? basic?.volume),
      turnover: nullableNumber(snapBasic.turnover ?? basic?.turnover),
      turnover_rate_pct: nullableNumber(snapBasic.turnoverRate ?? basic?.turnoverRate),
      week52_high: nullableNumber(snapBasic.highest52WeeksPrice),
      week52_low: nullableNumber(snapBasic.lowest52WeeksPrice),
      market_cap: nullableNumber(equity.issuedMarketVal ?? equity.outstandingMarketVal),
      pe_ttm: nullableNumber(equity.peTTMRate ?? equity.peRate),
      pb: nullableNumber(equity.pbRate),
      eps: nullableNumber(equity.earningsPershare),
      update_time: snapBasic.updateTime || basic?.updateTime || null,
      list_time: snapBasic.listTime || basic?.listTime || staticBasic.listTime || null,
      exchange_market: security.market,
    };
  } finally {
    closeFutu(client);
  }
}
