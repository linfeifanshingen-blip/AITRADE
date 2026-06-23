/**
 * News and social data fetching.
 *
 * Tavily is used when TAVILY_API_KEY is configured. Without Tavily, we combine
 * public no-key fallbacks:
 *   - Google News RSS + Yahoo Finance search + GDELT DOC 2.0 for news
 *   - Stocktwits + Reddit public search for social signal
 *   - Optional xAI Grok X Search when XAI_API_KEY is configured
 *   - Optional finance APIs such as Alpha Vantage, Finnhub, Polygon, FMP, EODHD
 */

import { memo } from './cache';
import { searchCninfoAnnouncements } from './cninfo';
import { kvGet, kvSet } from './kv';
import { companySearchTerms, companySocialTerms, getCompanyProfile, quoteIfNeeded } from './company';
import { kolWatchlistForTicker } from './kol';
import { marketForTicker as inferMarketForTicker, parseTicker } from './markets';
import YahooFinance from 'yahoo-finance2';

const TAVILY_URL = 'https://api.tavily.com/search';
const XAI_RESPONSES_URL = 'https://api.x.ai/v1/responses';
const X_RECENT_SEARCH_URL = 'https://api.x.com/2/tweets/search/recent';
const REDDIT_TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const REDDIT_OAUTH_URL = 'https://oauth.reddit.com';
const DUCKDUCKGO_HTML_URL = 'https://duckduckgo.com/html/';
const GDELT_DOC_URL = 'https://api.gdeltproject.org/api/v2/doc/doc';
const GOOGLE_NEWS_RSS_URL = 'https://news.google.com/rss/search';
const NEWSAPI_EVERYTHING_URL = 'https://newsapi.org/v2/everything';
const BENZINGA_NEWS_URL = 'https://api.benzinga.com/api/v2/news';
const FMP_STABLE_URL = 'https://financialmodelingprep.com/stable';
const EODHD_API_URL = 'https://eodhd.com/api';
const NASDAQ_NEWS_URL = 'https://api.nasdaq.com/api/news/topic/articlebysymbol';
const HN_ALGOLIA_URL = 'https://hn.algolia.com/api/v1/search_by_date';
const UA = 'Mozilla/5.0 (silicon-trader/0.1; public-data-fallback)';
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

const FINANCIAL_DOMAINS = [
  'bloomberg.com', 'reuters.com', 'cnbc.com', 'ft.com', 'wsj.com',
  'seekingalpha.com', 'semianalysis.com', 'digitimes.com',
  'marketwatch.com', 'barrons.com', 'businesswire.com',
];

const CRYPTO_DOMAINS = [
  'coindesk.com', 'cointelegraph.com', 'theblock.co', 'decrypt.co',
  'coinmarketcap.com', 'coingecko.com', 'binance.com', 'coinbase.com',
  'kraken.com', 'glassnode.com',
];

const FUNDAMENTAL_RESEARCH_DOMAINS = [
  'hkexnews.hk', 'hkex.com.hk', 'irasia.com',
  'aastocks.com', 'etnet.com.hk', 'futunn.com',
  'finance.yahoo.com', 'reuters.com', 'bloomberg.com',
  'pdf.dfcfw.com', 'data.eastmoney.com', 'eastmoney.com',
  'sse.com.cn', 'szse.cn', 'bse.cn',
  ...CRYPTO_DOMAINS,
];

const SOCIAL_DOMAINS = [
  'reddit.com', 'twitter.com', 'x.com', 'stocktwits.com',
  'investorshub.advfn.com', 'wallstreetbets',
];

interface SearchItem {
  provider?: string;
  url: string;
  title: string;
  content: string;
  score: number;
  published_date?: string;
}

interface ProviderStat {
  provider: string;
  count: number;
  status: 'ok' | 'empty' | 'skipped' | 'error';
  detail?: string;
}

interface SearchResult {
  disabled: boolean;
  query: string;
  items: SearchItem[];
  count: number;
  providers?: ProviderStat[];
}

let redditTokenCache: { token: string; expiresAt: number } | null = null;

async function fetchWithTimeout(input: string | URL, init: RequestInit = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map(v => v.trim()).filter(Boolean)));
}

function normalizeUrl(url: string) {
  return String(url || '').replace(/[?#].*$/, '').toLowerCase();
}

function dedupeItems(items: SearchItem[], maxResults: number) {
  const seen = new Set<string>();
  const clean: SearchItem[] = [];
  for (const item of items) {
    const key = normalizeUrl(item.url) || item.title.toLowerCase();
    if (!item.title || seen.has(key)) continue;
    seen.add(key);
    clean.push(item);
    if (clean.length >= maxResults) break;
  }
  return clean;
}

function providerStatus(provider: string, items: SearchItem[], detail?: string): ProviderStat {
  return {
    provider,
    count: items.length,
    status: items.length ? 'ok' : 'empty',
    detail,
  };
}

function providerStateKey() {
  return [
    process.env.TAVILY_API_KEY ? 'tavily' : 'no-tavily',
    process.env.XAI_API_KEY ? 'xai' : 'no-xai',
    process.env.FMP_API_KEY ? 'fmp' : 'no-fmp',
    (process.env.EODHD_API_TOKEN || process.env.EODHD_API_KEY) ? 'eodhd' : 'no-eodhd',
    (process.env.X_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN) ? 'x' : 'no-x',
    (process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET) ? 'reddit-oauth' : 'no-reddit-oauth',
  ].join(':');
}

function skippedProvider(provider: string, detail: string): ProviderStat {
  return { provider, count: 0, status: 'skipped', detail };
}

function errorProvider(provider: string, error: any): ProviderStat {
  return {
    provider,
    count: 0,
    status: 'error',
    detail: error?.message || String(error || 'failed'),
  };
}

function summarizeProviders(providers: ProviderStat[]): ProviderStat[] {
  const order = ['ok', 'error', 'empty', 'skipped'];
  const grouped = new Map<string, ProviderStat[]>();
  for (const provider of providers) {
    grouped.set(provider.provider, [...(grouped.get(provider.provider) || []), provider]);
  }

  return Array.from(grouped.entries()).map(([provider, stats]) => {
    const count = stats.reduce((sum, stat) => sum + stat.count, 0);
    const status = count > 0
      ? 'ok'
      : order.find(s => stats.some(stat => stat.status === s)) as ProviderStat['status'];
    const details = uniqueStrings(stats.map(stat => stat.detail || ''));
    return {
      provider,
      count,
      status: status || 'empty',
      detail: details.length ? details.slice(0, 3).join('; ') : undefined,
    };
  });
}

function resultFromItems(query: string, items: SearchItem[], maxResults: number, providers: ProviderStat[] = []): SearchResult {
  const clean = dedupeItems(items, maxResults);
  return { disabled: false, query, items: clean, count: clean.length, providers };
}

function emptySearchResult(query: string, provider: string, error?: any): SearchResult {
  return {
    disabled: false,
    query,
    items: [],
    count: 0,
    providers: [error ? errorProvider(provider, error) : providerStatus(provider, [])],
  };
}

async function safeSearchResult(provider: string, query: string, task: () => Promise<SearchResult>): Promise<SearchResult> {
  try {
    return await task();
  } catch (error) {
    console.warn(`[news] ${provider} failed`, error);
    return emptySearchResult(query, provider, error);
  }
}

function mergeResults(query: string, results: SearchResult[], maxResults: number): SearchResult {
  return resultFromItems(
    query,
    results.flatMap(result => result.items),
    maxResults,
    results.flatMap(result => result.providers || [providerStatus(result.query || 'unknown', result.items)]),
  );
}

function xmlDecode(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripXml(value: string) {
  return xmlDecode(String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function stripHtml(value: string) {
  return xmlDecode(String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function xmlField(xml: string, field: string) {
  const match = xml.match(new RegExp(`<${field}(?:\\s[^>]*)?>([\\s\\S]*?)</${field}>`, 'i'));
  return match ? stripXml(match[1]) : '';
}

function parseDate(value: string | undefined) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : value;
}

function dateMinusDays(currDate: string, days: number) {
  const end = new Date(currDate + 'T00:00:00Z');
  const start = new Date(end.getTime() - Math.max(days, 1) * 86400000);
  return start.toISOString().slice(0, 10);
}

function extractResponseText(payload: any) {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  const chunks: string[] = [];
  for (const item of payload?.output || []) {
    if (item?.type !== 'message') continue;
    for (const content of item.content || []) {
      if (content?.type === 'output_text' && content.text) chunks.push(content.text);
    }
  }
  return chunks.join('\n').trim();
}

function stripMarkdownCitations(value: string) {
  return String(value || '').replace(/\[\[\d+\]\]\([^)]+\)/g, '').replace(/\s+/g, ' ').trim();
}

function isRecentDate(value: string | undefined, currDate: string, days: number) {
  if (!value) return true;
  const t = new Date(value).getTime();
  const end = new Date(currDate + 'T23:59:59Z').getTime();
  const start = end - Math.max(days, 1) * 86400000;
  return Number.isFinite(t) ? t >= start && t <= end + 86400000 : true;
}

function marketForTicker(ticker: string) {
  return inferMarketForTicker(ticker);
}

async function tavilySearch({
  query,
  domains,
  excludeDomains,
  days = 7,
  maxResults = 8,
  topic = 'general',
}: {
  query: string;
  domains?: string[];
  excludeDomains?: string[];
  days?: number;
  maxResults?: number;
  topic?: 'general' | 'news' | 'finance';
}): Promise<SearchResult> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return { disabled: true, query, items: [], count: 0, providers: [skippedProvider('tavily', 'TAVILY_API_KEY not configured')] };
  }
  try {
    const r = await fetchWithTimeout(TAVILY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'advanced',
        topic,
        days,
        max_results: maxResults,
        include_domains: domains,
        exclude_domains: excludeDomains,
      }),
    }, 12000);
    if (!r.ok) return { disabled: false, query, items: [], count: 0, providers: [errorProvider('tavily', `HTTP ${r.status}`)] };
    const j = await r.json();
    const items: SearchItem[] = (j.results || []).map((x: any) => ({
      provider: 'tavily',
      url: x.url,
      title: x.title,
      content: (x.content || '').slice(0, 600),
      score: x.score || 0,
      published_date: x.published_date,
    }));
    return resultFromItems(query, items, maxResults, [providerStatus('tavily', items)]);
  } catch (error) {
    return { disabled: false, query, items: [], count: 0, providers: [errorProvider('tavily', error)] };
  }
}

function yyyymmdd(date: string) {
  return date.replaceAll('-', '');
}

function gdeltWindow(currDate: string, days: number) {
  const end = new Date(currDate + 'T23:59:59Z');
  const start = new Date(end.getTime() - Math.max(days - 1, 0) * 86400000);
  return {
    startdatetime: `${yyyymmdd(start.toISOString().slice(0, 10))}000000`,
    enddatetime: `${yyyymmdd(end.toISOString().slice(0, 10))}235959`,
  };
}

async function gdeltSearch({
  query,
  currDate,
  days = 7,
  maxResults = 8,
}: {
  query: string;
  currDate: string;
  days?: number;
  maxResults?: number;
}): Promise<SearchResult> {
  try {
    const win = gdeltWindow(currDate, days);
    const url = new URL(GDELT_DOC_URL);
    url.searchParams.set('query', query);
    url.searchParams.set('mode', 'ArtList');
    url.searchParams.set('format', 'json');
    url.searchParams.set('sort', 'DateDesc');
    url.searchParams.set('maxrecords', String(maxResults));
    url.searchParams.set('startdatetime', win.startdatetime);
    url.searchParams.set('enddatetime', win.enddatetime);

    const r = await fetchWithTimeout(url, { headers: { 'User-Agent': UA } });
    if (!r.ok) return { disabled: false, query, items: [], count: 0, providers: [errorProvider('gdelt', `HTTP ${r.status}`)] };
    const j = await r.json();
    const items: SearchItem[] = (j.articles || []).map((x: any) => ({
      provider: 'gdelt',
      url: x.url,
      title: x.title,
      content: ['GDELT', x.domain, x.sourcecountry, x.language].filter(Boolean).join(' | '),
      score: 0,
      published_date: x.seendate,
    }));
    return resultFromItems(query, items, maxResults, [providerStatus('gdelt', items)]);
  } catch (error) {
    return { disabled: false, query, items: [], count: 0, providers: [errorProvider('gdelt', error)] };
  }
}

