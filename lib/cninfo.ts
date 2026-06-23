import { memo } from './cache';
import { getCompanyProfile } from './company';
import { parseTicker } from './markets';

const CNINFO_BASE = 'https://www.cninfo.com.cn';
const CNINFO_STATIC_BASE = 'https://static.cninfo.com.cn';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36';

interface CninfoSecurity {
  code: string;
  orgId: string;
  name: string;
  category?: string;
  type?: string;
}

export interface CninfoAnnouncement {
  provider: 'cninfo';
  title: string;
  url: string;
  pdfUrl: string | null;
  content: string;
  published_date?: string;
  score: number;
  announcementId?: string;
  secCode?: string;
  secName?: string;
  orgId?: string;
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

function stripHtml(value: any) {
  return String(value || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function dateFromMillis(value: any) {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return new Date(n).toISOString().slice(0, 10);
}

function marketParams(symbol: string) {
  const parsed = parseTicker(symbol);
  if (parsed.market !== 'CN_SH' && parsed.market !== 'CN_SZ') {
    throw new Error(`CNINFO supports A-share symbols only, got ${parsed.symbol}`);
  }
  const isShanghai = parsed.market === 'CN_SH';
  return {
    parsed,
    column: isShanghai ? 'sse' : 'szse',
    plate: isShanghai ? 'sse' : 'szse',
  };
}

async function resolveCninfoSecurity(symbol: string): Promise<CninfoSecurity> {
  const { parsed } = marketParams(symbol);
  const profile = getCompanyProfile(parsed.symbol);
  const keywords = [parsed.code, profile.primaryName, ...profile.aliases].filter(Boolean);

  for (const keyword of keywords) {
    const url = new URL(`${CNINFO_BASE}/new/information/topSearch/query`);
    url.searchParams.set('keyWord', keyword);
    url.searchParams.set('maxNum', '10');
    const r = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        Referer: `${CNINFO_BASE}/new/index`,
        Accept: 'application/json, text/plain, */*',
        'X-Requested-With': 'XMLHttpRequest',
      },
    }, 10000);
    if (!r.ok) continue;
    const rows = await r.json();
    const list = Array.isArray(rows) ? rows : [];
    const exact = list.find((row: any) => String(row.code) === parsed.code) || list[0];
    if (exact?.code && exact?.orgId) {
      return {
        code: String(exact.code),
        orgId: String(exact.orgId),
        name: String(exact.zwjc || exact.name || exact.code),
        category: exact.category,
        type: exact.type,
      };
    }
  }

  throw new Error(`CNINFO security lookup empty for ${parsed.symbol}`);
}

function cninfoDetailUrl(row: any) {
  const date = dateFromMillis(row.announcementTime) || '';
  const url = new URL(`${CNINFO_BASE}/new/disclosure/detail`);
  url.searchParams.set('stockCode', String(row.secCode || ''));
  url.searchParams.set('announcementId', String(row.announcementId || ''));
  url.searchParams.set('orgId', String(row.orgId || ''));
  url.searchParams.set('announcementTime', date);
  return url.toString();
}

function cninfoPdfUrl(row: any) {
  const adjunctUrl = String(row.adjunctUrl || '').trim();
  if (!adjunctUrl) return null;
  if (/^https?:\/\//i.test(adjunctUrl)) return adjunctUrl;
  return `${CNINFO_STATIC_BASE}/${adjunctUrl.replace(/^\/+/, '')}`;
}

async function queryCninfoPage({
  symbol,
  searchkey = '',
  category = '',
  pageSize = 10,
}: {
  symbol: string;
  searchkey?: string;
  category?: string;
  pageSize?: number;
}) {
  const { parsed, column, plate } = marketParams(symbol);
  const security = await resolveCninfoSecurity(parsed.symbol);
  const body = new URLSearchParams({
    pageNum: '1',
    pageSize: String(pageSize),
    column,
    tabName: 'fulltext',
    plate,
    stock: `${security.code},${security.orgId}`,
    searchkey,
    secid: '',
    category,
    trade: '',
    seDate: '',
    sortName: '',
    sortType: '',
    isHLtitle: 'true',
  });

  const r = await fetchWithTimeout(`${CNINFO_BASE}/new/hisAnnouncement/query`, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      Referer: `${CNINFO_BASE}/new/commonUrl?url=disclosure/list/notice`,
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body,
  }, 12000);
  if (!r.ok) throw new Error(`CNINFO announcement query HTTP ${r.status}`);
  const data = await r.json();
  const announcements = Array.isArray(data?.announcements) ? data.announcements : [];
  return announcements.map((row: any): CninfoAnnouncement => {
    const title = stripHtml(row.announcementTitle || row.shortTitle);
    const published = dateFromMillis(row.announcementTime);
    const pdfUrl = cninfoPdfUrl(row);
    return {
      provider: 'cninfo',
      title,
      url: cninfoDetailUrl(row),
      pdfUrl,
      content: [
        'CNINFO 巨潮资讯',
        stripHtml(row.secName || security.name),
        published,
        row.adjunctType ? `type:${row.adjunctType}` : null,
        row.adjunctSize ? `size:${row.adjunctSize}KB` : null,
        pdfUrl ? `PDF:${pdfUrl}` : null,
      ].filter(Boolean).join(' | '),
      published_date: published,
      score: 0,
      announcementId: row.announcementId,
      secCode: row.secCode,
      secName: stripHtml(row.secName || security.name),
      orgId: row.orgId || security.orgId,
    };
  });
}

function dedupeAnnouncements(items: CninfoAnnouncement[], maxResults: number) {
  const seen = new Set<string>();
  const clean: CninfoAnnouncement[] = [];
  for (const item of items) {
    const key = item.announcementId || item.pdfUrl || item.title;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    clean.push(item);
    if (clean.length >= maxResults) break;
  }
  return clean;
}

export async function searchCninfoAnnouncements(symbol: string, maxResults = 12) {
  const parsed = parseTicker(symbol);
  const cacheKey = `cache:cninfo:announcements:${parsed.symbol}:v1`;
  return memo(cacheKey, async () => {
    const [latest, annual, performance, risk] = await Promise.all([
      queryCninfoPage({ symbol: parsed.symbol, pageSize: 10 }),
      queryCninfoPage({ symbol: parsed.symbol, category: 'category_ndbg_szsh', pageSize: 8 }),
      queryCninfoPage({ symbol: parsed.symbol, searchkey: '业绩', pageSize: 8 }),
      queryCninfoPage({ symbol: parsed.symbol, searchkey: '减值 风险 诉讼 监管 问询', pageSize: 6 }),
    ]);

    const items = dedupeAnnouncements([...latest, ...annual, ...performance, ...risk], maxResults);
    return {
      disabled: false,
      query: `${parsed.symbol} CNINFO annual report performance risk announcements`,
      items,
      count: items.length,
      providers: [{ provider: 'cninfo', count: items.length, status: items.length ? 'ok' as const : 'empty' as const }],
    };
  }, { ttlSec: 6 * 3600 });
}
