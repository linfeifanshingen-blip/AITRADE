import type { PriceBar } from './prices';
import { parseTicker } from './markets';

const UA = 'Mozilla/5.0 (silicon-trader/0.1; crypto-public-data)';
const BINANCE_KLINES_URL = 'https://api.binance.com/api/v3/klines';
const COINGECKO_MARKETS_URL = 'https://api.coingecko.com/api/v3/coins/markets';
const COINGECKO_COINS_URL = 'https://api.coingecko.com/api/v3/coins';
const CRYPTOCOMPARE_HISTODAY_URL = 'https://min-api.cryptocompare.com/data/v2/histoday';
const CRYPTOCOMPARE_PRICE_URL = 'https://min-api.cryptocompare.com/data/pricemultifull';

export const CRYPTO_ASSETS: Record<string, { id: string; name: string; aliases: string[] }> = {
  BTC: { id: 'bitcoin', name: 'Bitcoin', aliases: ['BTC', '比特币', 'Bitcoin'] },
  ETH: { id: 'ethereum', name: 'Ethereum', aliases: ['ETH', '以太坊', 'Ethereum'] },
  SOL: { id: 'solana', name: 'Solana', aliases: ['SOL', 'Solana'] },
  BNB: { id: 'binancecoin', name: 'BNB', aliases: ['BNB', '币安币', 'Binance Coin'] },
  XRP: { id: 'ripple', name: 'XRP', aliases: ['XRP', '瑞波'] },
  DOGE: { id: 'dogecoin', name: 'Dogecoin', aliases: ['DOGE', '狗狗币', 'Dogecoin'] },
  ADA: { id: 'cardano', name: 'Cardano', aliases: ['ADA', 'Cardano'] },
  AVAX: { id: 'avalanche-2', name: 'Avalanche', aliases: ['AVAX', 'Avalanche'] },
  LINK: { id: 'chainlink', name: 'Chainlink', aliases: ['LINK', 'Chainlink'] },
  DOT: { id: 'polkadot', name: 'Polkadot', aliases: ['DOT', 'Polkadot'] },
  TRX: { id: 'tron', name: 'TRON', aliases: ['TRX', 'TRON'] },
  TON: { id: 'the-open-network', name: 'Toncoin', aliases: ['TON', 'Toncoin'] },
  LTC: { id: 'litecoin', name: 'Litecoin', aliases: ['LTC', 'Litecoin'] },
  BCH: { id: 'bitcoin-cash', name: 'Bitcoin Cash', aliases: ['BCH', 'Bitcoin Cash'] },
  UNI: { id: 'uniswap', name: 'Uniswap', aliases: ['UNI', 'Uniswap'] },
  AAVE: { id: 'aave', name: 'Aave', aliases: ['AAVE', 'Aave'] },
  ATOM: { id: 'cosmos', name: 'Cosmos', aliases: ['ATOM', 'Cosmos'] },
  ETC: { id: 'ethereum-classic', name: 'Ethereum Classic', aliases: ['ETC', 'Ethereum Classic'] },
  FIL: { id: 'filecoin', name: 'Filecoin', aliases: ['FIL', 'Filecoin'] },
  NEAR: { id: 'near', name: 'NEAR Protocol', aliases: ['NEAR', 'NEAR Protocol'] },
  APT: { id: 'aptos', name: 'Aptos', aliases: ['APT', 'Aptos'] },
  SUI: { id: 'sui', name: 'Sui', aliases: ['SUI', 'Sui'] },
  ARB: { id: 'arbitrum', name: 'Arbitrum', aliases: ['ARB', 'Arbitrum'] },
  OP: { id: 'optimism', name: 'Optimism', aliases: ['OP', 'Optimism'] },
  PEPE: { id: 'pepe', name: 'Pepe', aliases: ['PEPE', 'Pepe'] },
  SHIB: { id: 'shiba-inu', name: 'Shiba Inu', aliases: ['SHIB', 'Shiba Inu', '柴犬币'] },
  WIF: { id: 'dogwifcoin', name: 'dogwifhat', aliases: ['WIF', 'dogwifhat'] },
  BONK: { id: 'bonk', name: 'Bonk', aliases: ['BONK', 'Bonk'] },
  ICP: { id: 'internet-computer', name: 'Internet Computer', aliases: ['ICP', 'Internet Computer'] },
  INJ: { id: 'injective-protocol', name: 'Injective', aliases: ['INJ', 'Injective'] },
  SEI: { id: 'sei-network', name: 'Sei', aliases: ['SEI', 'Sei'] },
  RENDER: { id: 'render-token', name: 'Render', aliases: ['RENDER', 'Render'] },
  TAO: { id: 'bittensor', name: 'Bittensor', aliases: ['TAO', 'Bittensor'] },
  FET: { id: 'fetch-ai', name: 'Artificial Superintelligence Alliance', aliases: ['FET', 'Fetch.ai', 'ASI'] },
  ONDO: { id: 'ondo-finance', name: 'Ondo', aliases: ['ONDO', 'Ondo'] },
  HYPE: { id: 'hyperliquid', name: 'Hyperliquid', aliases: ['HYPE', 'Hyperliquid'] },
};

