const ALIASES: Record<string, string> = {
  特斯拉: 'TSLA',
  tesla: 'TSLA',
  英特尔: 'INTC',
  因特尔: 'INTC',
  intel: 'INTC',
  英伟达: 'NVDA',
  辉达: 'NVDA',
  nvidia: 'NVDA',
  苹果: 'AAPL',
  apple: 'AAPL',
  微软: 'MSFT',
  microsoft: 'MSFT',
  谷歌: 'GOOGL',
  google: 'GOOGL',
  alphabet: 'GOOGL',
  亚马逊: 'AMZN',
  amazon: 'AMZN',
  meta: 'META',
  facebook: 'META',
  脸书: 'META',
  amd: 'AMD',
  超威: 'AMD',
  台积电: 'TSM',
  tsmc: 'TSM',
  阿里巴巴: 'BABA',
  阿里: 'BABA',
  腾讯: '00700.HK',
  腾讯控股: '00700.HK',
  tencent: '00700.HK',
  伯克希尔: 'BRK-B',
  小鹏: 'XPEV',
  小鹏汽车: 'XPEV',
  蔚来: 'NIO',
  蔚来汽车: 'NIO',
  理想: 'LI',
  理想汽车: 'LI',
  比亚迪: '01211.HK',
  比亚迪汽车: '01211.HK',
  byd: '01211.HK',
  阿里港股: '09988.HK',
  美团: '03690.HK',
  小米: '01810.HK',
  小米集团: '01810.HK',
  快手: '01024.HK',
  京东港股: '09618.HK',
  茅台: '600519.SH',
  贵州茅台: '600519.SH',
  平安银行: '000001.SZ',
  招商银行: '600036.SH',
  宁德时代: '300750.SZ',
  隆基绿能: '601012.SH',
  寒武纪: '688256.SH',
  中科寒武纪: '688256.SH',
  '寒武纪-U': '688256.SH',
  寒武纪u: '688256.SH',
  cambricon: '688256.SH',
  中芯国际: '00981.HK',
  智谱: '02513.HK',
  智谱AI: '02513.HK',
  智谱科技: '02513.HK',
  智谱华章: '02513.HK',
  zhipu: '02513.HK',
  'zhipu ai': '02513.HK',
  'z.ai': '02513.HK',
  耐克: 'NKE',
  nike: 'NKE',
  沃尔玛: 'WMT',
  walmart: 'WMT',
  伯克希尔哈撒韦: 'BRK-B',
  brk: 'BRK-B',
  broadcom: 'AVGO',
  博通: 'AVGO',
  摩根大通: 'JPM',
  小摩: 'JPM',
  jpmorgan: 'JPM',
  礼来: 'LLY',
  礼来制药: 'LLY',
  'eli lilly': 'LLY',
  visa: 'V',
  维萨: 'V',
  万事达: 'MA',
  mastercard: 'MA',
  奈飞: 'NFLX',
  netflix: 'NFLX',
  甲骨文: 'ORCL',
  oracle: 'ORCL',
  埃克森美孚: 'XOM',
  exxon: 'XOM',
  costco: 'COST',
  好市多: 'COST',
  强生: 'JNJ',
  johnson: 'JNJ',
  家得宝: 'HD',
  'home depot': 'HD',
  宝洁: 'PG',
  procter: 'PG',
  可口可乐: 'KO',
  'coca cola': 'KO',
  美国银行: 'BAC',
  'bank of america': 'BAC',
  思科: 'CSCO',
  cisco: 'CSCO',
  ibm: 'IBM',
  万宝路: 'PM',
  菲利普莫里斯: 'PM',
  unitedhealth: 'UNH',
  联合健康: 'UNH',
  雪佛龙: 'CVX',
  chevron: 'CVX',
  赛富时: 'CRM',
  salesforce: 'CRM',
  富国银行: 'WFC',
  'wells fargo': 'WFC',
  雅培: 'ABT',
  abbott: 'ABT',
  麦当劳: 'MCD',
  mcdonald: 'MCD',
  林德: 'LIN',
  linde: 'LIN',
  默沙东: 'MRK',
  merck: 'MRK',
  迪士尼: 'DIS',
  disney: 'DIS',
  servicenow: 'NOW',
  赛默飞: 'TMO',
  'thermo fisher': 'TMO',
  埃森哲: 'ACN',
  accenture: 'ACN',
  高盛: 'GS',
  goldman: 'GS',
  直觉外科: 'ISRG',
  'intuitive surgical': 'ISRG',
  德州仪器: 'TXN',
  'texas instruments': 'TXN',
  intuit: 'INTU',
  高通: 'QCOM',
  qualcomm: 'QCOM',
  安进: 'AMGN',
  amgen: 'AMGN',
  verizon: 'VZ',
  威瑞森: 'VZ',
  adobe: 'ADBE',
  奥多比: 'ADBE',
  palantir: 'PLTR',
  赛默飞世尔: 'TMO',
  booking: 'BKNG',
  微策略: 'MSTR',
  'microstrategy': 'MSTR',
  'micro strategy': 'MSTR',
  strategy: 'MSTR',
  'strategy inc': 'MSTR',
  mstr: 'MSTR',
  波音: 'BA',
  boeing: 'BA',
  caterpillar: 'CAT',
  卡特彼勒: 'CAT',
  ge: 'GE',
  通用电气: 'GE',
  洛克希德马丁: 'LMT',
  lockheed: 'LMT',
  罗斯百货: 'ROST',
  比特币: 'BTC.CC',
  bitcoin: 'BTC.CC',
  btc: 'BTC.CC',
  以太坊: 'ETH.CC',
  ethereum: 'ETH.CC',
  eth: 'ETH.CC',
  solana: 'SOL.CC',
  sol: 'SOL.CC',
  币安币: 'BNB.CC',
  bnb: 'BNB.CC',
  瑞波: 'XRP.CC',
  xrp: 'XRP.CC',
  狗狗币: 'DOGE.CC',
  dogecoin: 'DOGE.CC',
  doge: 'DOGE.CC',
  cardano: 'ADA.CC',
  ada: 'ADA.CC',
};

