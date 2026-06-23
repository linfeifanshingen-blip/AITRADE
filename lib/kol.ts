import { getCompanyProfile } from './company';

export interface KolWatchItem {
  handle: string;
  name: string;
  role: string;
  reason: string;
}

const GENERAL_MARKET_KOLS: KolWatchItem[] = [
  { handle: 'danives', name: 'Dan Ives', role: '美股科技分析师', reason: '长期跟踪大型科技股、AI 与软件/硬件资本开支叙事' },
  { handle: 'GeneMunster', name: 'Gene Munster', role: '科技投资人/研究员', reason: '关注大型科技公司、AI 应用周期与估值预期' },
  { handle: 'StockMKTNewz', name: 'StockMKTNewz', role: '美股市场新闻账号', reason: '高频聚合公司事件、财报和市场反应' },
  { handle: 'unusual_whales', name: 'Unusual Whales', role: '期权/市场流向观察者', reason: '跟踪期权流、异动交易和热门股票叙事' },
];

const SEMI_AI_KOLS: KolWatchItem[] = [
  { handle: 'dylan522p', name: 'Dylan Patel', role: '半导体/AI 基建分析师', reason: '长期跟踪 AI GPU、HBM、数据中心资本开支和供应链' },
  { handle: 'patrickmoorhead', name: 'Patrick Moorhead', role: '科技产业分析师', reason: '覆盖半导体、云计算、AI PC 和企业科技供应链' },
  { handle: 'Beth_Kindig', name: 'Beth Kindig', role: '科技成长股研究员', reason: '持续讨论 AI 受益股、估值弹性和成长股周期' },
  { handle: 'SemiAnalysis_', name: 'SemiAnalysis', role: '半导体研究机构', reason: '深度覆盖 AI 加速器、数据中心和半导体竞争格局' },
];

const EV_KOLS: KolWatchItem[] = [
  { handle: 'SawyerMerritt', name: 'Sawyer Merritt', role: '电动车/特斯拉观察者', reason: '高频跟踪特斯拉、交付、FSD、Robotaxi 和管理层动态' },
  { handle: 'TroyTeslike', name: 'Troy Teslike', role: '特斯拉交付数据观察者', reason: '长期跟踪 Tesla 订单、产能和交付预估' },
  { handle: 'garyblack00', name: 'Gary Black', role: '投资经理/特斯拉观察者', reason: '持续讨论 TSLA 估值、需求、管理层和产品周期' },
  { handle: 'WholeMarsBlog', name: 'Whole Mars Catalog', role: 'Tesla/FSD KOL', reason: '跟踪 Tesla、FSD 和自动驾驶叙事热度' },
];

const CRYPTO_EQUITY_KOLS: KolWatchItem[] = [
  { handle: 'saylor', name: 'Michael Saylor', role: 'Strategy 创始人/比特币倡导者', reason: '直接影响 MSTR 比特币财库叙事与市场关注度' },
  { handle: 'BitcoinMagazine', name: 'Bitcoin Magazine', role: '比特币媒体', reason: '高频覆盖 BTC 价格、机构需求和政策叙事' },
  { handle: 'APompliano', name: 'Anthony Pompliano', role: '加密投资人/媒体人', reason: '长期讨论 BTC、机构采用和加密股票叙事' },
  { handle: 'DocumentingBTC', name: 'Documenting Bitcoin', role: '比特币叙事账号', reason: '跟踪 BTC 新闻、链上/政策事件和市场情绪' },
];

const CRYPTO_GENERAL_KOLS: KolWatchItem[] = [
  { handle: 'VitalikButerin', name: 'Vitalik Buterin', role: '以太坊联合创始人', reason: '直接影响 ETH 技术路线、生态叙事与开发者关注度' },
  { handle: 'sassal0x', name: 'Anthony Sassano', role: 'Ethereum 社区/KOL', reason: '长期跟踪 ETH、质押、L2 与生态情绪' },
  { handle: 'BanklessHQ', name: 'Bankless', role: '加密研究媒体', reason: '覆盖 ETH、DeFi、ETF、链上活动与资金流叙事' },
  { handle: 'WuBlockchain', name: 'Wu Blockchain', role: '加密新闻账号', reason: '高频跟踪交易所、监管、亚洲市场和主流币种事件' },
  { handle: 'CoinDesk', name: 'CoinDesk', role: '加密权威媒体', reason: '覆盖主流币、监管、ETF、机构资金与交易所事件' },
];

const SOFTWARE_AI_KOLS: KolWatchItem[] = [
  { handle: 'thecaptableco', name: 'The Cap Table', role: '软件/AI 投资观察者', reason: '关注 SaaS、AI 软件和成长股估值重估' },
  { handle: 'hhhypergrowth', name: 'Muji', role: '高增长科技股 KOL', reason: '长期跟踪高成长软件、AI 应用和美股成长叙事' },
];

function unique(items: KolWatchItem[]) {
  const seen = new Set<string>();
  const out: KolWatchItem[] = [];
  for (const item of items) {
    const key = item.handle.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function kolWatchlistForTicker(ticker: string): KolWatchItem[] {
  const profile = getCompanyProfile(ticker);
  const haystack = [
    profile.ticker,
    profile.primaryName,
    ...(profile.aliases || []),
    ...(profile.products || []),
    ...(profile.socialAliases || []),
  ].join(' ').toLowerCase();

  const themed: KolWatchItem[] = [];
  if (/(semiconductor|chip|gpu|cuda|blackwell|h100|h200|gb200|ai chip|data center|nvidia|amd|intel|broadcom|tsmc)/i.test(haystack)) {
    themed.push(...SEMI_AI_KOLS);
  }
  if (/(tesla|ev|robotaxi|fsd|electric vehicle|nio|xpeng|li auto)/i.test(haystack)) {
    themed.push(...EV_KOLS);
  }
  if (/(bitcoin|btc|microstrategy|strategy|coinbase|crypto)/i.test(haystack)) {
    themed.push(...CRYPTO_EQUITY_KOLS);
  }
  if (/(crypto|ethereum|eth|solana|sol|bnb|xrp|doge|cardano|ada|defi|staking|tokenomics|on-chain|etf flows)/i.test(haystack)) {
    themed.push(...CRYPTO_GENERAL_KOLS);
  }
  if (/(software|saas|cloud|ai agents|agentforce|palantir|oracle|salesforce|servicenow|adobe)/i.test(haystack)) {
    themed.push(...SOFTWARE_AI_KOLS);
  }

  return unique([...themed, ...GENERAL_MARKET_KOLS]).slice(0, 10);
}