async function fetchWithTimeout(input: string | URL, init: RequestInit = {}, timeoutMs = 9000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      headers: {
        'User-Agent': UA,
        Accept: 'application/json,text/plain,*/*',
        ...(init.headers || {}),
      },
      signal: init.signal || controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function getCryptoAsset(symbol: string) {
  const parsed = parseTicker(symbol);
  if (parsed.market !== 'CRYPTO') return null;
  const meta = CRYPTO_ASSETS[parsed.code] || {
    id: parsed.code.toLowerCase(),
    name: parsed.code,
    aliases: [parsed.code],
  };
  return { ...meta, symbol: parsed.symbol, code: parsed.code };
}

export async function getBinanceKlines(symbol: string, startDate: string, endDate: string): Promise<PriceBar[]> {
  const asset = getCryptoAsset(symbol);
  if (!asset) throw new Error(`binance unsupported symbol ${symbol}`);
  const url = new URL(BINANCE_KLINES_URL);
  url.searchParams.set('symbol', `${asset.code}USDT`);
  url.searchParams.set('interval', '1d');
  url.searchParams.set('startTime', String(new Date(startDate + 'T00:00:00Z').getTime()));
  url.searchParams.set('endTime', String(new Date(endDate + 'T23:59:59Z').getTime()));
  url.searchParams.set('limit', '1000');
  const r = await fetchWithTimeout(url, {}, 8000);
  if (!r.ok) throw new Error(`binance ${asset.code}USDT ${r.status}`);
  const rows = await r.json();
  if (!Array.isArray(rows) || !rows.length) throw new Error(`binance ${asset.code}USDT empty`);
  return rows.map((row: any[]) => ({
    date: new Date(Number(row[0])).toISOString().slice(0, 10),
    ts: Math.floor(Number(row[0]) / 1000),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
  })).filter((bar: PriceBar) => Number.isFinite(bar.close));
}

export async function getCryptoCompareDailyPrices(symbol: string, startDate: string, endDate: string): Promise<PriceBar[]> {
  const asset = getCryptoAsset(symbol);
  if (!asset) throw new Error(`cryptocompare unsupported symbol ${symbol}`);
  const startMs = new Date(startDate + 'T00:00:00Z').getTime();
  const endMs = new Date(endDate + 'T23:59:59Z').getTime();
  const days = Math.max(1, Math.ceil((endMs - startMs) / 86400000) + 1);
  const url = new URL(CRYPTOCOMPARE_HISTODAY_URL);
  url.searchParams.set('fsym', asset.code);
  url.searchParams.set('tsym', 'USD');
  url.searchParams.set('limit', String(Math.min(days, 2000)));
  url.searchParams.set('toTs', String(Math.floor(endMs / 1000)));
  const r = await fetchWithTimeout(url, {}, 8000);
  if (!r.ok) throw new Error(`cryptocompare histoday ${asset.code} ${r.status}`);
  const j = await r.json();
  const rows = j?.Data?.Data || [];
  if (!Array.isArray(rows) || !rows.length) throw new Error(`cryptocompare histoday ${asset.code} empty`);
  return rows.map((row: any) => ({
    date: new Date(Number(row.time) * 1000).toISOString().slice(0, 10),
    ts: Number(row.time),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volumeto ?? row.volumefrom ?? 0),
  })).filter((bar: PriceBar) => bar.date >= startDate && bar.date <= endDate && Number.isFinite(bar.close));
}

