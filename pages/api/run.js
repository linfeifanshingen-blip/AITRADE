/**
 * POST /api/run  body: { ticker, userContext, modelProviders | modelProvider }  →  { runs: [...] }
 *
 * Accepts either a single modelProvider string (backward compat) or a modelProviders
 * array for multi-model parallel analysis. Each model gets its own run_id stored in KV.
 * The actual workflow runs inside /api/stream/[id].
 */

import crypto from 'node:crypto';
import { kvSet, KV_KEYS } from '@/lib/kv';
import { envCheck, normalizeModelProvider, parseModelSelection } from '@/lib/ai';
import { normalizeTicker } from '@/lib/ticker';

export const config = { runtime: 'nodejs' };

function makeRunId(ticker, date, suffix) {
  const raw = `${ticker.toUpperCase()}:${date}:${suffix}:${process.hrtime.bigint()}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

function requestLocalDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normalizeUserContext(input) {
  const hasPosition = Boolean(input?.hasPosition);
  if (!hasPosition) return { hasPosition: false, averageCost: null };

  const rawAverageCost = input?.averageCost;
  const normalizedAverageCost = typeof rawAverageCost === 'string' ? rawAverageCost.trim() : rawAverageCost;
  const averageCost = Number(normalizedAverageCost);
  if (normalizedAverageCost === '' || !Number.isFinite(averageCost) || averageCost <= 0) {
    const err = new Error('已持仓时请填写大于 0 的持仓均价');
    err.statusCode = 400;
    throw err;
  }
  return { hasPosition: true, averageCost };
}

function resolveProviders(body) {
  const modelProviders = body?.modelProviders;
  if (Array.isArray(modelProviders) && modelProviders.length > 0) {
    return modelProviders.map(mp => parseModelSelection(mp));
  }
  const singleProvider = body?.modelProvider;
  if (singleProvider) {
    return [parseModelSelection(singleProvider)];
  }
  return [{ provider: 'deepseek', tier: null }];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }
  try {
    const providers = resolveProviders(req.body);

    // Validate all providers
    for (const { provider } of providers) {
      const env = envCheck(provider);
      if (!env.ok) {
        res.status(400).json({
          error: `missing required API key: ${env.missing.join(', ')}`,
          warnings: env.warnings,
        });
        return;
      }
    }

    const { ticker, userContext, market } = req.body || {};
    const rawTicker = String(ticker || '').trim();
    const requestedMarket = String(market || 'US').trim().toUpperCase();
    const t = normalizeTicker(rawTicker, requestedMarket);
    const normalizedUserContext = normalizeUserContext(userContext);
    const d = requestLocalDate();
    if (!t) {
      res.status(400).json({ error: 'ticker required' });
      return;
    }

    // Create runs for all providers in parallel
    const runs = await Promise.all(providers.map(async ({ provider, tier }) => {
      const suffix = `${provider}:${tier || 'auto'}`;
      const runId = makeRunId(t, d, suffix);
      await kvSet(
        KV_KEYS.runInput(runId),
        {
          ticker: t,
          inputTicker: rawTicker,
          market: requestedMarket,
          date: d,
          userContext: normalizedUserContext,
          modelProvider: provider,
          modelTier: tier,
          createdAt: Date.now(),
        },
        600
      );
      return {
        run_id: runId,
        model_provider: provider,
        model_tier: tier,
      };
    }));

    res.status(200).json({
      runs,
      ticker: t,
      input_ticker: rawTicker,
      market: requestedMarket,
      date: d,
      user_context: normalizedUserContext,
    });
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
}