async function googleNewsSearch(query: string, days = 7, maxResults = 8): Promise<SearchResult> {
  const fullQuery = `${query} when:${days}d`;
  try {
    const url = new URL(GOOGLE_NEWS_RSS_URL);
    url.searchParams.set('q', fullQuery);
    url.searchParams.set('hl', 'en-US');
    url.searchParams.set('gl', 'US');
    url.searchParams.set('ceid', 'US:en');
    const r = await fetchWithTimeout(url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml,text/xml' } });
    if (!r.ok) return { disabled: false, query: fullQuery, items: [], count: 0, providers: [errorProvider('google_news_rss', `HTTP ${r.status}`)] };
    const xml = await r.text();
    const items: SearchItem[] = Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/gi))
      .slice(0, maxResults * 2)
      .map(match => {
        const itemXml = match[1];
        const source = xmlField(itemXml, 'source');
        return {
          provider: 'google_news_rss',
          url: xmlField(itemXml, 'link'),
          title: xmlField(itemXml, 'title'),
          content: ['Google News', source, xmlField(itemXml, 'description')].filter(Boolean).join(' | ').slice(0, 600),
          score: 0,
          published_date: parseDate(xmlField(itemXml, 'pubDate')),
        };
      });
    return resultFromItems(fullQuery, items, maxResults, [providerStatus('google_news_rss', items)]);
  } catch (error) {
    return { disabled: false, query: fullQuery, items: [], count: 0, providers: [errorProvider('google_news_rss', error)] };
  }
}

function decodeDuckDuckGoUrl(rawUrl: string) {
  const decoded = xmlDecode(rawUrl);
  try {
    const url = new URL(decoded.startsWith('//') ? `https:${decoded}` : decoded);
    const uddg = url.searchParams.get('uddg');
    return uddg ? decodeURIComponent(uddg) : decoded;
  } catch {
    return decoded;
  }
}

async function duckDuckGoSearch(query: string, maxResults = 8): Promise<SearchResult> {
  try {
    const url = new URL(DUCKDUCKGO_HTML_URL);
    url.searchParams.set('q', query);
    const r = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7',
      },
    }, 12000);
    if (!r.ok) return { disabled: false, query, items: [], count: 0, providers: [errorProvider('duckduckgo_html', `HTTP ${r.status}`)] };
    const html = await r.text();
    const blocks = html.match(/<div class="result[\s\S]*?(?=<div class="result|<\/body>)/gi) || [];
    const items: SearchItem[] = blocks.slice(0, maxResults * 2).map(block => {
      const linkMatch = block.match(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      const snippetMatch = block.match(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i)
        || block.match(/<div[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i);
      return {
        provider: 'duckduckgo_html',
        url: decodeDuckDuckGoUrl(linkMatch?.[1] || ''),
        title: stripXml(linkMatch?.[2] || ''),
        content: stripXml(snippetMatch?.[1] || '').slice(0, 600),
        score: 0,
      };
    }).filter(item => item.url && item.title);
    return resultFromItems(query, items, maxResults, [providerStatus('duckduckgo_html', items)]);
  } catch (error) {
    return { disabled: false, query, items: [], count: 0, providers: [errorProvider('duckduckgo_html', error)] };
  }
}

function nasdaqHeaders() {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
    Accept: 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    Origin: 'https://www.nasdaq.com',
    Referer: 'https://www.nasdaq.com/',
  };
}

async function nasdaqCompanyNews(ticker: string, maxResults = 8): Promise<SearchResult> {
  const profile = getCompanyProfile(ticker);
  const symbols = uniqueStrings([profile.ticker, ...(profile.altTickers || [])])
    .filter(symbol => /^[A-Z.=-]{1,12}$/.test(symbol));
  const items: SearchItem[] = [];

  for (const symbol of symbols) {
    try {
      const url = new URL(NASDAQ_NEWS_URL);
      url.searchParams.set('q', `${symbol.toUpperCase()}|stocks`);
      url.searchParams.set('limit', String(maxResults));
      const r = await fetchWithTimeout(url, { headers: nasdaqHeaders() });
      if (!r.ok) continue;
      const j = await r.json();
      items.push(...(j?.data?.rows || []).map((x: any) => ({
        provider: 'nasdaq',
        url: x.url?.startsWith('http') ? x.url : `https://www.nasdaq.com${x.url || ''}`,
        title: x.title,
        content: ['Nasdaq', x.publisher, x.description].filter(Boolean).join(' | ').slice(0, 600),
        score: 0,
        published_date: parseDate(x.created),
      })));
    } catch {
      // Try the next share class / alternate ticker.
    }
  }

  return resultFromItems(symbols.map(s => `${s}|stocks`).join(' | '), items, maxResults, [providerStatus('nasdaq', items)]);
}

