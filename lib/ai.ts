/**
 * AI SDK provider wrappers.
 *
 * 林非凡交易研究中心 supports the following model providers:
 *   - Gemini 2.5 Pro: defaults to gemini-2.5-flash / gemini-2.5-pro
 *   - 智谱 GLM-4:   defaults to GLM-4-Flash
 *
 * You can override model names in .env.local with:
 *   GOOGLE_QUICK_MODEL=gemini-2.5-flash
 *   GOOGLE_DEEP_MODEL=gemini-2.5-pro
 *   ZHIPU_QUICK_MODEL=GLM-4-Flash
 *   ZHIPU_DEEP_MODEL=GLM-4-Flash
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
const GOOGLE_BASE_URL = process.env.GOOGLE_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai';
const GOOGLE_QUICK_MODEL = process.env.GOOGLE_QUICK_MODEL || 'gemini-2.5-flash';
const GOOGLE_DEEP_MODEL = process.env.GOOGLE_DEEP_MODEL || 'gemini-2.5-pro';
const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY || '';
const ZHIPU_BASE_URL = process.env.ZHIPU_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4';
const ZHIPU_QUICK_MODEL = process.env.ZHIPU_QUICK_MODEL || 'GLM-4-Flash';
const ZHIPU_DEEP_MODEL = process.env.ZHIPU_DEEP_MODEL || 'GLM-4-Flash';
const DEFAULT_MODEL_PROVIDER = process.env.DEFAULT_MODEL_PROVIDER || 'google';

const google = createOpenAICompatible({
  name: 'google',
  baseURL: GOOGLE_BASE_URL,
  apiKey: GOOGLE_API_KEY,
});

const zhipu = createOpenAICompatible({
  name: 'zhipu',
  baseURL: ZHIPU_BASE_URL,
  apiKey: ZHIPU_API_KEY,
});

export type ModelProvider = 'google' | 'zhipu';

const modelProviderStorage = new AsyncLocalStorage<ModelProvider>();

export type ModelTier = 'quick' | 'deep';
const modelTierStorage = new AsyncLocalStorage<ModelTier | null>();

const modelRegistry = {
  google: {
    provider: 'Gemini 2.5 Pro',
    quick: google(GOOGLE_QUICK_MODEL),
    deep: google(GOOGLE_DEEP_MODEL),
    quick_model: GOOGLE_QUICK_MODEL,
    deep_model: GOOGLE_DEEP_MODEL,
    configured: Boolean(GOOGLE_API_KEY),
  },
  zhipu: {
    provider: '智谱 GLM-4-Flash',
    quick: zhipu(ZHIPU_QUICK_MODEL),
    deep: zhipu(ZHIPU_DEEP_MODEL),
    quick_model: ZHIPU_QUICK_MODEL,
    deep_model: ZHIPU_DEEP_MODEL,
    configured: Boolean(ZHIPU_API_KEY),
  },
} as const;

/**
 * Normalize a provider string to a valid ModelProvider.
 * Emits a warning to stderr when the value doesn't match a known provider,
 * instead of silently falling back to 'deepseek'.
 */
export function normalizeModelProvider(value: any): ModelProvider {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'zhipu' || normalized === 'glm') return 'zhipu';
  if (normalized === 'google' || normalized === 'gemini') return 'google';
  if (normalized !== '') {
    console.warn(
      `[ai.ts] Unknown model provider "${value}", supported: google | zhipu. Falling back to google.`
    );
  }
  return 'google';
}

export function parseModelSelection(raw: string): { provider: ModelProvider; tier: ModelTier | null } {
  const s = String(raw || '');
  const colon = s.lastIndexOf(':');
  if (colon > 0) {
    const provider = normalizeModelProvider(s.slice(0, colon));
    const tier = s.slice(colon + 1);
    if (tier === 'quick' || tier === 'deep') return { provider, tier: tier as ModelTier };
  }
  return { provider: normalizeModelProvider(s), tier: null };
}

export function currentModelProvider(): ModelProvider {
  return modelProviderStorage.getStore() || normalizeModelProvider(DEFAULT_MODEL_PROVIDER);
}