async function getCoinGeckoMarket(asset: ReturnType<typeof getCryptoAsset>) {
  if (!asset) return null;
  const url = new URL(COINGECKO_MARKETS_URL);
  url.searchParams.set('vs_currency', 'usd');
  url.searchParams.set('ids', asset.id);
  url.searchParams.set('price_change_percentage', '24h,7d,30d,1y');
  const r = await fetchWithTimeout(url, {}, 9000);
  if (!r.ok) throw new Error(`coingecko markets ${asset.id} ${r.status}`);
  const rows = await r.json();
  return Array.isArray(rows) ? rows[0] : null;
}

async function getCoinGeckoCoin(asset: ReturnType<typeof getCryptoAsset>) {
  if (!asset) return null;
  const url = new URL(`${COINGECKO_COINS_URL}/${encodeURIComponent(asset.id)}`);
  url.searchParams.set('localization', 'false');
  url.searchParams.set('tickers', 'false');
  url.searchParams.set('market_data', 'true');
  url.searchParams.set('community_data', 'true');
  url.searchParams.set('developer_data', 'true');
  url.searchParams.set('sparkline', 'false');
  const r = await fetchWithTimeout(url, {}, 9000);
  if (!r.ok) throw new Error(`coingecko coin ${asset.id} ${r.status}`);
  return await r.json();
}

async function getCryptoCompareSnapshot(asset: ReturnType<typeof getCryptoAsset>) {
  if (!asset) return null;
  const url = new URL(CRYPTOCOMPARE_PRICE_URL);
  url.searchParams.set('fsyms', asset.code);
  url.searchParams.set('tsyms', 'USD');
  const r = await fetchWithTimeout(url, {}, 8000);
  if (!r.ok) throw new Error(`cryptocompare price ${asset.code} ${r.status}`);
  const j = await r.json();
  return j?.RAW?.[asset.code]?.USD || null;
}