function dateWindow(currDate: string, days: number) {
  const end = new Date(currDate + 'T23:59:59Z');
  const start = new Date(end.getTime() - Math.max(days - 1, 0) * 86400000);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function compactDate(date: string) {
  return date.replaceAll('-', '');
}

function joinQueriesWithinLimit(queries: string[], maxLength = 480) {
  const joined: string[] = [];
  for (const query of queries) {
    const next = [...joined, `(${query})`].join(' OR ');
    if (next.length > maxLength) break;
    joined.push(`(${query})`);
  }
  return joined.join(' OR ') || queries[0] || '';
}

function freeProviderSymbol(ticker: string) {
  return String(ticker || '').trim().toUpperCase().replace(/\.(US|NYSE|NASDAQ|AMEX|CC|CRYPTO)$/i, '');
}

function eodhdSymbol(ticker: string) {
  const raw = String(ticker || '').trim().toUpperCase();
  if (raw.endsWith('.US') || raw.endsWith('.HK') || raw.endsWith('.HKG') || raw.endsWith('.CC')) {
    return raw.replace(/\.HKG$/, '.HK');
  }
  if (marketForTicker(raw) === 'HK') {
    return raw.replace(/\.(HK|HKG)$/i, '').padStart(4, '0') + '.HK';
  }
  return `${freeProviderSymbol(raw)}.US`;
}

async function marketauxNews(ticker: string, currDate: string, days: number, maxResults = 3): Promise<SearchResult> {
  const token = process.env.MARKETAUX_API_TOKEN;
  const symbol = freeProviderSymbol(ticker);
  if (!token) {
    return { disabled: true, query: symbol, items: [], count: 0, providers: [skippedProvider('marketaux', 'MARKETAUX_API_TOKEN not configured')] };
  }

  const profile = getCompanyProfile(ticker);
  const market = marketForTicker(ticker);
  const win = dateWindow(currDate, days);
  const url = new URL('https://api.marketaux.com/v1/news/all');
  url.searchParams.set('api_token', token);
  url.searchParams.set('filter_entities', 'true');
  url.searchParams.set('must_have_entities', 'false');
  url.searchParams.set('limit', String(Math.min(maxResults, 3)));
  url.searchParams.set('sort', 'published_at');
  url.searchParams.set('sort_order', 'desc');
  url.searchParams.set('published_after', win.start);
  if (market === 'US') {
    url.searchParams.set('symbols', symbol);
    url.searchParams.set('countries', 'us');
    url.searchParams.set('language', 'en');
  } else if (market === 'CRYPTO') {
    url.searchParams.set('search', uniqueStrings([symbol, profile.primaryName, ...profile.aliases, 'crypto', 'ETF', 'regulation']).join(' | '));
    url.searchParams.set('language', 'en');
  } else {
    url.searchParams.set('search', uniqueStrings([symbol, profile.primaryName, ...profile.aliases]).join(' | '));
    url.searchParams.set('countries', 'hk');
    url.searchParams.set('language', 'en,zh');
  }

  try {
    const r = await fetchWithTimeout(url, { headers: { 'User-Agent': UA } });
    if (!r.ok) return { disabled: false, query: url.searchParams.toString(), items: [], count: 0, providers: [errorProvider('marketaux', `HTTP ${r.status}`)] };
    const j = await r.json();
    const items: SearchItem[] = (j?.data || []).map((row: any) => {
      const scores = (row.entities || [])
        .map((ent: any) => ent.sentiment_score)
        .filter((score: any) => Number.isFinite(Number(score)))
        .map(Number);
      const sentiment = scores.length ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : 0;
      return {
        provider: 'marketaux',
        url: row.url,
        title: row.title,
        content: ['Marketaux', row.source, row.description || row.snippet].filter(Boolean).join(' | ').slice(0, 600),
        score: sentiment,
        published_date: row.published_at,
      };
    });
    return resultFromItems(`marketaux ${symbol}`, items, maxResults, [providerStatus('marketaux', items)]);
  } catch (error) {
    return { disabled: false, query: `marketaux ${symbol}`, items: [], count: 0, providers: [errorProvider('marketaux', error)] };
  }
}

async function alphaVantageNews(ticker: string, currDate: string, days: number, maxResults = 20): Promise<SearchResult> {
  const key = process.env.ALPHAVANTAGE_API_KEY;
  const symbol = freeProviderSymbol(ticker);
  if (!key) {
    return { disabled: true, query: symbol, items: [], count: 0, providers: [skippedProvider('alpha_vantage', 'ALPHAVANTAGE_API_KEY not configured')] };
  }
  if (marketForTicker(ticker) !== 'US') {
    return { disabled: true, query: symbol, items: [], count: 0, providers: [skippedProvider('alpha_vantage', 'US symbols only')] };
  }

  try {
    const win = dateWindow(currDate, days);
    const url = new URL('https://www.alphavantage.co/query');
    url.searchParams.set('function', 'NEWS_SENTIMENT');
    url.searchParams.set('tickers', symbol);
    url.searchParams.set('time_from', `${compactDate(win.start)}T0000`);
    url.searchParams.set('time_to', `${compactDate(win.end)}T2359`);
    url.searchParams.set('sort', 'LATEST');
    url.searchParams.set('limit', String(maxResults));
    url.searchParams.set('apikey', key);
    const r = await fetchWithTimeout(url, { headers: { 'User-Agent': UA } }, 12000);
    if (!r.ok) return { disabled: false, query: `alpha_vantage ${symbol}`, items: [], count: 0, providers: [errorProvider('alpha_vantage', `HTTP ${r.status}`)] };
    const j = await r.json();
    const items: SearchItem[] = (j.feed || []).map((row: any) => {
      const tickerSentiment = (row.ticker_sentiment || []).find((x: any) => String(x.ticker).toUpperCase() === symbol);
      return {
        provider: 'alpha_vantage',
        url: row.url,
        title: row.title,
        content: ['Alpha Vantage', row.source, row.summary].filter(Boolean).join(' | ').slice(0, 600),
        score: Number(tickerSentiment?.ticker_sentiment_score || 0),
        published_date: row.time_published,
      };
    });
    return resultFromItems(`alpha_vantage ${symbol}`, items, maxResults, [providerStatus('alpha_vantage', items)]);
  } catch (error) {
    return { disabled: false, query: `alpha_vantage ${symbol}`, items: [], count: 0, providers: [errorProvider('alpha_vantage', error)] };
  }
}

async function polygonNews(ticker: string, maxResults = 10): Promise<SearchResult> {
  const key = process.env.POLYGON_API_KEY;
  const symbol = freeProviderSymbol(ticker);
  if (!key) {
    return { disabled: true, query: symbol, items: [], count: 0, providers: [skippedProvider('polygon', 'POLYGON_API_KEY not configured')] };
  }
  if (marketForTicker(ticker) !== 'US') {
    return { disabled: true, query: symbol, items: [], count: 0, providers: [skippedProvider('polygon', 'US symbols only')] };
  }

  try {
    const url = new URL('https://api.polygon.io/v2/reference/news');
    url.searchParams.set('ticker', symbol);
    url.searchParams.set('limit', String(maxResults));
    url.searchParams.set('order', 'desc');
    url.searchParams.set('sort', 'published_utc');
    url.searchParams.set('apiKey', key);
    const r = await fetchWithTimeout(url, { headers: { 'User-Agent': UA } }, 12000);
    if (!r.ok) return { disabled: false, query: `polygon ${symbol}`, items: [], count: 0, providers: [errorProvider('polygon', `HTTP ${r.status}`)] };
    const j = await r.json();
    const items: SearchItem[] = (j.results || []).map((row: any) => {
      const insight = (row.insights || []).find((x: any) => String(x.ticker).toUpperCase() === symbol);
      const score = insight?.sentiment === 'positive' ? 1 : insight?.sentiment === 'negative' ? -1 : 0;
      return {
        provider: 'polygon',
        url: row.article_url,
        title: row.title,
        content: ['Polygon', row.publisher?.name, row.description].filter(Boolean).join(' | ').slice(0, 600),
        score,
        published_date: row.published_utc,
      };
    });
    return resultFromItems(`polygon ${symbol}`, items, maxResults, [providerStatus('polygon', items)]);
  } catch (error) {
    return { disabled: false, query: `polygon ${symbol}`, items: [], count: 0, providers: [errorProvider('polygon', error)] };
  }
}

async function finnhubCompanyNews(ticker: string, currDate: string, days: number, maxResults = 10): Promise<SearchResult> {
  const key = process.env.FINNHUB_API_KEY;
  const symbol = freeProviderSymbol(ticker);
  if (!key) {
    return { disabled: true, query: symbol, items: [], count: 0, providers: [skippedProvider('finnhub', 'FINNHUB_API_KEY not configured')] };
  }
  if (marketForTicker(ticker) !== 'US') {
    return { disabled: true, query: symbol, items: [], count: 0, providers: [skippedProvider('finnhub', 'US symbols only')] };
  }

  const win = dateWindow(currDate, days);
  try {
    const url = new URL('https://finnhub.io/api/v1/company-news');
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('from', win.start);
    url.searchParams.set('to', win.end);
    url.searchParams.set('token', key);
    const r = await fetchWithTimeout(url, { headers: { 'User-Agent': UA } }, 12000);
    if (!r.ok) return { disabled: false, query: `finnhub ${symbol}`, items: [], count: 0, providers: [errorProvider('finnhub', `HTTP ${r.status}`)] };
    const j = await r.json();
    const items: SearchItem[] = (Array.isArray(j) ? j : []).map((row: any) => ({
      provider: 'finnhub',
      url: row.url,
      title: row.headline,
      content: ['Finnhub', row.source, row.summary].filter(Boolean).join(' | ').slice(0, 600),
      score: 0,
      published_date: row.datetime ? new Date(row.datetime * 1000).toISOString() : undefined,
    }));
    return resultFromItems(`finnhub ${symbol}`, items, maxResults, [providerStatus('finnhub', items)]);
  } catch (error) {
    return { disabled: false, query: `finnhub ${symbol}`, items: [], count: 0, providers: [errorProvider('finnhub', error)] };
  }
}

async function newsApiEverything(ticker: string, currDate: string, days: number, maxResults = 10): Promise<SearchResult> {
  const key = process.env.NEWSAPI_API_KEY;
  if (!key) {
    return { disabled: true, query: ticker, items: [], count: 0, providers: [skippedProvider('newsapi', 'NEWSAPI_API_KEY not configured')] };
  }

  const profile = getCompanyProfile(ticker);
  const win = dateWindow(currDate, days);
  const q = joinQueriesWithinLimit(companyNewsQueries(ticker).slice(0, 5));
  try {
    const url = new URL(NEWSAPI_EVERYTHING_URL);
    url.searchParams.set('q', q || profile.primaryName);
    url.searchParams.set('from', win.start);
    url.searchParams.set('to', win.end);
    url.searchParams.set('language', 'en');
    url.searchParams.set('sortBy', 'publishedAt');
    url.searchParams.set('pageSize', String(Math.min(maxResults, 100)));
    url.searchParams.set('apiKey', key);
    const r = await fetchWithTimeout(url, { headers: { 'User-Agent': UA } }, 12000);
    if (!r.ok) return { disabled: false, query: q, items: [], count: 0, providers: [errorProvider('newsapi', `HTTP ${r.status}`)] };
    const j = await r.json();
    const items: SearchItem[] = (j.articles || []).map((row: any) => ({
      provider: 'newsapi',
      url: row.url,
      title: row.title,
      content: ['NewsAPI', row.source?.name, row.description].filter(Boolean).join(' | ').slice(0, 600),
      score: 0,
      published_date: row.publishedAt,
    }));
    return resultFromItems(q, items, maxResults, [providerStatus('newsapi', items)]);
  } catch (error) {
    return { disabled: false, query: q, items: [], count: 0, providers: [errorProvider('newsapi', error)] };
  }
}

async function benzingaNews(ticker: string, currDate: string, days: number, maxResults = 10): Promise<SearchResult> {
  const key = process.env.BENZINGA_API_KEY;
  const symbol = freeProviderSymbol(ticker);
  if (!key) {
    return { disabled: true, query: symbol, items: [], count: 0, providers: [skippedProvider('benzinga', 'BENZINGA_API_KEY not configured')] };
  }
  if (marketForTicker(ticker) !== 'US') {
    return { disabled: true, query: symbol, items: [], count: 0, providers: [skippedProvider('benzinga', 'US symbols only')] };
  }

  const win = dateWindow(currDate, days);
  try {
    const url = new URL(BENZINGA_NEWS_URL);
    url.searchParams.set('tickers', symbol);
    url.searchParams.set('dateFrom', win.start);
    url.searchParams.set('dateTo', win.end);
    url.searchParams.set('pageSize', String(Math.min(maxResults, 100)));
    url.searchParams.set('displayOutput', 'full');
    const r = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
        token: key,
      },
    }, 12000);
    if (!r.ok) return { disabled: false, query: `benzinga ${symbol}`, items: [], count: 0, providers: [errorProvider('benzinga', `HTTP ${r.status}`)] };
    const j = await r.json();
    const rows = Array.isArray(j) ? j : (j.news || j.data || []);
    const items: SearchItem[] = rows.map((row: any) => ({
      provider: 'benzinga',
      url: row.url || row.share_url,
      title: row.title,
      content: ['Benzinga', row.author, row.teaser || row.body].filter(Boolean).join(' | ').slice(0, 600),
      score: 0,
      published_date: row.created || row.updated,
    }));
    return resultFromItems(`benzinga ${symbol}`, items, maxResults, [providerStatus('benzinga', items)]);
  } catch (error) {
    return { disabled: false, query: `benzinga ${symbol}`, items: [], count: 0, providers: [errorProvider('benzinga', error)] };
  }
}

async function fmpStockNews(ticker: string, currDate: string, days: number, maxResults = 10): Promise<SearchResult> {
  const key = process.env.FMP_API_KEY || process.env.FINANCIAL_MODELING_PREP_API_KEY;
  const symbol = freeProviderSymbol(ticker);
  if (!key) {
    return { disabled: true, query: symbol, items: [], count: 0, providers: [skippedProvider('fmp', 'FMP_API_KEY not configured')] };
  }
  if (marketForTicker(ticker) !== 'US') {
    return { disabled: true, query: symbol, items: [], count: 0, providers: [skippedProvider('fmp', 'US symbols only')] };
  }

  const win = dateWindow(currDate, days);
  try {
    const urls = [
      new URL(`${FMP_STABLE_URL}/news/stock`),
      new URL(`${FMP_STABLE_URL}/news/press-releases`),
    ];
    for (const url of urls) {
      url.searchParams.set('symbols', symbol);
      url.searchParams.set('limit', String(Math.min(maxResults, 50)));
      url.searchParams.set('apikey', key);
    }

    const responses = await Promise.all(urls.map(async url => {
      const r = await fetchWithTimeout(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } }, 12000);
      if (!r.ok) return { items: [] as SearchItem[], provider: errorProvider('fmp', `HTTP ${r.status}`) };
      const rows = await r.json();
      const items: SearchItem[] = (Array.isArray(rows) ? rows : [])
        .map((row: any) => {
          const published = parseDate(row.publishedDate || row.date);
          return {
            provider: 'fmp',
            url: row.url || row.link || `https://financialmodelingprep.com/financial-summary/${symbol}`,
            title: row.title,
            content: ['Financial Modeling Prep', row.publisher || row.site, row.text || row.summary].filter(Boolean).join(' | ').slice(0, 600),
            score: 0,
            published_date: published,
          };
        })
        .filter((item: SearchItem) => item.title && isRecentDate(item.published_date, currDate, days));
      return { items, provider: providerStatus('fmp', items, url.pathname.replace('/stable/', '')) };
    }));

    const items = responses.flatMap(result => result.items);
    return resultFromItems(`fmp ${symbol} ${win.start}:${win.end}`, items, maxResults, summarizeProviders(responses.map(result => result.provider)));
  } catch (error) {
    return { disabled: false, query: `fmp ${symbol}`, items: [], count: 0, providers: [errorProvider('fmp', error)] };
  }
}

async function eodhdNews(ticker: string, currDate: string, days: number, maxResults = 10): Promise<SearchResult> {
  const key = process.env.EODHD_API_TOKEN || process.env.EODHD_API_KEY;
  const symbol = eodhdSymbol(ticker);
  if (!key) {
    return { disabled: true, query: symbol, items: [], count: 0, providers: [skippedProvider('eodhd', 'EODHD_API_TOKEN not configured')] };
  }

  const win = dateWindow(currDate, days);
  try {
    const newsUrl = new URL(`${EODHD_API_URL}/news`);
    newsUrl.searchParams.set('s', symbol);
    newsUrl.searchParams.set('from', win.start);
    newsUrl.searchParams.set('to', win.end);
    newsUrl.searchParams.set('limit', String(Math.min(maxResults, 50)));
    newsUrl.searchParams.set('api_token', key);
    newsUrl.searchParams.set('fmt', 'json');

    const r = await fetchWithTimeout(newsUrl, { headers: { 'User-Agent': UA, Accept: 'application/json' } }, 12000);
    if (!r.ok) return { disabled: false, query: `eodhd ${symbol}`, items: [], count: 0, providers: [errorProvider('eodhd', `HTTP ${r.status}`)] };
    const rows = await r.json();
    const items: SearchItem[] = (Array.isArray(rows) ? rows : []).map((row: any) => {
      const sentiment = row.sentiment || row.sentiments || {};
      const score = Number(sentiment.polarity ?? sentiment.score ?? row.polarity ?? 0);
      return {
        provider: 'eodhd',
        url: row.link || row.url,
        title: row.title,
        content: ['EODHD', ...(row.symbols || []), ...(row.tags || []), row.content].filter(Boolean).join(' | ').slice(0, 600),
        score: Number.isFinite(score) ? score : 0,
        published_date: parseDate(row.date),
      };
    });
    return resultFromItems(`eodhd ${symbol} ${win.start}:${win.end}`, items, maxResults, [providerStatus('eodhd', items)]);
  } catch (error) {
    return { disabled: false, query: `eodhd ${symbol}`, items: [], count: 0, providers: [errorProvider('eodhd', error)] };
  }
}