const MARKET_ALIASES: Record<string, Record<string, string>> = {
  HK: {
    腾讯: '00700.HK',
    腾讯控股: '00700.HK',
    tencent: '00700.HK',
    阿里: '09988.HK',
    阿里巴巴: '09988.HK',
    阿里巴巴港股: '09988.HK',
    alibaba: '09988.HK',
    美团: '03690.HK',
    小米: '01810.HK',
    小米集团: '01810.HK',
    快手: '01024.HK',
    京东: '09618.HK',
    京东集团: '09618.HK',
    百度: '09888.HK',
    网易: '09999.HK',
    哔哩哔哩: '09626.HK',
    b站: '09626.HK',
    比亚迪: '01211.HK',
    比亚迪股份: '01211.HK',
    理想: '02015.HK',
    理想汽车: '02015.HK',
    小鹏: '09868.HK',
    小鹏汽车: '09868.HK',
    蔚来: '09866.HK',
    蔚来汽车: '09866.HK',
    中芯: '00981.HK',
    中芯国际: '00981.HK',
    智谱: '02513.HK',
    智谱ai: '02513.HK',
    zhipu: '02513.HK',
    吉利: '00175.HK',
    吉利汽车: '00175.HK',
    长城汽车: '02333.HK',
    中国移动: '00941.HK',
    中国联通: '00762.HK',
    中国电信: '00728.HK',
    港交所: '00388.HK',
    香港交易所: '00388.HK',
    汇丰: '00005.HK',
    汇丰控股: '00005.HK',
    友邦: '01299.HK',
    友邦保险: '01299.HK',
    工商银行: '01398.HK',
    建设银行: '00939.HK',
    中国平安: '02318.HK',
    招商银行: '03968.HK',
    药明生物: '02269.HK',
    药明康德: '02359.HK',
    泡泡玛特: '09992.HK',
    舜宇光学: '02382.HK',
    安踏: '02020.HK',
    李宁: '02331.HK',
    金沙中国: '01928.HK',
    中海油: '00883.HK',
    中国海洋石油: '00883.HK',
    中国石油: '00857.HK',
    中国石化: '00386.HK',
  },
  CN: {
    茅台: '600519.SH',
    贵州茅台: '600519.SH',
    宁德时代: '300750.SZ',
    招商银行: '600036.SH',
    平安银行: '000001.SZ',
    比亚迪: '002594.SZ',
    比亚迪股份: '002594.SZ',
    五粮液: '000858.SZ',
    中国平安: '601318.SH',
    隆基绿能: '601012.SH',
    寒武纪: '688256.SH',
    中科寒武纪: '688256.SH',
    寒武纪u: '688256.SH',
    中芯: '688981.SH',
    中芯国际: '688981.SH',
    工业富联: '601138.SH',
    东方财富: '300059.SZ',
    中信证券: '600030.SH',
    海康威视: '002415.SZ',
    迈瑞医疗: '300760.SZ',
    美的集团: '000333.SZ',
    格力电器: '000651.SZ',
    立讯精密: '002475.SZ',
    京东方: '000725.SZ',
    京东方a: '000725.SZ',
    牧原股份: '002714.SZ',
    紫金矿业: '601899.SH',
    赛力斯: '601127.SH',
    长安汽车: '000625.SZ',
    北方华创: '002371.SZ',
    中际旭创: '300308.SZ',
    新易盛: '300502.SZ',
    兆易创新: '603986.SH',
    韦尔股份: '603501.SH',
    澜起科技: '688008.SH',
    中微公司: '688012.SH',
    海光信息: '688041.SH',
    科大讯飞: '002230.SZ',
    浪潮信息: '000977.SZ',
    中兴通讯: '000063.SZ',
    万华化学: '600309.SH',
    恒瑞医药: '600276.SH',
    药明康德: '603259.SH',
    中国中免: '601888.SH',
    海尔智家: '600690.SH',
    伊利股份: '600887.SH',
    中国石油: '601857.SH',
    中国石化: '600028.SH',
    中国移动: '600941.SH',
    中国电信: '601728.SH',
    工商银行: '601398.SH',
    建设银行: '601939.SH',
    农业银行: '601288.SH',
  },
  CRYPTO: {
    比特币: 'BTC.CC',
    bitcoin: 'BTC.CC',
    btc: 'BTC.CC',
    以太坊: 'ETH.CC',
    ethereum: 'ETH.CC',
    eth: 'ETH.CC',
    solana: 'SOL.CC',
    sol: 'SOL.CC',
    币安币: 'BNB.CC',
    binancecoin: 'BNB.CC',
    bnb: 'BNB.CC',
    瑞波: 'XRP.CC',
    ripple: 'XRP.CC',
    xrp: 'XRP.CC',
    狗狗币: 'DOGE.CC',
    dogecoin: 'DOGE.CC',
    doge: 'DOGE.CC',
    cardano: 'ADA.CC',
    ada: 'ADA.CC',
    雪崩: 'AVAX.CC',
    avalanche: 'AVAX.CC',
    avax: 'AVAX.CC',
    chainlink: 'LINK.CC',
    link: 'LINK.CC',
    波卡: 'DOT.CC',
    polkadot: 'DOT.CC',
    dot: 'DOT.CC',
    波场: 'TRX.CC',
    tron: 'TRX.CC',
    trx: 'TRX.CC',
    toncoin: 'TON.CC',
    ton: 'TON.CC',
    莱特币: 'LTC.CC',
    litecoin: 'LTC.CC',
    ltc: 'LTC.CC',
    比特现金: 'BCH.CC',
    'bitcoin cash': 'BCH.CC',
    bch: 'BCH.CC',
    uniswap: 'UNI.CC',
    uni: 'UNI.CC',
    aave: 'AAVE.CC',
    cosmos: 'ATOM.CC',
    atom: 'ATOM.CC',
    filecoin: 'FIL.CC',
    fil: 'FIL.CC',
    near: 'NEAR.CC',
    aptos: 'APT.CC',
    apt: 'APT.CC',
    sui: 'SUI.CC',
    arbitrum: 'ARB.CC',
    arb: 'ARB.CC',
    optimism: 'OP.CC',
    pepe: 'PEPE.CC',
    shib: 'SHIB.CC',
    柴犬币: 'SHIB.CC',
    icp: 'ICP.CC',
    inj: 'INJ.CC',
    render: 'RENDER.CC',
    tao: 'TAO.CC',
    ondo: 'ONDO.CC',
  },
};