export function withModelProvider<T>(provider: string | ModelProvider, fn: () => Promise<T>, tier?: ModelTier | null): Promise<T> {
  const p = normalizeModelProvider(provider);
  return modelTierStorage.run(tier || null, () => modelProviderStorage.run(p, fn));
}

/**
 * P0 FIX: These functions read from AsyncLocalStorage at CALL TIME,
 * not at module-load time.  Previously `export const quickThink = getQuickThink()`
 * evaluated once at startup (no ALS context → always deepseek).
 *
 * Call sites should use `getQuickThink()` / `getDeepThink()` directly.
 * The old `quickThink` / `deepThink` constant exports have been removed.
 */
export function getQuickThink() {
  const tier = modelTierStorage.getStore();
  const provider = currentModelProvider();
  if (tier === 'deep') return modelRegistry[provider].deep;
  return modelRegistry[provider].quick;
}

export function getDeepThink() {
  const tier = modelTierStorage.getStore();
  const provider = currentModelProvider();
  if (tier === 'quick') return modelRegistry[provider].quick;
  return modelRegistry[provider].deep;
}

// P0 FIX: The following two lines were removed because they evaluated
// getQuickThink() / getDeepThink() once at module-load time,
// before any AsyncLocalStorage context was set:
//
//   export const quickThink = getQuickThink();   // ← always deepseek
//   export const deepThink = getDeepThink();   // ← always deepseek
//
// All call sites now use `getQuickThink()` / `getDeepThink()` (function calls)
// which correctly read the per-request provider from AsyncLocalStorage.

export function llmCallOptions(kind: 'stream' | 'structured' = 'stream') {
  const provider = currentModelProvider();
  const providerUpper = provider.toUpperCase();
  // Vercel Hobby plan caps at 60s; reduce defaults so individual calls don't outlive the function
  const defaultTimeoutMs = kind === 'structured' ? 45_000 : 35_000;
  const defaultRetries = 1;
  const timeoutMs = Number(
    process.env[`${providerUpper}_LLM_TIMEOUT_MS`]
    || process.env.LLM_TIMEOUT_MS
    || defaultTimeoutMs
  );
  const maxRetries = Number(
    process.env[`${providerUpper}_LLM_MAX_RETRIES`]
    || process.env.LLM_MAX_RETRIES
    || defaultRetries
  );
  return {
    maxRetries,
    abortSignal: AbortSignal.timeout(Math.max(30_000, timeoutMs)),
  };
}

export function modelInfo() {
  const selected = currentModelProvider();
  const selectedInfo = modelRegistry[selected];
  return {
    selected,
    provider: selectedInfo.provider,
    quick_model: selectedInfo.quick_model,
    deep_model: selectedInfo.deep_model,
    providers: Object.fromEntries(Object.entries(modelRegistry).map(([key, value]) => [key, {
      provider: value.provider,
      quick_model: value.quick_model,
      deep_model: value.deep_model,
      configured: value.configured,
    }])),
  };
}

export function envCheck(provider?: any): { ok: boolean; warnings: string[]; missing: string[] } {
  const missing: string[] = [];
  const warnings: string[] = [];
  const selected = normalizeModelProvider(provider || DEFAULT_MODEL_PROVIDER);

  if (selected === 'google' && !GOOGLE_API_KEY) missing.push('GOOGLE_API_KEY');
  if (selected === 'zhipu' && !ZHIPU_API_KEY) missing.push('ZHIPU_API_KEY');

  // Only report warnings for the currently selected provider
  if (selected === 'google') {
    if (!process.env.GOOGLE_QUICK_MODEL) warnings.push(`GOOGLE_QUICK_MODEL not set; using ${GOOGLE_QUICK_MODEL}`);
    if (!process.env.GOOGLE_DEEP_MODEL) warnings.push(`GOOGLE_DEEP_MODEL not set; using ${GOOGLE_DEEP_MODEL}`);
  }
  if (selected === 'zhipu') {
    if (!process.env.ZHIPU_QUICK_MODEL) warnings.push(`ZHIPU_QUICK_MODEL not set; using ${ZHIPU_QUICK_MODEL}`);
    if (!process.env.ZHIPU_DEEP_MODEL) warnings.push(`ZHIPU_DEEP_MODEL not set; using ${ZHIPU_DEEP_MODEL}`);
  }

  return { ok: missing.length === 0, warnings, missing };
}