async function secCompanyMap() {
  return memo('cache:sec:company_tickers_exchange:v1', async () => {
    const r = await fetchWithTimeout('https://www.sec.gov/files/company_tickers_exchange.json', {
      headers: {
        'User-Agent': process.env.SEC_USER_AGENT || UA,
        Accept: 'application/json',
      },
    }, 12000);
    if (!r.ok) throw new Error(`SEC company map ${r.status}`);
    const j = await r.json();
    const fields = j.fields || [];
    return (j.data || []).map((row: any[]) => Object.fromEntries(fields.map((field: string, i: number) => [field, row[i]])));
  }, { ttlSec: 7 * 86400 });
}

async function secRecentFilings(ticker: string, maxResults = 6): Promise<SearchResult> {
  const symbol = freeProviderSymbol(ticker);
  if (marketForTicker(ticker) !== 'US') {
    return { disabled: true, query: symbol, items: [], count: 0, providers: [skippedProvider('sec_edgar', 'US symbols only')] };
  }
  try {
    const rows = await secCompanyMap();
    const company = rows.find((row: any) => String(row.ticker || '').toUpperCase() === symbol);
    if (!company?.cik) return { disabled: false, query: `sec ${symbol}`, items: [], count: 0, providers: [providerStatus('sec_edgar', [])] };
    const cik = Number(company.cik);
    const cikPadded = String(cik).padStart(10, '0');
    const r = await fetchWithTimeout(`https://data.sec.gov/submissions/CIK${cikPadded}.json`, {
      headers: {
        'User-Agent': process.env.SEC_USER_AGENT || UA,
        Accept: 'application/json',
      },
    }, 12000);
    if (!r.ok) return { disabled: false, query: `sec ${symbol}`, items: [], count: 0, providers: [errorProvider('sec_edgar', `HTTP ${r.status}`)] };
    const j = await r.json();
    const recent = j?.filings?.recent || {};
    const forms = new Set([
      '8-K', '10-Q', '10-K', '6-K', '20-F',
      '3', '4', '5',
      'S-1', 'S-3', 'S-4', '424B5',
      'DEF 14A', 'DEFA14A', 'SC 13D', 'SC 13G',
    ]);
    const items: SearchItem[] = [];
    for (let i = 0; i < (recent.form || []).length && items.length < maxResults; i += 1) {
      const form = recent.form[i];
      if (!forms.has(form)) continue;
      const accession = recent.accessionNumber?.[i];
      const accessionCompact = String(accession || '').replace(/-/g, '');
      const doc = recent.primaryDocument?.[i];
      items.push({
        provider: 'sec_edgar',
        url: `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionCompact}/${doc}`,
        title: `${symbol} SEC filing ${form}${recent.reportDate?.[i] ? ` for ${recent.reportDate[i]}` : ''}`,
        content: ['SEC EDGAR', `${company.name || symbol} filed ${form}`, recent.filingDate?.[i]].filter(Boolean).join(' | '),
        score: 0,
        published_date: recent.filingDate?.[i],
      });
    }
    return resultFromItems(`sec ${symbol}`, items, maxResults, [providerStatus('sec_edgar', items)]);
  } catch (error) {
    return { disabled: false, query: `sec ${symbol}`, items: [], count: 0, providers: [errorProvider('sec_edgar', error)] };
  }
}

async function hkexRssNews(ticker: string, maxResults = 8): Promise<SearchResult> {
  if (marketForTicker(ticker) !== 'HK') {
    return { disabled: true, query: ticker, items: [], count: 0, providers: [skippedProvider('hkex_rss', 'HK symbols only')] };
  }
  const profile = getCompanyProfile(ticker);
  const keywords = companySearchTerms(ticker).map(term => term.toLowerCase());
  const urls = [
    'https://www.hkex.com.hk/Services/RSS-Feeds/regulatory-announcements?sc_lang=en',
    'https://www.hkex.com.hk/Services/RSS-Feeds/News-Releases?sc_lang=en',
  ];
  const items: SearchItem[] = [];
  for (const rssUrl of urls) {
    try {
      const r = await fetchWithTimeout(rssUrl, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml,text/xml' } }, 12000);
      if (!r.ok) continue;
      const xml = await r.text();
      items.push(...Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)).map(match => {
        const itemXml = match[1];
        return {
          provider: 'hkex_rss',
          url: xmlField(itemXml, 'link'),
          title: xmlField(itemXml, 'title'),
          content: ['HKEX', xmlField(itemXml, 'description')].filter(Boolean).join(' | ').slice(0, 600),
          score: 0,
          published_date: parseDate(xmlField(itemXml, 'pubDate')),
        };
      }).filter(item => {
        const haystack = `${item.title} ${item.content}`.toLowerCase();
        return keywords.some(keyword => haystack.includes(keyword)) || haystack.includes(profile.primaryName.toLowerCase());
      }));
    } catch {
      // Try the next HKEX RSS feed.
    }
  }
  return resultFromItems(`hkex ${ticker}`, items, maxResults, [providerStatus('hkex_rss', items)]);
}

function officialKeywords(ticker: string) {
  return companySocialTerms(ticker).map(term => term.toLowerCase());
}

function parseFeedItems(xml: string, provider: string): SearchItem[] {
  const rssItems = Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)).map(match => {
    const itemXml = match[1];
    return {
      provider,
      url: xmlField(itemXml, 'link'),
      title: xmlField(itemXml, 'title'),
      content: [provider, xmlField(itemXml, 'description')].filter(Boolean).join(' | ').slice(0, 600),
      score: 0,
      published_date: parseDate(xmlField(itemXml, 'pubDate') || xmlField(itemXml, 'published') || xmlField(itemXml, 'updated')),
    };
  });

  const atomItems = Array.from(xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)).map(match => {
    const itemXml = match[1];
    const href = itemXml.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] || xmlField(itemXml, 'link');
    return {
      provider,
      url: xmlDecode(href),
      title: xmlField(itemXml, 'title'),
      content: [provider, xmlField(itemXml, 'summary') || xmlField(itemXml, 'content')].filter(Boolean).join(' | ').slice(0, 600),
      score: 0,
      published_date: parseDate(xmlField(itemXml, 'published') || xmlField(itemXml, 'updated')),
    };
  });

  return [...rssItems, ...atomItems].filter(item => item.title && item.url);
}

function parseOfficialPageLinks(html: string, pageUrl: string, ticker: string, maxResults: number): SearchItem[] {
  const keywords = officialKeywords(ticker);
  const newsWords = ['news', 'press', 'release', 'announce', 'quarter', 'earnings', 'investor', 'launch', 'product', 'guidance'];
  const items: SearchItem[] = [];
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = match[1] || '';
    const href = attrs.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('javascript:')) continue;
    const title = stripHtml(match[2]);
    if (!title || title.length < 8) continue;
    let url = '';
    try {
      url = new URL(xmlDecode(href), pageUrl).toString();
    } catch {
      continue;
    }
    const haystack = `${title} ${url}`.toLowerCase();
    const hasCompany = keywords.some(keyword => haystack.includes(keyword));
    const hasNewsIntent = newsWords.some(word => haystack.includes(word));
    if (!hasCompany && !hasNewsIntent) continue;
    items.push({
      provider: 'official_site',
      url,
      title: title.slice(0, 180),
      content: ['Official company page', new URL(pageUrl).hostname].join(' | '),
      score: hasCompany ? 2 : 1,
    });
    if (items.length >= maxResults) break;
  }
  return items;
}