function num(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pct(value: any) {
  const n = num(value);
  return n == null ? null : n / 100;
}

export async function getCryptoFundamentals(symbol: string) {
  const asset = getCryptoAsset(symbol);
  if (!asset) throw new Error(`crypto fundamentals unsupported symbol ${symbol}`);
  const [market, coin, cryptoCompare] = await Promise.all([
    getCoinGeckoMarket(asset).catch(() => null),
    getCoinGeckoCoin(asset).catch(() => null),
    getCryptoCompareSnapshot(asset).catch(() => null),
  ]);
  const marketData = coin?.market_data || {};
  const current = num(market?.current_price ?? marketData.current_price?.usd ?? cryptoCompare?.PRICE);
  const change24h = pct(market?.price_change_percentage_24h_in_currency ?? market?.price_change_percentage_24h ?? marketData.price_change_percentage_24h ?? cryptoCompare?.CHANGEPCT24HOUR);
  const previousClose = current != null && change24h != null && change24h > -0.999
    ? current / (1 + change24h)
    : null;
  const homepage = (coin?.links?.homepage || []).find((x: string) => x) || null;

  return {
    source: [
      market || coin ? 'CoinGecko public crypto market data' : null,
      cryptoCompare ? 'CryptoCompare public market snapshot' : null,
      'Binance/CryptoCompare/Yahoo price routing',
    ].filter(Boolean).join(' + '),
    symbol: asset.symbol,
    profile: {
      name: market?.name || coin?.name || asset.name,
      sector: 'Crypto',
      industry: 'Digital asset',
      country: 'Global',
      summary: coin?.description?.en
        ? String(coin.description.en).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 900)
        : `${asset.name} (${asset.code}) digital asset. Crypto analysis emphasizes market cap, liquidity, supply schedule, exchange volume, regulation, ETF/institutional flows, protocol adoption, and on-chain narratives rather than GAAP financial statements.`,
      exchange: 'Crypto / 24x7 spot markets',
      website: homepage,
    },
    valuation: {
      market_cap: num(market?.market_cap ?? marketData.market_cap?.usd ?? cryptoCompare?.MKTCAP),
      fully_diluted_valuation: num(market?.fully_diluted_valuation ?? marketData.fully_diluted_valuation?.usd),
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
      price_change_24h_pct: change24h,
      price_change_7d_pct: pct(market?.price_change_percentage_7d_in_currency ?? marketData.price_change_percentage_7d),
      price_change_30d_pct: pct(market?.price_change_percentage_30d_in_currency ?? marketData.price_change_percentage_30d),
      price_change_1y_pct: pct(market?.price_change_percentage_1y_in_currency ?? marketData.price_change_percentage_1y),
      revenue_growth_yoy_pct: null,
      earnings_growth_yoy_pct: null,
    },
    balance_sheet: {
      circulating_supply: num(market?.circulating_supply ?? marketData.circulating_supply ?? cryptoCompare?.CIRCULATINGSUPPLY ?? cryptoCompare?.SUPPLY),
      total_supply: num(market?.total_supply ?? marketData.total_supply),
      max_supply: num(market?.max_supply ?? marketData.max_supply),
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
      current,
      currency: 'USD',
      previous_close: previousClose,
      day_change_pct: change24h,
      week52_high: num(marketData.high_24h?.usd ?? market?.high_24h ?? cryptoCompare?.HIGH24HOUR),
      week52_low: num(marketData.low_24h?.usd ?? market?.low_24h ?? cryptoCompare?.LOW24HOUR),
      all_time_high: num(market?.ath ?? marketData.ath?.usd),
      all_time_low: num(market?.atl ?? marketData.atl?.usd),
      volume: num(market?.total_volume ?? marketData.total_volume?.usd ?? cryptoCompare?.TOTALVOLUME24HTO ?? cryptoCompare?.VOLUME24HOURTO),
      turnover: num(market?.total_volume ?? marketData.total_volume?.usd ?? cryptoCompare?.TOTALVOLUME24HTO ?? cryptoCompare?.VOLUME24HOURTO),
      latest_quote_time: market?.last_updated || coin?.last_updated || (cryptoCompare?.LASTUPDATE ? new Date(Number(cryptoCompare.LASTUPDATE) * 1000).toISOString() : null),
      provider_priority: 'CoinGecko + CryptoCompare + Binance',
    },
    crypto: {
      coingecko_id: asset.id,
      symbol: asset.code,
      rank: num(market?.market_cap_rank ?? coin?.market_cap_rank),
      categories: coin?.categories || [],
      genesis_date: coin?.genesis_date || null,
      hashing_algorithm: coin?.hashing_algorithm || null,
      sentiment_votes_up_percentage: num(coin?.sentiment_votes_up_percentage),
      sentiment_votes_down_percentage: num(coin?.sentiment_votes_down_percentage),
      twitter_screen_name: coin?.links?.twitter_screen_name || null,
      subreddit_url: coin?.links?.subreddit_url || null,
      homepage,
    },
  };
}
