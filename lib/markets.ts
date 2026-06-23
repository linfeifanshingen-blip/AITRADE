export type MarketCode = 'US' | 'HK' | 'CN_SH' | 'CN_SZ' | 'CRYPTO';

export interface ParsedTicker {
  input: string;
  symbol: string;
  market: MarketCode;
  code: string;
  yahooSymbol: string;
  eastmoneyCode: string;
  currency: 'USD' | 'HKD' | 'CNY';
}

const KNOWN_CRYPTO = new Set([
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'DOT',
  'MATIC', 'POL', 'TRX', 'TON', 'LTC', 'BCH', 'UNI', 'AAVE', 'ATOM', 'ETC',
  'FIL', 'NEAR', 'APT', 'SUI', 'ARB', 'OP', 'PEPE', 'SHIB', 'WIF', 'BONK',
  'ICP', 'INJ', 'SEI', 'RENDER', 'TAO', 'FET', 'ONDO', 'HYPE',
]);

export function parseTicker(input: string): ParsedTicker {
  const raw = String(input || '').trim().toUpperCase().replace(/\s+/g, '').replace(/[：:]/g, '.').replace(/^[A-Z]+:/, '').replace(/^\$/, '');

  const explicitCrypto = raw.match(/^([A-Z0-9]{2,12})(?:\.(CC|CRYPTO)|[-/](USDT|USD))$/);
  const cryptoSuffix = raw.match(/^([A-Z0-9]{2,12})(USDT|USD)$/);
  const cryptoCode = explicitCrypto?.[1] || (cryptoSuffix && KNOWN_CRYPTO.has(cryptoSuffix[1]) ? cryptoSuffix[1] : null) || (KNOWN_CRYPTO.has(raw) ? raw : null);
  if (cryptoCode) {
    return {
      input: raw,
      symbol: `${cryptoCode}.CC`,
      market: 'CRYPTO',
      code: cryptoCode,
      yahooSymbol: `${cryptoCode}-USD`,
      eastmoneyCode: `crypto:${cryptoCode.toLowerCase()}`,
      currency: 'USD',
    };
  }

  const hkMatch = raw.match(/^(\d{1,5})(?:\.(HK|HKG))?$/);
  if (hkMatch || raw.endsWith('.HK') || raw.endsWith('.HKG')) {
    const code = (hkMatch?.[1] || raw.replace(/\.(HK|HKG)$/i, '')).padStart(5, '0');
    return {
      input: raw,
      symbol: `${code}.HK`,
      market: 'HK',
      code,
      yahooSymbol: `${code}.HK`,
      eastmoneyCode: `hk${code}`,
      currency: 'HKD',
    };
  }

  const shMatch = raw.match(/^(\d{6})(?:\.(SH|SS|SHA|CNSH))?$/);
  if (shMatch && (raw.endsWith('.SH') || raw.endsWith('.SS') || raw.endsWith('.SHA') || raw.endsWith('.CNSH') || /^(5|6|9)/.test(shMatch[1]))) {
    const code = shMatch[1];
    return {
      input: raw,
      symbol: `${code}.SH`,
      market: 'CN_SH',
      code,
      yahooSymbol: `${code}.SS`,
      eastmoneyCode: `sh${code}`,
      currency: 'CNY',
    };
  }

  const szMatch = raw.match(/^(\d{6})(?:\.(SZ|SHE|CNSZ))?$/);
  if (szMatch && (raw.endsWith('.SZ') || raw.endsWith('.SHE') || raw.endsWith('.CNSZ') || /^(0|2|3)/.test(szMatch[1]))) {
    const code = szMatch[1];
    return {
      input: raw,
      symbol: `${code}.SZ`,
      market: 'CN_SZ',
      code,
      yahooSymbol: `${code}.SZ`,
      eastmoneyCode: `sz${code}`,
      currency: 'CNY',
    };
  }

  const code = raw
    .replace(/\.(US|NYSE|NASDAQ|AMEX)$/i, '')
    .replace(/-/g, '.');
  return {
    input: raw,
    symbol: code,
    market: 'US',
    code,
    yahooSymbol: code,
    eastmoneyCode: `us${code.toLowerCase()}`,
    currency: 'USD',
  };
}

export function marketForTicker(ticker: string): 'US' | 'HK' | 'CN' | 'CRYPTO' {
  const parsed = parseTicker(ticker);
  if (parsed.market === 'CRYPTO') return 'CRYPTO';
  if (parsed.market === 'HK') return 'HK';
  if (parsed.market === 'CN_SH' || parsed.market === 'CN_SZ') return 'CN';
  return 'US';
}
