# 林非凡交易研究中心

Multi-agent LLM stock analysis, deployed on Vercel. Self-built on the
TradingAgents architecture (4 analysts + bull/bear debate + trader + risk
committee + portfolio manager) but rewritten in TypeScript with Vercel AI SDK
+ DeepSeek/Kimi LLMs + Yahoo Finance data — no VPN, no Python.

## Phase status

- [x] Phase 0 — scaffold + configs
- [ ] **Phase 1 — Market Analyst e2e** ← we are here
- [ ] Phase 2 — 4 analysts in parallel
- [ ] Phase 3 — Bull/Bear research debate + Research Manager
- [ ] Phase 4 — Trader + Risk committee + Portfolio Manager
- [ ] Phase 5 — KV persistence + history page
- [ ] Phase 6 — Backtest + Memory learning
- [ ] Phase 7 — Site password + Cron + docs

See `/Users/todd.lu/.claude/plans/ui-kind-lynx.md` for full plan.

## Local dev

```bash
# 1. Install
npm install

# 2. Configure env (NEVER commit .env.local)
cp env.example .env.local
# Fill in DEEPSEEK_API_KEY, KIMI_API_KEY, TAVILY_API_KEY (optional for Phase 1).
# Phase 1 only NEEDS Kimi (Market Analyst uses quickThink = Kimi).

# 3. Dev server
npm run dev
# → http://localhost:3000
```

## Architecture

```
Browser (React + EventSource)
    │ POST /api/run         {ticker} → {run_id, request date}
    ▼
Vercel Function — pages/api/run.js    [maxDuration: 60]
    └── stash input in KV (10-min TTL)

Browser (EventSource /api/stream/[id])
    │ GET  /api/stream/abc123
    ▼
Vercel Function — pages/api/stream/[id].js  [maxDuration: 800]
    │ res.writeHead(200, "text/event-stream")
    ▼
runDecision()                       (workflows/runDecision.ts)
    ├── marketAnalyst()
    ├── macroTrendAnalyst()
    ├── intelligenceAnalyst()
    ├── fundamentalsAnalyst()
    └── persistRun() → Upstash Redis
```

## Tech

| | |
|---|---|
| Framework | Next.js 14 Pages Router |
| Styling | Tailwind 3 |
| LLM SDK | Vercel AI SDK + `@ai-sdk/openai-compatible` |
| Models | DeepSeek V3 (deep_think) + Kimi 128k (quick_think) |
| Storage | Upstash Redis (Vercel Marketplace) |
| Data | Yahoo Finance v8/chart (direct fetch, no key) + `technicalindicators` npm |
| Macro/News | Public macro, sector, official, and community-proxy intelligence |
| Streaming | SSE (native EventSource) |
| Deploy | git push → Vercel auto-deploy |

## Deploy

```bash
# First time:
vercel link                               # create new project
vercel env add DEEPSEEK_API_KEY production
vercel env add KIMI_API_KEY production
vercel env add TAVILY_API_KEY production
# Attach Upstash via Vercel Marketplace UI → auto-injects UPSTASH_REDIS_*

# Subsequent: just git push to main; Vercel rebuilds.
```
