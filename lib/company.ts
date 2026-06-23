export interface CompanyProfile {
  ticker: string;
  primaryName: string;
  aliases: string[];
  altTickers?: string[];
  people?: string[];
  products?: string[];
  socialAliases?: string[];
  officialNewsFeeds?: string[];
  officialNewsPages?: string[];
  officialDomains?: string[];
}

const PROFILES: Record<string, CompanyProfile> = {
  'BTC.CC': {
    ticker: 'BTC.CC',
    primaryName: 'Bitcoin',
    aliases: ['BTC', 'Bitcoin', '比特币'],
    products: ['spot bitcoin ETF flows', 'halving cycle', 'mining difficulty', 'institutional adoption', 'macro liquidity'],
    socialAliases: ['BTC', '$BTC', 'Bitcoin'],
    officialDomains: ['bitcoin.org', 'coingecko.com', 'coinmarketcap.com', 'binance.com'],
  },
  'ETH.CC': {
    ticker: 'ETH.CC',
    primaryName: 'Ethereum',
    aliases: ['ETH', 'Ethereum', '以太坊'],
    products: ['staking', 'L2 ecosystem', 'gas fees', 'DeFi', 'ETF flows', 'EIP upgrades'],
    socialAliases: ['ETH', '$ETH', 'Ethereum'],
    officialDomains: ['ethereum.org', 'coingecko.com', 'coinmarketcap.com', 'binance.com'],
  },
  'SOL.CC': {
    ticker: 'SOL.CC',
    primaryName: 'Solana',
    aliases: ['SOL', 'Solana'],
    products: ['DeFi', 'memecoins', 'DEX volume', 'validator network', 'mobile ecosystem'],
    socialAliases: ['SOL', '$SOL', 'Solana'],
    officialDomains: ['solana.com', 'coingecko.com', 'coinmarketcap.com', 'binance.com'],
  },
  'BNB.CC': {
    ticker: 'BNB.CC',
    primaryName: 'BNB',
    aliases: ['BNB', 'Binance Coin', '币安币'],
    products: ['BNB Chain', 'Binance ecosystem', 'token burn', 'exchange activity'],
    socialAliases: ['BNB', '$BNB', 'BNB Chain'],
    officialDomains: ['bnbchain.org', 'binance.com', 'coingecko.com', 'coinmarketcap.com'],
  },
  'XRP.CC': {
    ticker: 'XRP.CC',
    primaryName: 'XRP',
    aliases: ['XRP', 'Ripple', '瑞波'],
    products: ['cross-border payments', 'RippleNet', 'regulation', 'ETF narratives'],
    socialAliases: ['XRP', '$XRP', 'Ripple'],
    officialDomains: ['ripple.com', 'xrpl.org', 'coingecko.com', 'coinmarketcap.com'],
  },
  'DOGE.CC': {
    ticker: 'DOGE.CC',
    primaryName: 'Dogecoin',
    aliases: ['DOGE', 'Dogecoin', '狗狗币'],
    products: ['meme coin liquidity', 'payment narratives', 'social sentiment'],
    socialAliases: ['DOGE', '$DOGE', 'Dogecoin'],
    officialDomains: ['dogecoin.com', 'coingecko.com', 'coinmarketcap.com', 'binance.com'],
  },
  'ADA.CC': {
    ticker: 'ADA.CC',
    primaryName: 'Cardano',
    aliases: ['ADA', 'Cardano'],
    products: ['staking', 'governance', 'smart contracts', 'ecosystem TVL'],
    socialAliases: ['ADA', '$ADA', 'Cardano'],
    officialDomains: ['cardano.org', 'coingecko.com', 'coinmarketcap.com', 'binance.com'],
  },
  '00700.HK': {
    ticker: '00700.HK',
    primaryName: 'Tencent Holdings',
    aliases: ['Tencent', '腾讯', '腾讯控股', 'WeChat', '微信'],
    altTickers: ['TCEHY'],
    people: ['Pony Ma', 'Ma Huateng', '马化腾'],
    products: ['WeChat', 'WeChat Pay', 'Tencent Games', '广告', '云服务', '视频号'],
    officialDomains: ['tencent.com', 'tencent.com/en-us/investors.html'],
  },
  '09988.HK': {
    ticker: '09988.HK',
    primaryName: 'Alibaba Group',
    aliases: ['Alibaba', '阿里巴巴', '阿里', '淘宝', '天猫'],
    altTickers: ['BABA'],
    products: ['Taobao', 'Tmall', 'Alibaba Cloud', 'Cainiao', 'AIDC'],
    officialDomains: ['alibabagroup.com'],
  },
  '600519.SH': {
    ticker: '600519.SH',
    primaryName: 'Kweichow Moutai',
    aliases: ['贵州茅台', '茅台', 'Kweichow Moutai Co'],
    products: ['飞天茅台', '白酒', '高端白酒', '经销商库存'],
    officialDomains: ['moutaichina.com'],
  },
  '300750.SZ': {
    ticker: '300750.SZ',
    primaryName: 'CATL',
    aliases: ['宁德时代', 'Contemporary Amperex Technology', 'CATL'],
    products: ['动力电池', '储能电池', '麒麟电池', '神行电池'],
    officialDomains: ['catl.com'],
  },
  '688256.SH': {
    ticker: '688256.SH',
    primaryName: 'Cambricon Technologies',
    aliases: ['寒武纪', '中科寒武纪', '寒武纪-U', 'Cambricon'],
    products: ['AI芯片', '智能芯片', 'MLU', '思元', '云端训练芯片', '推理芯片'],
    officialDomains: ['cambricon.com'],
  },
  '000001.SZ': {
    ticker: '000001.SZ',
    primaryName: 'Ping An Bank',
    aliases: ['平安银行', 'Ping An Bank'],
    products: ['零售银行', '对公业务', '净息差', '不良率'],
    officialDomains: ['bank.pingan.com'],
  },
  '02513.HK': {
    ticker: '02513.HK',
    primaryName: 'Zhipu',
    aliases: ['智谱', '智谱AI', '智谱科技', '智谱华章', 'Zhipu AI', 'Z.ai'],
    products: ['GLM', 'GLM-4', 'GLM-Z1', '大模型', 'AI agent', 'MaaS'],
    officialDomains: ['z.ai', 'bigmodel.cn'],
  },
  AAPL: {
    ticker: 'AAPL',
    primaryName: 'Apple',
    aliases: ['Apple Inc', 'iPhone maker'],
    people: ['Tim Cook'],
    products: ['iPhone', 'Mac', 'Apple Vision Pro', 'App Store'],
    officialNewsFeeds: ['https://www.apple.com/newsroom/rss-feed.rss'],
    officialNewsPages: ['https://www.apple.com/newsroom/'],
    officialDomains: ['apple.com', 'investor.apple.com'],
  },
  MSFT: {
    ticker: 'MSFT',
    primaryName: 'Microsoft',
    aliases: ['Microsoft Corp', 'Azure'],
    people: ['Satya Nadella'],
    products: ['Azure', 'Copilot', 'Windows', 'Microsoft 365', 'OpenAI partnership'],
    officialNewsFeeds: ['https://blogs.microsoft.com/feed/'],
    officialNewsPages: ['https://news.microsoft.com/', 'https://blogs.microsoft.com/'],
    officialDomains: ['microsoft.com', 'news.microsoft.com', 'blogs.microsoft.com'],
  },
  GOOGL: {
    ticker: 'GOOGL',
    primaryName: 'Alphabet',
    aliases: ['Google', 'Alphabet Inc', 'Google parent'],
    altTickers: ['GOOG'],
    people: ['Sundar Pichai'],
    products: ['Google Cloud', 'Gemini', 'Search', 'YouTube', 'Android'],
    officialNewsPages: ['https://abc.xyz/investor/news/'],
    officialDomains: ['abc.xyz', 'blog.google', 'cloud.google.com'],
  },
  GOOG: {
    ticker: 'GOOG',
    primaryName: 'Alphabet',
    aliases: ['Google', 'Alphabet Inc', 'Google parent'],
    altTickers: ['GOOGL'],
    people: ['Sundar Pichai'],
    products: ['Google Cloud', 'Gemini', 'Search', 'YouTube', 'Android'],
    officialNewsPages: ['https://abc.xyz/investor/news/'],
    officialDomains: ['abc.xyz', 'blog.google', 'cloud.google.com'],
  },
  AMZN: {
    ticker: 'AMZN',
    primaryName: 'Amazon',
    aliases: ['Amazon.com', 'AWS'],
    people: ['Andy Jassy', 'Jeff Bezos'],
    products: ['AWS', 'Prime', 'Amazon retail', 'Amazon ads'],
    officialNewsPages: ['https://press.aboutamazon.com/press-releases/', 'https://ir.aboutamazon.com/news-release/news-release-details/'],
    officialDomains: ['aboutamazon.com', 'press.aboutamazon.com', 'ir.aboutamazon.com'],
  },
  META: {
    ticker: 'META',
    primaryName: 'Meta Platforms',
    aliases: ['Meta', 'Facebook parent', 'Instagram'],
    people: ['Mark Zuckerberg'],
    products: ['Facebook', 'Instagram', 'WhatsApp', 'Threads', 'Reality Labs'],
    officialNewsFeeds: ['https://about.fb.com/news/feed/'],
    officialNewsPages: ['https://about.fb.com/news/'],
    officialDomains: ['about.fb.com', 'investor.fb.com'],
  },
  TSLA: {
    ticker: 'TSLA',
    primaryName: 'Tesla',
    aliases: ['Tesla Inc', 'EV maker'],
    people: ['Elon Musk'],
    products: ['Cybertruck', 'Model Y', 'FSD', 'Robotaxi', 'Optimus'],
    officialNewsPages: ['https://ir.tesla.com/press?view=all'],
    officialDomains: ['tesla.com', 'ir.tesla.com'],
  },
  NVDA: {
    ticker: 'NVDA',
    primaryName: 'Nvidia',
    aliases: ['NVIDIA', 'Nvidia Corp', 'AI chipmaker'],
    people: ['Jensen Huang', 'Huang Renxun', '黄仁勋'],
    products: ['Blackwell', 'CUDA', 'GeForce', 'H100', 'H200', 'GB200', 'AI chips', 'data center GPU'],
    socialAliases: ['Team Green'],
    officialNewsFeeds: ['https://nvidianews.nvidia.com/releases.xml', 'https://nvidianews.nvidia.com/cats/press_release.xml'],
    officialNewsPages: ['https://nvidianews.nvidia.com/', 'https://investor.nvidia.com/news/press-release-details/default.aspx'],
    officialDomains: ['nvidia.com', 'nvidianews.nvidia.com', 'investor.nvidia.com'],
  },
  AMD: {
    ticker: 'AMD',
    primaryName: 'Advanced Micro Devices',
    aliases: ['AMD', 'AMD Ryzen', 'AMD Instinct'],
    people: ['Lisa Su'],
    products: ['Ryzen', 'EPYC', 'Instinct MI300', 'Radeon'],
    officialNewsPages: ['https://www.amd.com/en/newsroom.html', 'https://ir.amd.com/news-events/press-releases'],
    officialDomains: ['amd.com', 'ir.amd.com'],
  },
  INTC: {
    ticker: 'INTC',
    primaryName: 'Intel',
    aliases: ['Intel Corporation', 'Intel Corp', 'Intel Foundry', 'chipmaker'],
    people: ['Lip-Bu Tan', 'Pat Gelsinger'],
    products: [
      'Intel Foundry', 'IFS', '18A', '14A', 'Gaudi', 'Gaudi 3',
      'Xeon', 'Core Ultra', 'Lunar Lake', 'Arrow Lake', 'AI PC',
      'Mobileye', 'Altera',
    ],
    socialAliases: ['Team Blue'],
    officialNewsFeeds: ['https://newsroom.intel.com/feed'],
    officialNewsPages: ['https://newsroom.intel.com/', 'https://www.intc.com/news-events/press-releases'],
    officialDomains: ['intel.com', 'newsroom.intel.com', 'intc.com'],
  },
  TSM: {
    ticker: 'TSM',
    primaryName: 'Taiwan Semiconductor Manufacturing',
    aliases: ['TSMC', 'Taiwan Semiconductor'],
    people: ['C. C. Wei', 'Morris Chang'],
    products: ['3nm', '2nm', 'CoWoS', 'advanced packaging'],
    officialNewsPages: ['https://pr.tsmc.com/english/news'],
    officialDomains: ['tsmc.com', 'pr.tsmc.com'],
  },
  BABA: {
    ticker: 'BABA',
    primaryName: 'Alibaba',
    aliases: ['Alibaba Group', 'AliExpress'],
    people: ['Jack Ma', 'Eddie Wu'],
    products: ['Taobao', 'Tmall', 'Alibaba Cloud', 'AliExpress'],
    officialNewsPages: ['https://www.alibabagroup.com/en-US/news-and-media/media-resource/news'],
    officialDomains: ['alibabagroup.com'],
  },
  TCEHY: {
    ticker: 'TCEHY',
    primaryName: 'Tencent',
    aliases: ['Tencent Holdings', 'WeChat'],
    people: ['Pony Ma', 'Ma Huateng'],
    products: ['WeChat', 'Weixin', 'Honor of Kings', 'Tencent Cloud'],
    officialNewsPages: ['https://www.tencent.com/en-us/media/news.html'],
    officialDomains: ['tencent.com'],
  },
  NIO: {
    ticker: 'NIO',
    primaryName: 'NIO',
    aliases: ['Nio Inc', 'Chinese EV maker'],
  },
  XPEV: {
    ticker: 'XPEV',
    primaryName: 'XPeng',
    aliases: ['XPeng Motors', 'Xpeng Inc'],
  },
  LI: {
    ticker: 'LI',
    primaryName: 'Li Auto',
    aliases: ['Li Auto Inc', 'Chinese EV maker'],
  },
  AVGO: { ticker: 'AVGO', primaryName: 'Broadcom', aliases: ['Broadcom Inc', '博通'], products: ['AI networking', 'VMware', 'semiconductors', 'custom silicon'], officialDomains: ['broadcom.com', 'investors.broadcom.com'] },
  'BRK-B': { ticker: 'BRK-B', primaryName: 'Berkshire Hathaway', aliases: ['Berkshire', '伯克希尔', '伯克希尔哈撒韦'], people: ['Warren Buffett', 'Greg Abel'], products: ['insurance', 'BNSF', 'energy', 'Apple stake'], officialDomains: ['berkshirehathaway.com'] },
  JPM: { ticker: 'JPM', primaryName: 'JPMorgan Chase', aliases: ['JPMorgan', '摩根大通', '小摩'], people: ['Jamie Dimon'], products: ['investment banking', 'consumer banking', 'trading revenue'], officialDomains: ['jpmorganchase.com', 'investor.shareholder.com'] },
  WMT: { ticker: 'WMT', primaryName: 'Walmart', aliases: ['沃尔玛', 'Walmart Inc'], products: ['retail', 'grocery', 'ecommerce', 'Walmart Plus'], officialDomains: ['walmart.com', 'corporate.walmart.com', 'stock.walmart.com'] },
  LLY: { ticker: 'LLY', primaryName: 'Eli Lilly', aliases: ['礼来', '礼来制药', 'Eli Lilly and Company'], products: ['Mounjaro', 'Zepbound', 'tirzepatide', 'obesity drugs', 'diabetes drugs'], officialDomains: ['lilly.com', 'investor.lilly.com'] },
  V: { ticker: 'V', primaryName: 'Visa', aliases: ['Visa Inc', '维萨'], products: ['payments', 'credit cards', 'debit cards', 'Visa Direct'], officialDomains: ['visa.com', 'investor.visa.com'] },
  MA: { ticker: 'MA', primaryName: 'Mastercard', aliases: ['Mastercard Inc', '万事达'], products: ['payments', 'credit cards', 'debit cards', 'cross-border volume'], officialDomains: ['mastercard.com', 'investor.mastercard.com'] },
  NFLX: { ticker: 'NFLX', primaryName: 'Netflix', aliases: ['奈飞', 'Netflix Inc'], products: ['streaming', 'ads tier', 'password sharing', 'gaming'], officialDomains: ['netflix.com', 'ir.netflix.net'] },
  ORCL: { ticker: 'ORCL', primaryName: 'Oracle', aliases: ['Oracle Corporation', '甲骨文'], people: ['Larry Ellison', 'Safra Catz'], products: ['Oracle Cloud', 'OCI', 'database', 'AI infrastructure'], officialDomains: ['oracle.com', 'investor.oracle.com'] },
  XOM: { ticker: 'XOM', primaryName: 'Exxon Mobil', aliases: ['Exxon', 'ExxonMobil', '埃克森美孚'], products: ['oil', 'natural gas', 'Permian', 'Guyana', 'LNG'], officialDomains: ['exxonmobil.com', 'investor.exxonmobil.com'] },
  COST: { ticker: 'COST', primaryName: 'Costco', aliases: ['Costco Wholesale', '好市多'], products: ['warehouse retail', 'membership fees', 'grocery'], officialDomains: ['costco.com', 'investor.costco.com'] },
  JNJ: { ticker: 'JNJ', primaryName: 'Johnson & Johnson', aliases: ['J&J', '强生'], products: ['pharmaceuticals', 'medical devices', 'MedTech', 'oncology'], officialDomains: ['jnj.com', 'investor.jnj.com'] },
  HD: { ticker: 'HD', primaryName: 'Home Depot', aliases: ['The Home Depot', '家得宝'], products: ['home improvement', 'Pro customers', 'building materials'], officialDomains: ['homedepot.com', 'ir.homedepot.com'] },
  PG: { ticker: 'PG', primaryName: 'Procter & Gamble', aliases: ['P&G', '宝洁'], products: ['consumer staples', 'Tide', 'Pampers', 'Gillette'], officialDomains: ['pg.com', 'investor.pg.com'] },
  ABBV: { ticker: 'ABBV', primaryName: 'AbbVie', aliases: ['艾伯维', 'AbbVie Inc'], products: ['Skyrizi', 'Rinvoq', 'Botox', 'immunology'], officialDomains: ['abbvie.com', 'investors.abbvie.com'] },
  BAC: { ticker: 'BAC', primaryName: 'Bank of America', aliases: ['BofA', '美国银行'], products: ['banking', 'net interest income', 'wealth management'], officialDomains: ['bankofamerica.com', 'investor.bankofamerica.com'] },
  KO: { ticker: 'KO', primaryName: 'Coca-Cola', aliases: ['Coca Cola', '可口可乐'], products: ['beverages', 'Coke', 'Sprite', 'pricing'], officialDomains: ['coca-colacompany.com', 'investors.coca-colacompany.com'] },
  GE: { ticker: 'GE', primaryName: 'GE Aerospace', aliases: ['General Electric', '通用电气'], products: ['jet engines', 'LEAP engines', 'aerospace services'], officialDomains: ['geaerospace.com', 'ge.com'] },
  CSCO: { ticker: 'CSCO', primaryName: 'Cisco', aliases: ['Cisco Systems', '思科'], products: ['networking', 'security', 'Splunk', 'AI networking'], officialDomains: ['cisco.com', 'investor.cisco.com'] },
  IBM: { ticker: 'IBM', primaryName: 'IBM', aliases: ['International Business Machines', '国际商业机器'], products: ['hybrid cloud', 'Red Hat', 'watsonx', 'consulting'], officialDomains: ['ibm.com', 'investor.ibm.com'] },
  PM: { ticker: 'PM', primaryName: 'Philip Morris International', aliases: ['Philip Morris', '菲利普莫里斯', '万宝路'], products: ['IQOS', 'smoke-free products', 'Marlboro'], officialDomains: ['pmi.com', 'investors.pmi.com'] },
  UNH: { ticker: 'UNH', primaryName: 'UnitedHealth Group', aliases: ['UnitedHealth', '联合健康'], products: ['UnitedHealthcare', 'Optum', 'Medicare Advantage'], officialDomains: ['unitedhealthgroup.com'] },
  CVX: { ticker: 'CVX', primaryName: 'Chevron', aliases: ['Chevron Corporation', '雪佛龙'], products: ['oil', 'natural gas', 'Permian', 'LNG'], officialDomains: ['chevron.com', 'investors.chevron.com'] },
  CRM: { ticker: 'CRM', primaryName: 'Salesforce', aliases: ['Salesforce Inc', '赛富时'], people: ['Marc Benioff'], products: ['CRM', 'Data Cloud', 'Agentforce', 'Slack'], officialDomains: ['salesforce.com', 'investor.salesforce.com'] },
  WFC: { ticker: 'WFC', primaryName: 'Wells Fargo', aliases: ['富国银行'], products: ['banking', 'net interest income', 'consumer lending'], officialDomains: ['wellsfargo.com', 'investors.wellsfargo.com'] },
  ABT: { ticker: 'ABT', primaryName: 'Abbott Laboratories', aliases: ['Abbott', '雅培'], products: ['medical devices', 'diagnostics', 'FreeStyle Libre', 'nutrition'], officialDomains: ['abbott.com', 'investors.abbott'] },
  MCD: { ticker: 'MCD', primaryName: "McDonald's", aliases: ['McDonalds', '麦当劳'], products: ['restaurants', 'same-store sales', 'franchise', 'value menu'], officialDomains: ['mcdonalds.com', 'corporate.mcdonalds.com'] },
  LIN: { ticker: 'LIN', primaryName: 'Linde', aliases: ['Linde plc', '林德'], products: ['industrial gases', 'hydrogen', 'chemicals'], officialDomains: ['linde.com', 'investors.linde.com'] },
  MRK: { ticker: 'MRK', primaryName: 'Merck', aliases: ['Merck & Co', '默沙东'], products: ['Keytruda', 'oncology', 'vaccines'], officialDomains: ['merck.com', 'investors.merck.com'] },
  DIS: { ticker: 'DIS', primaryName: 'Disney', aliases: ['Walt Disney', '迪士尼'], products: ['Disney+', 'parks', 'ESPN', 'box office'], officialDomains: ['thewaltdisneycompany.com', 'disney.com'] },
  NOW: { ticker: 'NOW', primaryName: 'ServiceNow', aliases: ['ServiceNow Inc'], products: ['workflow automation', 'Now Platform', 'AI agents'], officialDomains: ['servicenow.com', 'investors.servicenow.com'] },
  TMO: { ticker: 'TMO', primaryName: 'Thermo Fisher Scientific', aliases: ['Thermo Fisher', '赛默飞', '赛默飞世尔'], products: ['life sciences', 'diagnostics', 'analytical instruments'], officialDomains: ['thermofisher.com', 'ir.thermofisher.com'] },
  ACN: { ticker: 'ACN', primaryName: 'Accenture', aliases: ['埃森哲'], products: ['consulting', 'managed services', 'AI consulting'], officialDomains: ['accenture.com', 'investor.accenture.com'] },
  GS: { ticker: 'GS', primaryName: 'Goldman Sachs', aliases: ['Goldman', '高盛'], products: ['investment banking', 'trading', 'asset management'], officialDomains: ['goldmansachs.com'] },
  ISRG: { ticker: 'ISRG', primaryName: 'Intuitive Surgical', aliases: ['直觉外科'], products: ['da Vinci surgical system', 'robotic surgery'], officialDomains: ['intuitive.com', 'isrg.intuitive.com'] },
  TXN: { ticker: 'TXN', primaryName: 'Texas Instruments', aliases: ['德州仪器', 'TI'], products: ['analog chips', 'embedded processing', 'semiconductors'], officialDomains: ['ti.com', 'investor.ti.com'] },
  INTU: { ticker: 'INTU', primaryName: 'Intuit', aliases: ['Intuit Inc'], products: ['TurboTax', 'QuickBooks', 'Credit Karma', 'Mailchimp'], officialDomains: ['intuit.com', 'investors.intuit.com'] },
  QCOM: { ticker: 'QCOM', primaryName: 'Qualcomm', aliases: ['高通'], products: ['Snapdragon', 'modems', 'AI PC', 'automotive chips'], officialDomains: ['qualcomm.com', 'investor.qualcomm.com'] },
  AMGN: { ticker: 'AMGN', primaryName: 'Amgen', aliases: ['安进'], products: ['biotech', 'oncology', 'inflammation', 'MariTide'], officialDomains: ['amgen.com', 'investors.amgen.com'] },
  VZ: { ticker: 'VZ', primaryName: 'Verizon', aliases: ['Verizon Communications', '威瑞森'], products: ['wireless', '5G', 'broadband'], officialDomains: ['verizon.com', 'verizon.com/about/investors'] },
  MSTR: {
    ticker: 'MSTR',
    primaryName: 'Strategy',
    aliases: ['MicroStrategy', 'Strategy Inc', 'MicroStrategy Incorporated', '微策略', 'bitcoin treasury company'],
    people: ['Michael Saylor', 'Phong Le'],
    products: ['Bitcoin treasury', 'BTC holdings', 'convertible debt', 'enterprise analytics', 'business intelligence software'],
    socialAliases: ['Saylor', 'MSTR Bitcoin', 'MicroStrategy Bitcoin'],
    officialDomains: ['strategy.com', 'microstrategy.com', 'ir.strategy.com', 'investor.microstrategy.com'],
    officialNewsPages: ['https://www.strategy.com/news', 'https://ir.strategy.com/news-events/press-releases'],
  },
  NKE: { ticker: 'NKE', primaryName: 'Nike', aliases: ['NIKE Inc', '耐克', 'Jordan Brand'], people: ['Elliott Hill', 'John Donahoe'], products: ['Nike shoes', 'Jordan', 'Air Max', 'Nike Direct', 'sneakers', 'sportswear'], officialDomains: ['nike.com', 'investors.nike.com', 'news.nike.com'], officialNewsPages: ['https://about.nike.com/en/newsroom', 'https://investors.nike.com/investors/news-events-and-reports/'] },
};