async function officialCompanyNews(ticker: string, currDate: string, days: number, maxResults = 8): Promise<SearchResult> {
  const profile = getCompanyProfile(ticker);
  const feedUrls = profile.officialNewsFeeds || [];
  const pageUrls = profile.officialNewsPages || [];
  if (!feedUrls.length && !pageUrls.length) {
    return { disabled: true, query: ticker, items: [], count: 0, providers: [skippedProvider('official_site', 'official news source not configured for ticker')] };
  }

  const items: SearchItem[] = [];
  const providerStats: ProviderStat[] = [];
  for (const feedUrl of feedUrls) {
    try {
      const r = await fetchWithTimeout(feedUrl, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml,text/xml,application/atom+xml' } }, 12000);
      if (!r.ok) {
        providerStats.push(errorProvider('official_site', `${feedUrl} HTTP ${r.status}`));
        continue;
      }
      const xml = await r.text();
      const feedItems = parseFeedItems(xml, 'official_site')
        .filter(item => isRecentDate(item.published_date, currDate, days));
      items.push(...feedItems);
      providerStats.push(providerStatus('official_site', feedItems, new URL(feedUrl).hostname));
    } catch (error) {
      providerStats.push(errorProvider('official_site', error));
    }
  }

  for (const pageUrl of pageUrls) {
    try {
      const r = await fetchWithTimeout(pageUrl, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' } }, 12000);
      if (!r.ok) {
        providerStats.push(errorProvider('official_site', `${pageUrl} HTTP ${r.status}`));
        continue;
      }
      const html = await r.text();
      const pageItems = parseOfficialPageLinks(html, pageUrl, ticker, maxResults);
      items.push(...pageItems);
      providerStats.push(providerStatus('official_site', pageItems, new URL(pageUrl).hostname));
    } catch (error) {
      providerStats.push(errorProvider('official_site', error));
    }
  }

  return resultFromItems(`official ${ticker}`, items, maxResults, summarizeProviders(providerStats));
}

function companyNewsQueries(ticker: string) {
  const profile = getCompanyProfile(ticker);
  const parsed = parseTicker(ticker);
  const terms = companySearchTerms(ticker);
  const socialTerms = companySocialTerms(ticker);
  const primary = quoteIfNeeded(profile.primaryName);
  const tickerTerms = uniqueStrings([profile.ticker, ...(profile.altTickers || [])]).join(' OR ');
  const aliases = terms
    .filter(term => term !== profile.ticker && !(profile.altTickers || []).includes(term))
    .slice(0, 4)
    .map(quoteIfNeeded)
    .join(' OR ');
  const people = uniqueStrings(profile.people || []).slice(0, 4).map(quoteIfNeeded).join(' OR ');
  const products = uniqueStrings([...(profile.products || []), ...(profile.socialAliases || [])]).slice(0, 6).map(quoteIfNeeded).join(' OR ');
  const officialSites = uniqueStrings(profile.officialDomains || []).slice(0, 4);
  if (parsed.market === 'CRYPTO') {
    return uniqueStrings([
      `${primary} ${parsed.code} crypto news price market cap ETF regulation`,
      `${parsed.code} USDT Binance announcement liquidity volume`,
      `${primary} on-chain flows exchange reserves institutional adoption`,
      `${socialTerms.slice(0, 8).map(quoteIfNeeded).join(' OR ')} bullish bearish crypto sentiment`,
      `site:coinmarketcap.com ${parsed.code} ${primary}`,
      `site:coingecko.com ${parsed.code} ${primary}`,
      `site:binance.com ${parsed.code} USDT announcement`,
      ...officialSites.map(domain => `site:${domain} ${primary} news update ecosystem`),
    ]);
  }
  return uniqueStrings([
    `${primary} stock news earnings analyst`,
    `${tickerTerms} stock news earnings analyst`,
    aliases ? `(${aliases}) shares market earnings` : '',
    products ? `(${products}) ${primary} announcement launch supply demand` : '',
    people ? `(${people}) ${primary} CEO founder interview announcement` : '',
    `${socialTerms.slice(0, 8).map(quoteIfNeeded).join(' OR ')} revenue guidance partnership regulation`,
    ...officialSites.map(domain => `site:${domain} ${primary} press release investor news`),
  ]);
}

async function yahooCompanyNews(ticker: string, maxResults = 8): Promise<SearchResult> {
  const queries = companyNewsQueries(ticker).slice(0, 3);
  const items: SearchItem[] = [];
  for (const query of queries) {
    try {
      const r: any = await yahooFinance.search(query, {
        quotesCount: 0,
        newsCount: maxResults,
      });
      items.push(...(r.news || []).slice(0, maxResults).map((x: any) => ({
        provider: 'yahoo_finance',
        url: x.link,
        title: x.title,
        content: ['Yahoo Finance', x.publisher, ...(x.relatedTickers || [])].filter(Boolean).join(' | '),
        score: 0,
        published_date: x.providerPublishTime
          ? new Date(x.providerPublishTime).toISOString()
          : undefined,
      })));
    } catch {
      // Try the next alias query.
    }
  }
  return resultFromItems(queries.join(' | '), items, maxResults, [providerStatus('yahoo_finance', items)]);
}

async function aggregateCompanyNews(ticker: string, currDate: string, days: number, maxResults = 10) {
  const queries = companyNewsQueries(ticker);
  const parsed = parseTicker(ticker);
  const gdeltTerms = companySocialTerms(ticker).slice(0, 8).map(quoteIfNeeded).join(' OR ');
  const [
    official,
    marketaux,
    alphaVantage,
    polygon,
    finnhub,
    newsapi,
    benzinga,
    fmp,
    eodhd,
    sec,
    hkex,
    nasdaq,
    yahoo,
    ...others
  ] = await Promise.all([
    safeSearchResult('official_site', `${ticker} official`, () => officialCompanyNews(ticker, currDate, days, 8)),
    safeSearchResult('marketaux', `${ticker} marketaux`, () => marketauxNews(ticker, currDate, days, 3)),
    safeSearchResult('alpha_vantage', `${ticker} alpha vantage`, () => alphaVantageNews(ticker, currDate, days, 20)),
    safeSearchResult('polygon', `${ticker} polygon`, () => polygonNews(ticker, 10)),
    safeSearchResult('finnhub', `${ticker} finnhub`, () => finnhubCompanyNews(ticker, currDate, days, 10)),
    safeSearchResult('newsapi', `${ticker} newsapi`, () => newsApiEverything(ticker, currDate, days, 10)),
    safeSearchResult('benzinga', `${ticker} benzinga`, () => benzingaNews(ticker, currDate, days, 10)),
    safeSearchResult('fmp', `${ticker} fmp`, () => fmpStockNews(ticker, currDate, days, 10)),
    safeSearchResult('eodhd', `${ticker} eodhd`, () => eodhdNews(ticker, currDate, days, 10)),
    safeSearchResult('sec_edgar', `${ticker} sec`, () => secRecentFilings(ticker, 6)),
    safeSearchResult('hkex_rss', `${ticker} hkex`, () => hkexRssNews(ticker, 8)),
    safeSearchResult('nasdaq', `${ticker} nasdaq`, () => nasdaqCompanyNews(ticker, maxResults)),
    safeSearchResult('yahoo_finance', `${ticker} yahoo`, () => yahooCompanyNews(ticker, maxResults)),
    ...queries.slice(0, 5).map(query => safeSearchResult('google_news_rss', query, () => googleNewsSearch(query, days, maxResults))),
    safeSearchResult('gdelt', gdeltTerms, () => gdeltSearch({
      query: parsed.market === 'CRYPTO'
        ? `(${gdeltTerms}) crypto price market cap ETF regulation on-chain`
        : `(${gdeltTerms}) stock earnings analyst market`,
      currDate,
      days,
      maxResults,
    })),
  ]);
  return mergeResults(
    queries.join(' | '),
    [official, marketaux, alphaVantage, polygon, finnhub, newsapi, benzinga, fmp, eodhd, sec, hkex, nasdaq, yahoo, ...others],
    maxResults,
  );
}

function redditAfter(days: number) {
  return Math.floor((Date.now() - days * 86400000) / 1000);
}

function xQuery(ticker: string) {
  const profile = getCompanyProfile(ticker);
  const parsed = parseTicker(ticker);
  if (parsed.market === 'CRYPTO') {
    const identityTerms = uniqueStrings([
      `$${parsed.code}`,
      parsed.code,
      profile.primaryName,
      ...profile.aliases,
      ...(profile.socialAliases || []),
    ]).slice(0, 8);
    const contextTerms = uniqueStrings([
      ...(profile.products || []),
      'crypto',
      'on-chain',
      'ETF flows',
      'staking',
      'liquidity',
      'regulation',
    ]).slice(0, 8);
    const terms = uniqueStrings([...identityTerms, ...contextTerms]);
    return `(${terms.map(quoteIfNeeded).join(' OR ')}) (crypto OR onchain OR "on-chain" OR ETF OR staking OR liquidity OR regulation OR bullish OR bearish) -is:retweet`;
  }
  const identityTerms = uniqueStrings([
    `$${profile.ticker}`,
    profile.ticker,
    profile.primaryName,
    ...profile.aliases,
  ]).slice(0, 5);
  const contextTerms = uniqueStrings([
    ...(profile.people || []),
    ...(profile.products || []),
    ...(profile.socialAliases || []),
  ]).slice(0, 8);
  const terms = uniqueStrings([
    ...identityTerms,
    ...contextTerms,
  ]);
  return `(${terms.map(quoteIfNeeded).join(' OR ')}) (stock OR shares OR earnings OR investor OR valuation OR demand OR guidance) -is:retweet`;
}

async function xRecentSearch(ticker: string, maxResults = 10): Promise<SearchResult> {
  const bearer = process.env.X_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN;
  const query = xQuery(ticker);
  if (!bearer) {
    return { disabled: true, query, items: [], count: 0, providers: [skippedProvider('x_recent', 'X_BEARER_TOKEN not configured')] };
  }

  try {
    const url = new URL(X_RECENT_SEARCH_URL);
    url.searchParams.set('query', query);
    url.searchParams.set('max_results', String(Math.max(10, Math.min(maxResults, 100))));
    url.searchParams.set('tweet.fields', 'created_at,public_metrics,lang,author_id');
    url.searchParams.set('expansions', 'author_id');
    url.searchParams.set('user.fields', 'username,name,verified');

    const r = await fetchWithTimeout(url, {
      headers: {
        Authorization: `Bearer ${bearer}`,
        'User-Agent': UA,
      },
    }, 12000);
    if (!r.ok) return { disabled: false, query, items: [], count: 0, providers: [errorProvider('x_recent', `HTTP ${r.status}`)] };

    const j = await r.json();
    const users = new Map((j.includes?.users || []).map((u: any) => [u.id, u]));
    const items: SearchItem[] = (j.data || []).map((x: any) => {
      const user: any = users.get(x.author_id) || {};
      const username = user.username || x.author_id;
      const metrics = x.public_metrics || {};
      return {
        provider: 'x_recent',
        url: username ? `https://x.com/${username}/status/${x.id}` : `https://x.com/i/web/status/${x.id}`,
        title: `X post by ${user.name || username || 'user'}`,
        content: String(x.text || '').slice(0, 600),
        score: Number(metrics.like_count || 0) + Number(metrics.retweet_count || 0) * 2 + Number(metrics.reply_count || 0),
        published_date: x.created_at,
      };
    });

    return resultFromItems(query, items, maxResults, [providerStatus('x_recent', items)]);
  } catch (error) {
    return { disabled: false, query, items: [], count: 0, providers: [errorProvider('x_recent', error)] };
  }
}

async function grokXSearch({
  query,
  currDate,
  days = 7,
  maxResults = 8,
  provider = 'grok_x_search',
  focus = 'equity sentiment and market narratives',
  allowedXHandles,
}: {
  query: string;
  currDate?: string;
  days?: number;
  maxResults?: number;
  provider?: string;
  focus?: string;
  allowedXHandles?: string[];
}): Promise<SearchResult> {
  const apiKey = process.env.XAI_API_KEY;
  const model = process.env.XAI_X_SEARCH_MODEL || 'grok-4.3';
  const timeoutMs = Number(process.env.XAI_X_SEARCH_TIMEOUT_MS || 45000);
  const toDate = currDate || new Date().toISOString().slice(0, 10);
  const fromDate = dateMinusDays(toDate, days);

  if (!apiKey) {
    return { disabled: true, query, items: [], count: 0, providers: [skippedProvider(provider, 'XAI_API_KEY not configured')] };
  }

  async function requestOnce() {
    const r = await fetchWithTimeout(XAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        include: ['no_inline_citations'],
        input: [
          {
            role: 'user',
            content: [
              `Search X posts from ${fromDate} to ${toDate} for this research query: ${query}`,
              `Focus: ${focus}.`,
              `Return a compact Chinese synthesis with ${Math.min(maxResults, 8)} evidence bullets.`,
              'Separate observed X discussion from inference. Prefer posts/accounts that appear relevant to investors, industry participants, analysts, official company accounts, journalists, or notable builders.',
            ].join('\n'),
          },
        ],
        tools: [
          {
            type: 'x_search',
            from_date: fromDate,
            to_date: toDate,
            ...(allowedXHandles?.length ? { allowed_x_handles: allowedXHandles } : {}),
          },
        ],
      }),
    }, Math.max(15000, timeoutMs));

    if (!r.ok) return { disabled: false, query, items: [], count: 0, providers: [errorProvider(provider, `HTTP ${r.status}`)] };

    const payload = await r.json();
    const text = stripMarkdownCitations(extractResponseText(payload));
    const citations = uniqueStrings((payload?.citations || []).filter((url: any) => typeof url === 'string'));
    const xCitations = citations.filter(url => /https?:\/\/(x|twitter)\.com\//i.test(url));
    const evidenceUrls = (xCitations.length ? xCitations : citations).slice(0, Math.max(1, maxResults - 1));
    const items: SearchItem[] = [];

    if (text) {
      items.push({
        provider,
        url: evidenceUrls[0] || 'https://x.com/search',
        title: `Grok X Search synthesis: ${query.slice(0, 90)}`,
        content: text.slice(0, 1200),
        score: evidenceUrls.length || 1,
        published_date: toDate,
      });
    }

    items.push(...evidenceUrls.slice(text ? 0 : 0, maxResults).map((url, idx) => ({
      provider,
      url,
      title: `X source cited by Grok #${idx + 1}`,
      content: ['Grok X Search citation', focus, text ? text.slice(0, 360) : 'Relevant X source found by Grok.'].filter(Boolean).join(' | ').slice(0, 600),
      score: Math.max(1, evidenceUrls.length - idx),
      published_date: toDate,
    })));

    return resultFromItems(query, items, maxResults, [providerStatus(provider, items, `${fromDate} to ${toDate}`)]);
  }

  try {
    return await requestOnce();
  } catch (error) {
    try {
      return await requestOnce();
    } catch (retryError) {
      return { disabled: false, query, items: [], count: 0, providers: [errorProvider(provider, retryError || error)] };
    }
  }
}