function aliasKey(value: string) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

function lookupAlias(input: string, aliases: Record<string, string>) {
  const direct = aliases[input] || aliases[input.toLowerCase()];
  if (direct) return direct;
  const key = aliasKey(input);
  for (const [name, symbol] of Object.entries(aliases)) {
    if (aliasKey(name) === key) return symbol;
  }
  return null;
}

function marketAliasGroup(market: string) {
  if (market === 'HK') return MARKET_ALIASES.HK;
  if (market === 'CN' || market === 'A' || market === 'ASHARE' || market === 'A股') return MARKET_ALIASES.CN;
  if (['CRYPTO', 'CRYPTOCURRENCY', 'COIN', '加密货币', '币'].includes(market)) return MARKET_ALIASES.CRYPTO;
  return null;
}

export function normalizeTicker(input: string, marketHint: 'US' | 'HK' | 'CN' | string = 'US') {
  const raw = String(input || '').trim();
  const market = String(marketHint || 'US').trim().toUpperCase();
  const marketAlias = marketAliasGroup(market);
  if (marketAlias) {
    const alias = lookupAlias(raw, marketAlias);
    if (alias) return alias;
  }

  const alias = lookupAlias(raw, ALIASES);
  if (alias) return alias;

  const normalized = raw
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[：:]/g, '.');

  if (normalized.endsWith('.CC') || normalized.endsWith('.CRYPTO')) {
    const code = normalized.replace(/\.(CC|CRYPTO)$/i, '');
    if (/^[A-Z0-9]{2,12}$/.test(code)) return `${code}.CC`;
  }

  if (['CRYPTO', 'CRYPTOCURRENCY', 'COIN', '加密货币', '币'].includes(market)) {
    const code = normalized
      .replace(/^[A-Z]+:/i, '')
      .replace(/^[A-Z]+\./i, '')
      .replace(/^\$/i, '')
      .replace(/\.(CC|CRYPTO)$/i, '')
      .replace(/[/-](USDT|USD)$/i, '')
      .replace(/(USDT|USD)$/i, '');
    if (/^[A-Z0-9]{2,12}$/.test(code)) return `${code}.CC`;
  }

  if (market === 'HK') {
    const code = normalized.replace(/^(HK|HKG)/i, '').replace(/\.(HK|HKG)$/i, '');
    if (/^\d{1,5}$/.test(code)) return `${code.padStart(5, '0')}.HK`;
  }

  if (market === 'CN' || market === 'A' || market === 'ASHARE') {
    const code = normalized
      .replace(/^(SH|SS|SHA|SZ|SHE|CNSH|CNSZ)/i, '')
      .replace(/\.(SH|SS|SHA|SZ|SHE|CNSH|CNSZ|XSHG|XSHE)$/i, '');
    if (/^\d{6}$/.test(code)) {
      if (/^(5|6|9)/.test(code)) return `${code}.SH`;
      if (/^(0|2|3)/.test(code)) return `${code}.SZ`;
    }
  }

  if (market === 'US') {
    const code = normalized.replace(/\.(US|NYSE|NASDAQ|AMEX)$/i, '').replace(/-/g, '.');
    if (/^[A-Z][A-Z0-9.=-]{0,14}$/.test(code)) return code;
  }

  if (!/^[A-Z0-9.^=-]{1,15}$/.test(normalized)) {
    const error = new Error(`无法识别标的 "${raw}"。请使用标的代码，例如 NVDA、00700.HK、600519.SH、000001.SZ、BTC、ETH，或使用已支持的中文公司名/币种名。`);
    (error as any).statusCode = 400;
    throw error;
  }

  return normalized;
}