function unique(values: string[]) {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)));
}

function mergeProfile(profile: CompanyProfile, inferred: Partial<CompanyProfile>): CompanyProfile {
  return {
    ...profile,
    aliases: unique([...(profile.aliases || []), ...(inferred.aliases || [])]),
    altTickers: unique([...(profile.altTickers || []), ...(inferred.altTickers || [])]),
    people: unique([...(profile.people || []), ...(inferred.people || [])]),
    products: unique([...(profile.products || []), ...(inferred.products || [])]),
    socialAliases: unique([...(profile.socialAliases || []), ...(inferred.socialAliases || [])]),
    officialNewsFeeds: unique([...(profile.officialNewsFeeds || []), ...(inferred.officialNewsFeeds || [])]),
    officialNewsPages: unique([...(profile.officialNewsPages || []), ...(inferred.officialNewsPages || [])]),
    officialDomains: unique([...(profile.officialDomains || []), ...(inferred.officialDomains || [])]),
  };
}

function inferProfile(ticker: string): Partial<CompanyProfile> {
  const raw = String(ticker || '').trim();
  const normalized = raw.toUpperCase();
  const bare = normalized
    .replace(/\.(US|NYSE|NASDAQ|AMEX|HK|HKG|CC|CRYPTO)$/i, '')
    .replace(/[^A-Z0-9]/g, '');
  const lower = bare.toLowerCase();
  const likelyDomain = lower ? `${lower}.com` : '';
  return {
    aliases: bare && bare !== normalized ? [bare] : [],
    products: [
      `${bare} earnings`,
      `${bare} guidance`,
      `${bare} product launch`,
      `${bare} partnership`,
    ],
    officialNewsPages: likelyDomain ? [
      `https://www.${likelyDomain}/newsroom/`,
      `https://investor.${likelyDomain}/news/`,
      `https://ir.${likelyDomain}/news/`,
    ] : [],
    officialDomains: likelyDomain ? [
      likelyDomain,
      `www.${likelyDomain}`,
      `investor.${likelyDomain}`,
      `ir.${likelyDomain}`,
    ] : [],
  };
}