export async function searchKolX(ticker: string, currDate: string, days = 90): Promise<SearchResult> {
  const profile = getCompanyProfile(ticker);
  const parsed = parseTicker(ticker);
  const watchlist = kolWatchlistForTicker(ticker);
  const socialTerms = companySocialTerms(ticker).slice(0, 12);
  const peopleTerms = (profile.people || []).slice(0, 4);
  const productTerms = (profile.products || []).slice(0, 6);
  const queryTerms = parsed.market === 'CRYPTO'
    ? [
        `$${parsed.code}`,
        parsed.code,
        profile.primaryName,
        ...profile.aliases.slice(0, 4),
        ...(profile.socialAliases || []).slice(0, 4),
        ...productTerms,
      ]
    : [
        profile.ticker,
        profile.primaryName,
        ...profile.aliases.slice(0, 4),
        ...peopleTerms,
        ...productTerms,
      ];
  const query = uniqueStrings(queryTerms).map(quoteIfNeeded).join(' OR ');
  const theme = parsed.market === 'CRYPTO'
    ? 'crypto price narrative on-chain liquidity ETF regulation staking tokenomics bullish bearish'
    : 'stock earnings valuation demand guidance narrative';
  const discoveryTheme = parsed.market === 'CRYPTO'
    ? 'crypto investor KOL analyst trader fund on-chain researcher protocol builder journalist'
    : 'stock investor KOL analyst trader portfolio manager hedge fund VC AI finance';

  const handleQuery = watchlist.length
    ? grokXSearch({
        query: `(${query}) ${theme}`,
        currDate,
        days,
        maxResults: 10,
        provider: 'grok_x_kol_watchlist',
        allowedXHandles: watchlist.map(item => item.handle),
        focus: [
          `Observe these X handles for ${profile.primaryName} / ${parsed.code || profile.ticker}: ${watchlist.map(item => `@${item.handle}`).join(', ')}.`,
          `Use only posts from these handles during the last ${days} days when describing current stance or 3-month view changes.`,
          'Return Chinese markdown with a table: KOL / handle, role, why observed, current stance, 3-month view change, evidence summary.',
          'If one watched handle has no relevant post, still list the handle and mark current stance as 未见明确观点, without apologizing about data coverage.',
          `Useful ticker/entity terms: ${socialTerms.map(quoteIfNeeded).join(', ')}.`,
        ].join('\n'),
      })
    : Promise.resolve(emptySearchResult(query, 'grok_x_kol_watchlist'));

  const discoveryQuery = grokXSearch({
    query: `(${query}) ${discoveryTheme}`,
    currDate,
    days,
    maxResults: 8,
    provider: 'grok_x_kol_discovery',
    focus: [
      `Identify additional influential X accounts discussing ${profile.primaryName} / ${parsed.code || profile.ticker} during the last ${days} days.`,
      'Only include accounts with attributable handles or clearly named X identities. Do not invent KOL names.',
      'Return Chinese markdown with additional observed KOLs and explain why each account matters.',
      parsed.market === 'CRYPTO'
        ? 'Prioritize crypto analysts, on-chain researchers, protocol builders, exchange/news accounts, fund managers, and reputable traders over anonymous low-quality posts.'
        : 'Prioritize US equity KOLs, market strategists, tech analysts, fund managers, trading accounts, industry builders, and journalists over anonymous low-quality posts.',
    ].join('\n'),
  });
  const narrativeQuery = parsed.market === 'CRYPTO'
    ? grokXSearch({
        query: `(${query}) ${theme} ("latest" OR "today" OR "this week")`,
        currDate,
        days: Math.min(days, 21),
        maxResults: 10,
        provider: 'grok_x_crypto_narrative',
        focus: [
          `Search broad X discussion for ${profile.primaryName} / ${parsed.code}.`,
          'Prioritize high-engagement posts from crypto analysts, on-chain researchers, ETF/flow watchers, protocol builders, exchange/news accounts, and reputable traders.',
          'Extract the current bullish narrative, bearish narrative, catalyst timeline, and evidence links. Ignore posts that only mention ETH.CC; use ETH, $ETH, Ethereum, or 以太坊.',
          'Return Chinese markdown with evidence bullets and separate observed posts from inference.',
        ].join('\n'),
      })
    : Promise.resolve(emptySearchResult(query, 'grok_x_crypto_narrative'));

  const [watchResult, discoveryResult, narrativeResult] = await Promise.all([
    safeSearchResult('grok_x_kol_watchlist', query, () => handleQuery),
    safeSearchResult('grok_x_kol_discovery', query, () => discoveryQuery),
    safeSearchResult('grok_x_crypto_narrative', query, () => narrativeQuery),
  ]);

  return mergeResults(
    [watchResult.query, discoveryResult.query, narrativeResult.query].filter(Boolean).join(' | '),
    [watchResult, discoveryResult, narrativeResult],
    12,
  );
}

async function redditAccessToken(): Promise<string | null> {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  if (redditTokenCache && redditTokenCache.expiresAt > Date.now() + 60000) {
    return redditTokenCache.token;
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body = new URLSearchParams({ grant_type: 'client_credentials' });
  const r = await fetchWithTimeout(REDDIT_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': process.env.REDDIT_USER_AGENT || UA,
    },
    body,
  }, 12000);
  if (!r.ok) throw new Error(`token HTTP ${r.status}`);
  const j = await r.json();
  if (!j.access_token) throw new Error('token missing access_token');
  redditTokenCache = {
    token: j.access_token,
    expiresAt: Date.now() + Math.max(60, Number(j.expires_in || 3600) - 60) * 1000,
  };
  return redditTokenCache.token;
}

async function redditOfficialSearch(query: string, days = 7, subreddit?: string): Promise<SearchResult> {
  if (!process.env.REDDIT_CLIENT_ID || !process.env.REDDIT_CLIENT_SECRET) {
    return { disabled: true, query, items: [], count: 0, providers: [skippedProvider('reddit_oauth', 'REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET not configured')] };
  }

  try {
    const token = await redditAccessToken();
    if (!token) {
      return { disabled: true, query, items: [], count: 0, providers: [skippedProvider('reddit_oauth', 'Reddit OAuth token unavailable')] };
    }

    const url = new URL(subreddit
      ? `${REDDIT_OAUTH_URL}/r/${encodeURIComponent(subreddit)}/search`
      : `${REDDIT_OAUTH_URL}/search`);
    url.searchParams.set('q', query);
    url.searchParams.set('sort', 'new');
    url.searchParams.set('t', days <= 1 ? 'day' : days <= 7 ? 'week' : 'month');
    url.searchParams.set('limit', '10');
    if (subreddit) url.searchParams.set('restrict_sr', '1');

    const r = await fetchWithTimeout(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': process.env.REDDIT_USER_AGENT || UA,
      },
    }, 12000);
    if (!r.ok) return { disabled: false, query, items: [], count: 0, providers: [errorProvider('reddit_oauth', `HTTP ${r.status}`)] };
    const j = await r.json();
    const items: SearchItem[] = (j.data?.children || [])
      .map((x: any) => x.data)
      .filter((x: any) => x?.created_utc >= redditAfter(days))
      .slice(0, 10)
      .map((x: any) => ({
        provider: 'reddit_oauth',
        url: x.permalink ? `https://www.reddit.com${x.permalink}` : x.url,
        title: x.title,
        content: ['Reddit', x.subreddit_name_prefixed, x.selftext].filter(Boolean).join(' | ').slice(0, 600),
        score: x.score || 0,
        published_date: x.created_utc ? new Date(x.created_utc * 1000).toISOString() : undefined,
      }));
    return resultFromItems(query, items, 10, [providerStatus('reddit_oauth', items, subreddit ? `r/${subreddit}` : 'global')]);
  } catch (error) {
    return { disabled: false, query, items: [], count: 0, providers: [errorProvider('reddit_oauth', error)] };
  }
}

async function redditSearch(query: string, days = 7, subreddit?: string): Promise<SearchResult> {
  try {
    const url = new URL(subreddit
      ? `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/search.json`
      : 'https://www.reddit.com/search.json');
    url.searchParams.set('q', query);
    url.searchParams.set('sort', 'new');
    url.searchParams.set('t', days <= 1 ? 'day' : days <= 7 ? 'week' : 'month');
    url.searchParams.set('limit', '8');
    if (subreddit) url.searchParams.set('restrict_sr', '1');
    const r = await fetchWithTimeout(url, { headers: { 'User-Agent': UA } });
    if (!r.ok) return { disabled: false, query, items: [], count: 0, providers: [errorProvider('reddit_public', `HTTP ${r.status}`)] };
    const j = await r.json();
    const items: SearchItem[] = (j.data?.children || [])
      .map((x: any) => x.data)
      .filter((x: any) => x?.created_utc >= redditAfter(days))
      .slice(0, 8)
      .map((x: any) => ({
        provider: 'reddit',
        url: x.permalink ? `https://www.reddit.com${x.permalink}` : x.url,
        title: x.title,
        content: ['Reddit', x.subreddit_name_prefixed, x.selftext].filter(Boolean).join(' | ').slice(0, 600),
        score: x.score || 0,
        published_date: x.created_utc ? new Date(x.created_utc * 1000).toISOString() : undefined,
      }));
    return resultFromItems(query, items, 8, [providerStatus('reddit_public', items, subreddit ? `r/${subreddit}` : 'global')]);
  } catch (error) {
    return { disabled: false, query, items: [], count: 0, providers: [errorProvider('reddit_public', error)] };
  }
}

async function stocktwitsSearch(ticker: string): Promise<SearchResult> {
  try {
    const url = `https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(ticker)}.json`;
    const r = await fetchWithTimeout(url, { headers: { 'User-Agent': UA } });
    if (!r.ok) return { disabled: false, query: ticker, items: [], count: 0, providers: [errorProvider('stocktwits', `HTTP ${r.status}`)] };
    const j = await r.json();
    const items: SearchItem[] = (j.messages || []).slice(0, 8).map((x: any) => ({
      provider: 'stocktwits',
      url: `https://stocktwits.com/${x.user?.username}/message/${x.id}`,
      title: `${ticker.toUpperCase()} Stocktwits message by ${x.user?.username || 'user'}`,
      content: (x.body || '').slice(0, 600),
      score: x.entities?.sentiment?.basic === 'Bullish'
        ? 1
        : x.entities?.sentiment?.basic === 'Bearish'
          ? -1
          : 0,
      published_date: x.created_at,
    }));
    return resultFromItems(ticker, items, 8, [providerStatus('stocktwits', items)]);
  } catch (error) {
    return { disabled: false, query: ticker, items: [], count: 0, providers: [errorProvider('stocktwits', error)] };
  }
}

async function hackerNewsSearch(ticker: string, days = 7, maxResults = 10): Promise<SearchResult> {
  const profile = getCompanyProfile(ticker);
  const queries = uniqueStrings([
    profile.ticker,
    profile.primaryName,
    ...profile.aliases,
    ...(profile.people || []).slice(0, 2),
    ...(profile.products || []).slice(0, 3),
  ]).slice(0, 7);

  try {
    const minTs = Math.floor((Date.now() - days * 86400000) / 1000);
    const results = await Promise.all(queries.map(async query => {
      const url = new URL(HN_ALGOLIA_URL);
      url.searchParams.set('query', query);
      url.searchParams.set('tags', 'story');
      url.searchParams.set('hitsPerPage', String(Math.min(maxResults, 20)));
      url.searchParams.set('numericFilters', `created_at_i>${minTs}`);
      const r = await fetchWithTimeout(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } }, 12000);
      if (!r.ok) return { query, items: [], provider: errorProvider('hacker_news', `HTTP ${r.status}`) };
      const j = await r.json();
      const items: SearchItem[] = (j.hits || []).map((row: any) => {
        const title = row.title || row.story_title || `${profile.primaryName} Hacker News discussion`;
        const itemUrl = row.url || row.story_url || (row.objectID ? `https://news.ycombinator.com/item?id=${row.objectID}` : '');
        return {
          provider: 'hacker_news',
          url: itemUrl,
          title: stripHtml(title).slice(0, 180),
          content: ['Hacker News', row.author, row.num_comments != null ? `${row.num_comments} comments` : ''].filter(Boolean).join(' | ').slice(0, 600),
          score: Number(row.points || 0) + Number(row.num_comments || 0),
          published_date: row.created_at,
        };
      }).filter((item: SearchItem) => item.title && item.url);
      return { query, items, provider: providerStatus('hacker_news', items, query) };
    }));
    const items = results.flatMap(result => result.items);
    return resultFromItems(queries.join(' | '), items, maxResults, summarizeProviders(results.map(result => result.provider)));
  } catch (error) {
    return { disabled: false, query: queries.join(' | '), items: [], count: 0, providers: [errorProvider('hacker_news', error)] };
  }
}

async function socialWebProxySearch(ticker: string, days = 7, maxResults = 8): Promise<SearchResult> {
  const profile = getCompanyProfile(ticker);
  const terms = companySocialTerms(ticker).slice(0, 8).map(quoteIfNeeded).join(' OR ');
  const query = `(${terms}) (sentiment OR bullish OR bearish OR discussion OR forum OR Reddit OR "Hacker News" OR Stocktwits OR Twitter OR X)`;
  const [google, gdelt] = await Promise.all([
    googleNewsSearch(query, days, Math.ceil(maxResults / 2)),
    gdeltSearch({
      query,
      currDate: new Date().toISOString().slice(0, 10),
      days,
      maxResults: Math.ceil(maxResults / 2),
    }),
  ]);
  const items = [...google.items, ...gdelt.items].map(item => ({
    ...item,
    provider: 'web_social_proxy',
    content: ['Web social proxy', item.provider, item.content].filter(Boolean).join(' | ').slice(0, 600),
  }));
  return resultFromItems(query, items, maxResults, summarizeProviders([
    ...(google.providers || []),
    ...(gdelt.providers || []),
    providerStatus('web_social_proxy', items, profile.primaryName),
  ]));
}

