# START HERE - 林非凡交易研究中心 Full Deploy

这是 林非凡交易研究中心 的完整本地部署包，包含完整前端、API routes、SSE 流程、11-agent workflows、prompt、行情/公告/新闻/舆情/基本面数据源逻辑，以及当前非大模型 API 配置。

本包已清空大模型 API key。部署到另一台设备后，需要先在 `.env.local` 里填入新的大模型 key。

## 需要重新填写的大模型 Key

至少填写一个可用模型供应商：

```bash
DEEPSEEK_API_KEY=
OPENAI_API_KEY=
QWEN_API_KEY=
ZHIPU_API_KEY=
KIMI_API_KEY=
MOONSHOT_API_KEY=
MINIMAX_API_KEY=
ANTHROPIC_API_KEY=
XAI_API_KEY=
```

`DEFAULT_MODEL_PROVIDER=deepseek` 时，至少要填 `DEEPSEEK_API_KEY`。如果选择其他模型，请在页面模型选择中切换，并填写对应 key。

## 快速启动

```bash
npm install
npm run dev -- --hostname 127.0.0.1 --port 3005
```

打开：

```text
http://127.0.0.1:3005/
```

如果 3005 被占用，换一个空闲端口：

```bash
npm run dev -- --hostname 127.0.0.1 --port 3006
```

## 自检

```bash
curl -sS http://127.0.0.1:3005/api/model
curl -sS -X POST http://127.0.0.1:3005/api/run \
  -H 'Content-Type: application/json' \
  --data '{"ticker":"NVDA","market":"US","userContext":{"hasPosition":false},"modelProvider":"deepseek"}'
```

## 包含能力

- 美股、A股、港股、加密货币输入识别。
- 行情/K线/技术指标：Futu、东方财富、Yahoo、Nasdaq/Stooq、Binance、CryptoCompare 等。
- 基本面：Yahoo/SEC/Nasdaq、Futu/Futunn、东方财富、CoinGecko/CryptoCompare。
- 公告/研报/新闻/舆情：巨潮、交易所、HKEX、东方财富、Yahoo、GDELT、Google News、DuckDuckGo、Tavily、Grok/X 等。
- 11-agent workflow：宏观、技术、情报、基本面、多空辩论、交易员、风险委员会、投资经理。

## 安全提醒

本包保留了非大模型 API 配置，但大模型 API key 已清空。不要把填好新 key 的 `.env.local` 上传公开仓库。
