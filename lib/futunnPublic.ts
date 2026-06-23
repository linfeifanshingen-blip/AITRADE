import { parseTicker } from './markets';
import type { FutuQuoteSnapshot } from './futu';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36';

function stockPath(symbol: string) {
  const parsed = parseTicker(symbol);
  if (parsed.market === 'HK') return `${parsed.code}-HK`;
  if (parsed.market === 'CN_SH') return `${parsed.code}-SH`;
  if (parsed.market === 'CN_SZ') return `${parsed.code}-SZ`;
  return `${parsed.code}-US`;
}

function parsePlainNumber(value: any) {
  const raw = String(value ?? '').replace(/[,%+,]/g, '').trim();
  if (!raw || raw === '--') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function parseCnAmount(value: any) {
  const raw = String(value ?? '').replace(/,/g, '').trim();
  if (!raw || raw === '--') return null;
  const sign = raw.startsWith('-') ? -1 : 1;
  const clean = raw.replace(/^[+-]/, '');
  const unit = clean.endsWith('亿') ? 1e8 : clean.endsWith('万') ? 1e4 : 1;
  const n = Number(clean.replace(/[亿万]/g, ''));
  return Number.isFinite(n) ? sign * n * unit : null;
}

function extractInitialState(html: string) {
  const marker = 'window.__INITIAL_STATE__=';
  const start = html.indexOf(marker);
  if (start < 0) throw new Error('futunn initial state missing');
  const jsonStart = start + marker.length;
  let inString = false;
  let escaped = false;
  let depth = 0;
  for (let i = jsonStart; i < html.length; i += 1) {
    const ch = html[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(html.slice(jsonStart, i + 1));
      }
    }
  }
  throw new Error('futunn initial state parse failed');
}

function extractChallengeScript(html: string) {
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  return match?.[1] || '';
}

function generateWafCookie(challengeHtml: string) {
  const script = extractChallengeScript(challengeHtml);
  if (!/wafToken=/.test(script) || !/futunn_quote_web/.test(script) || script.length > 30_000) {
    throw new Error('futunn waf challenge not recognized');
  }

  const previous = {
    window: (globalThis as any).window,
    document: (globalThis as any).document,
    sessionStorage: (globalThis as any).sessionStorage,
    location: (globalThis as any).location,
    console: (globalThis as any).console,
  };
  let cookie = '';
  const store = new Map<string, string>();

  try {
    (globalThis as any).sessionStorage = {
      getItem: (key: string) => store.get(key) || null,
      setItem: (key: string, value: string) => store.set(key, String(value)),
    };
    (globalThis as any).document = {
      get cookie() { return cookie; },
      set cookie(value: string) { cookie = value; },
    };
    (globalThis as any).location = { href: '', reload() {} };
    (globalThis as any).window = globalThis;
    (globalThis as any).console = { log() {}, error() {} };

    // The challenge is the same JavaScript a browser executes before reloading.
    // Keep it guarded to Futunn challenge pages only.
    new Function(script)();
  } finally {
    (globalThis as any).window = previous.window;
    (globalThis as any).document = previous.document;
    (globalThis as any).sessionStorage = previous.sessionStorage;
    (globalThis as any).location = previous.location;
    (globalThis as any).console = previous.console;
  }

  if (!/^wafToken=/.test(cookie)) throw new Error('futunn waf cookie empty');
  return cookie;
}

async function fetchHtml(url: string, cookie?: string) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml',
      Referer: 'https://www.futunn.com/quote',
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
  if (!response.ok) throw new Error(`futunn web HTTP ${response.status}`);
  return response.text();
}

export async function getFutunnWebQuoteSnapshot(symbol: string): Promise<FutuQuoteSnapshot> {
  const parsed = parseTicker(symbol);
  const url = `https://www.futunn.com/stock/${encodeURIComponent(stockPath(symbol))}`;
  let html = await fetchHtml(url);

  if (!html.includes('window.__INITIAL_STATE__') && html.includes('wafToken=')) {
    const cookie = generateWafCookie(html);
    html = await fetchHtml(url, cookie);
  }

  const state = extractInitialState(html);
  const info = state?.stock_info;
  if (!info?.stockCode) throw new Error(`futunn web quote ${parsed.symbol} empty`);

  return {
    source: 'Futunn Web',
    symbol: parsed.symbol,
    name: info.name || null,
    current: parsePlainNumber(info.priceNominal),
    previous_close: parsePlainNumber(info.priceLastClose),
    day_change_pct: parsePlainNumber(info.changeRatio),
    open: parsePlainNumber(info.priceOpen),
    high: parsePlainNumber(info.priceHighest),
    low: parsePlainNumber(info.priceLowest),
    volume: parseCnAmount(info.volume),
    turnover: parseCnAmount(info.turnover),
    turnover_rate_pct: parsePlainNumber(info.ratioTurnover),
    market_cap: parseCnAmount(info.totalMarketCap),
    pe_ttm: parsePlainNumber(info.peTtm),
    pb: parsePlainNumber(info.pbRatio),
    eps: parsePlainNumber(info.epsTtm),
    update_time: info.exchangeDataTimeMs ? new Date(Number(info.exchangeDataTimeMs)).toISOString() : null,
    exchange_market: info.marketLabel || parsed.market,
    currency: parsed.currency,
  };
}