function eastmoneyGubaCode(ticker: string) {
  return parseTicker(ticker).eastmoneyCode;
}

function extractEastmoneyArticleList(html: string) {
  const marker = 'var article_list=';
  const start = html.indexOf(marker);
  if (start < 0) return null;
  const jsonStart = html.indexOf('{', start + marker.length);
  if (jsonStart < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let jsonEnd = -1;
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
        jsonEnd = i + 1;
        break;
      }
    }
  }
  if (jsonEnd < 0) return null;
  const jsonText = html.slice(jsonStart, jsonEnd);
  return JSON.parse(jsonText);
}

async function eastmoneyGubaSearch(ticker: string, maxResults = 8): Promise<SearchItem[]> {
  const profile = getCompanyProfile(ticker);
  const symbols = uniqueStrings([profile.ticker, ...(profile.altTickers || [])]);
  const items: SearchItem[] = [];

  for (const symbol of symbols) {
    try {
      const code = eastmoneyGubaCode(symbol);
      const url = `https://guba.eastmoney.com/list,${code}.html`;
      const r = await fetchWithTimeout(url, {
        headers: {
          'User-Agent': UA,
          Referer: 'https://guba.eastmoney.com/',
        },
      });
      if (!r.ok) continue;
      const html = await r.text();
      const data = extractEastmoneyArticleList(html);
      const posts = data?.re || [];
      items.push(...posts.slice(0, maxResults).map((x: any) => {
        const id = x.post_id || x.post_source_id || x.post_source_id_str || '';
        const title = stripXml(x.post_title || x.post_content || '').slice(0, 120);
        const content = stripXml(x.post_content || x.post_abstract || '').slice(0, 600);
        const score = numberFromAny(x.post_like_count) + numberFromAny(x.post_comment_count);
        return {
          provider: 'eastmoney_guba',
          url: id ? `https://guba.eastmoney.com/news,${code},${id}.html` : url,
          title: title || `${symbol} Eastmoney Guba post`,
          content: ['东方财富股吧', content].filter(Boolean).join(' | '),
          score,
          published_date: parseDate(x.post_publish_time || x.post_display_time),
        };
      }));
    } catch {
      // Try the next share class / alternate ticker.
    }
  }

  return dedupeItems(items, maxResults);
}