export function getCompanyProfile(ticker: string): CompanyProfile {
  const normalized = String(ticker || '').trim().toUpperCase();
  const base = PROFILES[normalized] || {
    ticker: normalized,
    primaryName: normalized,
    aliases: [],
  };
  return mergeProfile(base, inferProfile(normalized));
}

export function companySearchTerms(ticker: string): string[] {
  const profile = getCompanyProfile(ticker);
  const publicTicker = profile.ticker.replace(/\.(CC|CRYPTO)$/i, '');
  return unique([
    publicTicker,
    profile.ticker.endsWith('.CC') || profile.ticker.endsWith('.CRYPTO') ? '' : profile.ticker,
    ...(profile.altTickers || []),
    profile.primaryName,
    ...profile.aliases,
  ]);
}

export function companySocialTerms(ticker: string): string[] {
  const profile = getCompanyProfile(ticker);
  const publicTicker = profile.ticker.replace(/\.(CC|CRYPTO)$/i, '');
  return unique([
    publicTicker,
    profile.ticker.endsWith('.CC') || profile.ticker.endsWith('.CRYPTO') ? '' : profile.ticker,
    ...(profile.altTickers || []),
    profile.primaryName,
    ...profile.aliases,
    ...(profile.socialAliases || []),
    ...(profile.people || []),
    ...(profile.products || []),
  ]);
}

export function quoteIfNeeded(term: string): string {
  const trimmed = term.trim();
  return /\s/.test(trimmed) ? `"${trimmed}"` : trimmed;
}