function numberFromAny(value: any) {
  const n = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function socialQueries(ticker: string) {
  const profile = getCompanyProfile(ticker);
  const parsed = parseTicker(ticker);
  const companyTerms = companySearchTerms(ticker).slice(0, 6);
  const socialTerms = companySocialTerms(ticker);
  const peopleTerms = uniqueStrings(profile.people || []).slice(0, 4);
  const productTerms = uniqueStrings([...(profile.products || []), ...(profile.socialAliases || [])]).slice(0, 6);
  const contextTerms = uniqueStrings([...peopleTerms, ...productTerms]).slice(0, 8);
  if (parsed.market === 'CRYPTO') {
    return uniqueStrings([
      `${profile.ticker} ${parsed.code} crypto sentiment price market cap`,
      `${quoteIfNeeded(profile.primaryName)} crypto investors traders`,
      `${companyTerms.map(quoteIfNeeded).join(' OR ')} ETF regulation liquidity`,
      contextTerms.length
        ? `${contextTerms.map(quoteIfNeeded).join(' OR ')} ${quoteIfNeeded(profile.primaryName)} sentiment`
        : '',
      `${socialTerms.slice(0, 8).map(quoteIfNeeded).join(' OR ')} bullish bearish on-chain`,
    ]);
  }
  return uniqueStrings([
    `${profile.ticker} stock earnings valuation sentiment`,
    `${quoteIfNeeded(profile.primaryName)} stock investors`,
    `${companyTerms.map(quoteIfNeeded).join(' OR ')} shares investors`,
    contextTerms.length
      ? `${contextTerms.map(quoteIfNeeded).join(' OR ')} ${quoteIfNeeded(profile.primaryName)} demand sentiment`
      : '',
    `${socialTerms.slice(0, 8).map(quoteIfNeeded).join(' OR ')} bullish bearish short squeeze`,
  ]);
}

async function socialFallback(ticker: string, days = 7): Promise<SearchResult> {
  const profile = getCompanyProfile(ticker);
  const symbols = uniqueStrings([profile.ticker, ...(profile.altTickers || [])]);
  const queries = socialQueries(ticker);
  const grokQuery = xQuery(ticker);
  const subreddits = ['stocks', 'investing', 'wallstreetbets', 'SecurityAnalysis'];
  const redditQueries = queries.slice(0, 4);
  const [eastmoney, stocktwits, redditOfficial, redditGlobal, redditFocused, xRecent, grokX, hackerNews, webProxy] = await Promise.all([
    eastmoneyGubaSearch(ticker, 10).catch(error => {
      console.warn('[news] eastmoney_guba failed', error);
      return [];
    }),
    Promise.all(symbols.map(symbol => safeSearchResult('stocktwits', symbol, () => stocktwitsSearch(symbol)))),
    Promise.all([
      ...redditQueries.map(query => safeSearchResult('reddit_oauth', query, () => redditOfficialSearch(query, days))),
      ...subreddits.flatMap(sub => redditQueries.map(query => safeSearchResult('reddit_oauth', `${sub}:${query}`, () => redditOfficialSearch(query, days, sub)))),
    ]),
    Promise.all(redditQueries.map(query => safeSearchResult('reddit_public', query, () => redditSearch(query, days)))),
    Promise.all(subreddits.flatMap(sub => redditQueries.map(query => safeSearchResult('reddit_public', `${sub}:${query}`, () => redditSearch(query, days, sub))))),
    safeSearchResult('x_recent', ticker, () => xRecentSearch(ticker, 12)),
    safeSearchResult('grok_x_search', grokQuery, () => grokXSearch({
      query: grokQuery,
      days,
      maxResults: 8,
      provider: 'grok_x_search',
      focus: `${profile.primaryName} investor sentiment, product demand, earnings expectations, valuation debate, and notable X narratives`,
    })),
    safeSearchResult('hacker_news', ticker, () => hackerNewsSearch(ticker, days, 10)),
    safeSearchResult('web_social_proxy', ticker, () => socialWebProxySearch(ticker, days, 8)),
  ]);
  const stocktwitsItems = stocktwits.flatMap(result => result.items);
  const redditOfficialItems = redditOfficial.flatMap(result => result.items);
  const redditPublic = [...redditGlobal, ...redditFocused.flat()];
  const redditItems = redditPublic.flatMap(result => result.items);
  const items = [
    ...grokX.items,
    ...xRecent.items,
    ...hackerNews.items,
    ...webProxy.items,
    ...redditOfficialItems,
    ...eastmoney,
    ...stocktwitsItems,
    ...redditItems,
  ];
  return resultFromItems(queries.join(' | '), items, 12, [
    ...summarizeProviders([
      ...(grokX.providers || []),
      ...(xRecent.providers || []),
      ...(hackerNews.providers || []),
      ...(webProxy.providers || []),
      ...redditOfficial.flatMap(result => result.providers || []),
      ...redditPublic.flatMap(result => result.providers || []),
      ...stocktwits.flatMap(result => result.providers || []),
      providerStatus('eastmoney_guba', eastmoney),
    ]),
  ]);
}

function weekBucket(date: string): string {
  const d = new Date(date);
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
  return `${d.getFullYear()}W${String(week).padStart(2, '0')}`;
}

export async function searchCompanyNews(ticker: string, currDate: string, days = 7) {
  const company = ticker.toUpperCase();
  const cacheKey = `cache:news:company:${company}:${weekBucket(currDate)}:${days}d:v3:${providerStateKey()}`;
  return memo(cacheKey, async () => {
    const queries = companyNewsQueries(company);
    const profile = getCompanyProfile(company);
    const parsed = parseTicker(company);
    const tavily = process.env.TAVILY_API_KEY
      ? await tavilySearch({
          query: queries[0],
          domains: uniqueStrings([
            ...FINANCIAL_DOMAINS,
            ...(parsed.market === 'CRYPTO' ? CRYPTO_DOMAINS : []),
            ...(profile.officialDomains || []),
          ]),
          days,
          maxResults: 10,
          topic: 'news',
        })
      : { disabled: true, query: queries[0], items: [], count: 0, providers: [skippedProvider('tavily', 'TAVILY_API_KEY not configured')] };

    const fallback = await aggregateCompanyNews(company, currDate, days, 14);
    return mergeResults(
      [tavily.query, fallback.query].filter(Boolean).join(' | '),
      [tavily as SearchResult, fallback],
      14,
    );
  });
}

export async function searchMacroNews(currDate: string, days = 7) {
  const cacheKey = `cache:news:macro:${weekBucket(currDate)}:${days}d:v3:${providerStateKey()}`;
  return memo(cacheKey, async () => {
    const query = 'Federal Reserve interest rates inflation macro market outlook';
    const grokQuery = 'Federal Reserve inflation interest rates liquidity Treasury yields US economy AI capex US China tariffs stock market';
    const [tavily, google, gdelt, grokX] = await Promise.all([
      process.env.TAVILY_API_KEY
        ? tavilySearch({
            query,
            domains: FINANCIAL_DOMAINS,
            days,
            maxResults: 6,
            topic: 'news',
          })
        : Promise.resolve({ disabled: true, query, items: [], count: 0, providers: [skippedProvider('tavily', 'TAVILY_API_KEY not configured')] }),
      googleNewsSearch(query, days, 6),
      gdeltSearch({
        query: '"Federal Reserve" OR inflation OR "interest rates" "stock market"',
        currDate,
        days,
        maxResults: 6,
      }),
      grokXSearch({
        query: grokQuery,
        currDate,
        days,
        maxResults: 6,
        provider: 'grok_x_macro',
        focus: 'macro policy, rates, liquidity, growth, inflation, geopolitics, and equity risk appetite narratives on X',
      }),
    ]);
    return mergeResults(
      [tavily.query, google.query, gdelt.query, grokX.query].join(' | '),
      [tavily as SearchResult, google, gdelt, grokX],
      10,
    );
  });
}

function sectorTrendQueries(ticker: string) {
  const profile = getCompanyProfile(ticker);
  const parsed = parseTicker(ticker);
  const primary = quoteIfNeeded(profile.primaryName);
  const products = uniqueStrings([...(profile.products || []), ...profile.aliases])
    .slice(0, 8)
    .map(quoteIfNeeded)
    .join(' OR ');
  if (parsed.market === 'CRYPTO') {
    return uniqueStrings([
      `${primary} crypto market cycle liquidity ETF regulation on-chain adoption`,
      products ? `(${products}) crypto demand flows exchange volume DeFi ecosystem` : '',
      `${parsed.code} competitors layer one tokenomics staking developer activity`,
      `${primary} Binance Coinbase CoinMarketCap CoinGecko market update`,
    ]);
  }
  return uniqueStrings([
    `${primary} industry trend demand outlook sector`,
    products ? `(${products}) industry demand growth regulation supply chain outlook` : '',
    `${primary} competitors market share pricing demand outlook`,
    `${primary} sector trend earnings guidance capex margin`,
  ]);
}

function fundamentalResearchQueries(ticker: string) {
  const profile = getCompanyProfile(ticker);
  const parsed = parseTicker(ticker);
  const identityTerms = parsed.market === 'CRYPTO'
    ? [
        parsed.code,
        `$${parsed.code}`,
        profile.primaryName,
        ...profile.aliases,
        ...(profile.socialAliases || []),
      ]
    : [
        profile.ticker,
        parsed.symbol,
        parsed.code,
        profile.primaryName,
        ...profile.aliases,
        ...(profile.altTickers || []),
      ];
  const identity = uniqueStrings(identityTerms)
    .slice(0, 8)
    .map(quoteIfNeeded)
    .join(' OR ');
  const products = uniqueStrings([...(profile.products || []), ...profile.aliases])
    .slice(0, 8)
    .map(quoteIfNeeded)
    .join(' OR ');

  const common = uniqueStrings([
    `(${identity}) fundamentals valuation earnings revenue margin guidance analyst report`,
    `(${identity}) annual report interim results investor presentation financial results`,
    `(${identity}) 研报 基本面 估值 业绩 收入 利润 毛利率 目标价 评级`,
    products ? `(${products}) (${identity}) 增长 空间 竞争格局 毛利率 盈利预测` : '',
  ]);

  if (parsed.market === 'CRYPTO') {
    return uniqueStrings([
      `(${identity}) crypto fundamentals market cap tokenomics supply liquidity volume`,
      `(${identity}) on-chain metrics exchange reserves ETF flows regulation staking`,
      `(${identity}) CoinMarketCap CoinGecko Binance research price analysis`,
      `site:coinmarketcap.com (${parsed.code} OR ${profile.primaryName})`,
      `site:coingecko.com (${parsed.code} OR ${profile.primaryName})`,
      `site:binance.com (${parsed.code} USDT OR ${profile.primaryName}) announcement research`,
      `site:coindesk.com (${parsed.code} OR ${profile.primaryName})`,
      `site:theblock.co (${parsed.code} OR ${profile.primaryName})`,
    ]);
  }

  if (parsed.market === 'HK') {
    return uniqueStrings([
      ...common,
      `site:hkexnews.hk (${parsed.code} OR ${profile.primaryName}) annual report results announcement`,
      `site:hkexnews.hk (${parsed.code} OR ${profile.primaryName}) 年报 中期业绩 业绩公告`,
      `site:aastocks.com (${identity}) 目标价 评级 业绩`,
      `site:etnet.com.hk (${identity}) 目标价 评级 业绩`,
      `site:pdf.dfcfw.com (${identity}) 港股 研报 盈利预测`,
    ]);
  }

  if (parsed.market === 'CN_SH' || parsed.market === 'CN_SZ') {
    return uniqueStrings([
      ...common,
      `site:pdf.dfcfw.com (${identity}) 研报 盈利预测 目标价`,
      `site:data.eastmoney.com (${identity}) 财务指标 业绩`,
      `site:cninfo.com.cn (${parsed.code} OR ${profile.primaryName}) 年报 季报 业绩说明会`,
    ]);
  }

  return common;
}

function exchangeOfficialQueries(ticker: string) {
  const profile = getCompanyProfile(ticker);
  const parsed = parseTicker(ticker);
  const identity = uniqueStrings([
    parsed.code,
    parsed.symbol,
    profile.primaryName,
    ...profile.aliases,
  ])
    .slice(0, 7)
    .map(quoteIfNeeded)
    .join(' OR ');

  if (parsed.market !== 'CN_SH' && parsed.market !== 'CN_SZ') return [];

  const common = '监管 问询 函 公告 风险提示 交易提示 信息披露 纪律处分';
  const listingExchange = parsed.market === 'CN_SH' ? 'sse_official' : 'szse_official';
  const listingQuery = parsed.market === 'CN_SH'
    ? `site:sse.com.cn (${identity}) ${common}`
    : `site:szse.cn (${identity}) ${common}`;

  return [
    { provider: listingExchange, query: listingQuery },
    { provider: 'sse_official', query: `site:sse.com.cn (${identity}) ${common}` },
    { provider: 'szse_official', query: `site:szse.cn (${identity}) ${common}` },
    { provider: 'bse_official', query: `site:bse.cn (${identity}) ${common}` },
  ].filter((item, index, arr) => arr.findIndex(other => other.provider === item.provider && other.query === item.query) === index);
}

function retagResult(result: SearchResult, provider: string): SearchResult {
  const items = (result.items || []).map(item => ({ ...item, provider }));
  const status: ProviderStat['status'] = result.disabled
    ? 'skipped'
    : items.length
      ? 'ok'
      : 'empty';
  return {
    ...result,
    items,
    count: items.length,
    providers: [{
      provider,
      count: items.length,
      status,
      detail: result.providers?.map(p => `${p.provider}:${p.status}${p.count ? `(${p.count})` : ''}`).join('; '),
    }],
  };
}

async function exchangeOfficialSearch(ticker: string, days = 365): Promise<SearchResult> {
  const queries = exchangeOfficialQueries(ticker);
  if (!queries.length) {
    return {
      disabled: true,
      query: ticker,
      items: [],
      count: 0,
      providers: [skippedProvider('exchange_official', 'A-share symbols only')],
    };
  }

  const results = await Promise.all(queries.flatMap(({ provider, query }) => [
    safeSearchResult(provider, query, async () => retagResult(await duckDuckGoSearch(query, 6), provider)),
    safeSearchResult(provider, query, async () => retagResult(await googleNewsSearch(query, days, 4), provider)),
  ]));

  return mergeResults(
    queries.map(item => item.query).join(' | '),
    results,
    12,
  );
}

export async function searchFundamentalResearch(ticker: string, currDate: string, days = 365) {
  const company = ticker.toUpperCase();
  const cacheKey = `cache:news:fundamental-research:${company}:${weekBucket(currDate)}:${days}d:v1:${providerStateKey()}`;
  return memo(cacheKey, async () => {
    const queries = fundamentalResearchQueries(company);
    const parsed = parseTicker(company);
    const profile = getCompanyProfile(company);

    const tavily = process.env.TAVILY_API_KEY
      ? await tavilySearch({
          query: queries[0],
          domains: FUNDAMENTAL_RESEARCH_DOMAINS,
          days,
          maxResults: 8,
          topic: 'general',
        })
      : { disabled: true, query: queries[0], items: [], count: 0, providers: [skippedProvider('tavily', 'TAVILY_API_KEY not configured')] };

    const [googlePrimary, googleChinese, webPrimary, webChinese, gdelt, hkex, cninfo, exchangeOfficial, yahoo] = await Promise.all([
      safeSearchResult('google_news_rss', queries[0], () => googleNewsSearch(queries[0], days, 8)),
      safeSearchResult('google_news_rss', queries[2] || queries[0], () => googleNewsSearch(queries[2] || queries[0], days, 8)),
      safeSearchResult('duckduckgo_html', queries[0], () => duckDuckGoSearch(queries[0], 8)),
      safeSearchResult('duckduckgo_html', queries[2] || queries[0], () => duckDuckGoSearch(queries[2] || queries[0], 8)),
      safeSearchResult('gdelt', queries[0], () => gdeltSearch({
        query: queries.slice(0, 3).join(' OR '),
        currDate,
        days,
        maxResults: 8,
      })),
      safeSearchResult('hkex_rss', company, () => parsed.market === 'HK'
        ? hkexRssNews(company, 8)
        : Promise.resolve({ disabled: true, query: company, items: [], count: 0, providers: [skippedProvider('hkex_rss', 'HK symbols only')] })),
      safeSearchResult('cninfo', company, () => (parsed.market === 'CN_SH' || parsed.market === 'CN_SZ')
        ? searchCninfoAnnouncements(company, 12)
        : Promise.resolve({ disabled: true, query: company, items: [], count: 0, providers: [skippedProvider('cninfo', 'A-share symbols only')] })),
      safeSearchResult('exchange_official', company, () => exchangeOfficialSearch(company, days)),
      safeSearchResult('yahoo_finance', company, () => yahooCompanyNews(company, 8)),
    ]);

    const siteSearches = await Promise.all(
      queries.slice(3, 8).flatMap(query => [
        safeSearchResult('google_news_rss', query, () => googleNewsSearch(query, days, 5)),
        safeSearchResult('duckduckgo_html', query, () => duckDuckGoSearch(query, 5)),
      ]),
    );

    return mergeResults(
      [
        tavily.query,
        googlePrimary.query,
        googleChinese.query,
        webPrimary.query,
        webChinese.query,
        gdelt.query,
        hkex.query,
        cninfo.query,
        exchangeOfficial.query,
        yahoo.query,
        profile.primaryName,
      ]
        .filter(Boolean)
        .join(' | '),
      [tavily as SearchResult, googlePrimary, googleChinese, webPrimary, webChinese, gdelt, hkex, cninfo, exchangeOfficial, yahoo, ...siteSearches],
      14,
    );
  });
}

export async function searchSectorTrend(ticker: string, currDate: string, days = 14) {
  const company = ticker.toUpperCase();
  const cacheKey = `cache:news:sector:${company}:${weekBucket(currDate)}:${days}d:v2:${providerStateKey()}`;
  return memo(cacheKey, async () => {
    const queries = sectorTrendQueries(company);
    const profile = getCompanyProfile(company);
    const parsed = parseTicker(company);
    const tavily = process.env.TAVILY_API_KEY
      ? await tavilySearch({
          query: queries[0],
          domains: parsed.market === 'CRYPTO' ? uniqueStrings([...FINANCIAL_DOMAINS, ...CRYPTO_DOMAINS]) : FINANCIAL_DOMAINS,
          days,
          maxResults: 8,
          topic: 'news',
      })
      : { disabled: true, query: queries[0], items: [], count: 0, providers: [skippedProvider('tavily', 'TAVILY_API_KEY not configured')] };
    const [googlePrimary, googleSecondary, gdelt, grokX] = await Promise.all([
      googleNewsSearch(queries[0], days, 8),
      googleNewsSearch(queries[1] || queries[0], days, 6),
      gdeltSearch({
        query: queries.slice(0, 3).join(' OR '),
        currDate,
        days,
        maxResults: 8,
      }),
      grokXSearch({
        query: `${queries[0]} ${companySocialTerms(company).slice(0, 5).map(quoteIfNeeded).join(' OR ')}`,
        currDate,
        days,
        maxResults: 6,
        provider: 'grok_x_sector',
        focus: `${profile.primaryName} sector cycle, demand, supply chain, competitors, regulation, and industry narratives on X`,
      }),
    ]);
    return mergeResults(
      [tavily.query, googlePrimary.query, googleSecondary.query, gdelt.query, grokX.query].filter(Boolean).join(' | '),
      [tavily as SearchResult, googlePrimary, googleSecondary, gdelt, grokX],
      12,
    );
  });
}

export async function searchSocial(ticker: string, days = 7) {
  const company = ticker.toUpperCase();
  const cacheKey = `cache:news:social:${company}:${weekBucket(new Date().toISOString().slice(0, 10))}:${days}d:v7:${providerStateKey()}`;

  try {
    const cached = await kvGet<SearchResult>(cacheKey);
    if (cached != null) return cached;
  } catch (e) {
    console.warn('[cache] social read failed for', cacheKey, e);
  }

  const fresh = await (async () => {
    const queries = socialQueries(company);
    const tavily = process.env.TAVILY_API_KEY
      ? await tavilySearch({
          query: queries[0],
          domains: SOCIAL_DOMAINS,
          days,
          maxResults: 8,
          topic: 'general',
        })
      : { disabled: true, query: queries[0], items: [], count: 0, providers: [skippedProvider('tavily', 'TAVILY_API_KEY not configured')] };
    const fallback = await socialFallback(company, days);
    return mergeResults(
      [tavily.query, fallback.query].filter(Boolean).join(' | '),
      [tavily as SearchResult, fallback],
      12,
    );
  })();

  try {
    await kvSet(cacheKey, fresh, fresh.count > 0 ? 3600 : 300);
  } catch (e) {
    console.warn('[cache] social write failed for', cacheKey, e);
  }

  return fresh;
}
