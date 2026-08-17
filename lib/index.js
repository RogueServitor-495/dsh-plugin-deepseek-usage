// dsh-plugin-deepseek-usage — host half.
//
// Registers GET /api/deepseek-usage on the dsh web server. The endpoint
// returns live DeepSeek balance (official public API, via the credential
// seam's DEEPSEEK_API_KEY) plus today's token usage aggregated from the
// session store (assistant/message events carry provider-reported usage),
// priced with configurable per-token rates.
//
// Billing policy is user-configurable through the dsh settings seam: the
// plugin registers the "deepseek-usage" settings namespace (peak/off-peak
// CNY rates, USD reference rate, and Beijing-time peak windows), which the
// dsh web Settings page renders as a form automatically. Changes take
// effect on the next request (live) and reset the aggregate cache.
//
// Performance: the daily usage scan decompresses and replays every session
// log, which is expensive, so results are cached for AGGREGATE_TTL_MS and
// the scan is single-flight (concurrent callers share one pass). Per-session
// reads go through sessionPersistence.inspect with an AbortSignal timeout,
// so a log being actively written by another instance is skipped instead of
// looping forever on revision retries.
//
// The browser half (./client) renders the numbers in a compact top bar.
// @ts-check

import z from "@deepseek-ai/schemastery";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { aggregateEvents, dayLabel, isPeakHour, PEAK_WINDOWS, priceCnySplit, DEFAULT_PRICING, startOfDay } from "./usage.js";
import { fetchBalance } from "./balance.js";

/** Cordis plugin name. */
const name = "deepseek-usage";

/** Required services: the web route registry and the session query seam. */
const inject = ["webServer", "sessionQuery"];

/** Settings namespace for this plugin (also the web Settings page section id). */
const NS = settingsNamespace("deepseek-usage");

/**
 * Aggregate cache TTL (ms). A full persisted-log scan is expensive (it
 * decompresses and replays every session log), so results are cached long;
 * the endpoint is a dashboard, not a billing meter.
 */
const AGGREGATE_TTL_MS = 300_000;

/** Max concurrent persisted-session loads during one aggregate pass. */
const LOAD_CONCURRENCY = 4;

/**
 * Per-session read budget (ms). A session whose log is being actively written
 * by another instance can keep changing revision forever; give up on it after
 * this budget and skip it for the pass instead of blocking the event loop.
 */
const SESSION_READ_TIMEOUT_MS = 15_000;

/** @type {string | null} */
let cachedKey = null;
/** @type {{ value: string | null } | null} */
let keyCache = null;
/** @type {{ value: object | null, at: number } | null} */
let aggregateCache = null;
/** @type {Promise<object> | null} */
let inflightAggregate = null;
/** @type {() => object} */
let configSource = () => ({});

/**
 * Schemastery schema for the "deepseek-usage" settings section. The web
 * Settings page renders this form; defaults mirror {@link DEFAULT_PRICING}
 * and the official {@link PEAK_WINDOWS}. Each tier carries its own REAL
 * field defaults (not 0 fillers) so a partial user section — e.g. only
 * `output` overridden — keeps the remaining rates at the official prices.
 */
const peakRate = z.object({
  inputCacheMiss: z.number().min(0).description("输入单价（缓存未命中），元 / 百万 tokens").default(DEFAULT_PRICING.peak.inputCacheMiss),
  inputCacheHit: z.number().min(0).description("输入单价（缓存命中），元 / 百万 tokens").default(DEFAULT_PRICING.peak.inputCacheHit),
  output: z.number().min(0).description("输出单价，元 / 百万 tokens").default(DEFAULT_PRICING.peak.output)
});

const offPeakRate = z.object({
  inputCacheMiss: z.number().min(0).description("输入单价（缓存未命中），元 / 百万 tokens").default(DEFAULT_PRICING.offPeak.inputCacheMiss),
  inputCacheHit: z.number().min(0).description("输入单价（缓存命中），元 / 百万 tokens").default(DEFAULT_PRICING.offPeak.inputCacheHit),
  output: z.number().min(0).description("输出单价，元 / 百万 tokens").default(DEFAULT_PRICING.offPeak.output)
});

/** One peak billing window in Beijing time, [startHour, endHour). */
const PeakWindow = z.object({
  startHour: z.number().step(1).min(0).max(23).description("开始小时（北京时间，含）").default(9),
  endHour: z.number().step(1).min(1).max(24).description("结束小时（北京时间，不含）").default(12)
});

/**
 * User settings schema: billing rates and peak windows.
 * @type {ReturnType<typeof z.object>}
 */
const Config = z.object({
  model: z.string().description("计费模型标识（展示用）").default(DEFAULT_PRICING.model),
  currency: z.string().description("计费币种（展示用）").default(DEFAULT_PRICING.currency),
  peak: peakRate.description("高峰时段单价（北京时间 09:00–12:00、14:00–18:00）"),
  offPeak: offPeakRate.description("空闲时段单价（其余时间）"),
  usdCny: z.number().min(0).description("CNY→USD 参考汇率（仅显示换算用）").default(DEFAULT_PRICING.usdCny),
  peakWindows: z.array(PeakWindow).default(PEAK_WINDOWS).description("高峰时段窗口（北京时间）")
});

/**
 * Current effective billing configuration: settings layer over defaults.
 * Falls back to {@link DEFAULT_PRICING} / {@link PEAK_WINDOWS} per field so
 * a partial user section never leaves the endpoint unpriced.
 * @returns {{ model: string, currency: string, peak: object, offPeak: object, usdCny: number, windows: Array<{ startHour: number, endHour: number }> }}
 */
function resolvedConfig() {
  const raw = configSource() || {};
  // Field-level fallback: a partial user tier (e.g. only `output` overridden)
  // must keep the other fields at the defaults, not at schemastery's 0 fillers.
  const mergeRate = (tier, fallback) => ({
    inputCacheMiss: tier && typeof tier.inputCacheMiss === "number" ? tier.inputCacheMiss : fallback.inputCacheMiss,
    inputCacheHit: tier && typeof tier.inputCacheHit === "number" ? tier.inputCacheHit : fallback.inputCacheHit,
    output: tier && typeof tier.output === "number" ? tier.output : fallback.output
  });
  return {
    model: typeof raw.model === "string" && raw.model.length > 0 ? raw.model : DEFAULT_PRICING.model,
    currency: typeof raw.currency === "string" && raw.currency.length > 0 ? raw.currency : DEFAULT_PRICING.currency,
    peak: mergeRate(raw.peak, DEFAULT_PRICING.peak),
    offPeak: mergeRate(raw.offPeak, DEFAULT_PRICING.offPeak),
    usdCny: typeof raw.usdCny === "number" && raw.usdCny > 0 ? raw.usdCny : DEFAULT_PRICING.usdCny,
    windows: Array.isArray(raw.peakWindows) && raw.peakWindows.length > 0 ? raw.peakWindows : PEAK_WINDOWS
  };
}

/** @param {unknown} value */
function asString(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Resolve the DeepSeek API key through the optional credentials seam.
 * @param {import("@deepseek-ai/cordis").Context} ctx
 * @returns {Promise<string | null>}
 */
async function resolveApiKey(ctx) {
  if (keyCache) return keyCache.value;
  const credentials = ctx.get("credentials");
  let key = null;
  if (credentials !== void 0) {
    const hit = await credentials.resolve("DEEPSEEK_API_KEY");
    key = asString(hit?.value);
  }
  keyCache = { value: key };
  // Refresh the cached resolution every 60s so a key change is picked up.
  setTimeout(() => {
    keyCache = null;
  }, 60_000).unref?.();
  return key;
}

/**
 * Load one logical session for aggregation. Prefers the sessionPersistence
 * seam's cancellable inspect (live sessions read their in-memory snapshot;
 * persisted logs accept an AbortSignal so an actively-written file that never
 * converges is abandoned instead of looping forever), falling back to the
 * session-query seam when persistence is unavailable.
 * @param {import("@deepseek-ai/cordis").Context} ctx
 * @param {string} id - session id
 * @returns {Promise<{ events: Array<object> } | null>} loaded events, or null when skipped
 */
async function loadSessionEvents(ctx, id) {
  const persistence = ctx.get("sessionPersistence");
  if (persistence !== void 0 && typeof persistence.inspect === "function") {
    const signal = AbortSignal.timeout(SESSION_READ_TIMEOUT_MS);
    try {
      const loaded = await persistence.inspect(id, signal);
      return { events: loaded.events ?? [] };
    } catch (error) {
      if (signal.aborted) return null; // actively-written log: skip, don't hang
      throw error;
    }
  }
  const loaded = await ctx.sessionQuery.readSession(id);
  return { events: loaded.events ?? [] };
}

/**
 * Aggregate today's provider-reported token usage across every session
 * (live + persisted), bucketed by the configured peak windows.
 *
 * The expensive full-log scan is single-flight: concurrent callers share one
 * in-progress scan, and its result is cached for {@link AGGREGATE_TTL_MS}.
 * @param {import("@deepseek-ai/cordis").Context} ctx
 * @param {number} now
 * @returns {Promise<{ day: string, start: number, end: number, usage: ReturnType<typeof aggregateEvents>, sessionsScanned: number, sessionsFailed: number, sessionsSkipped: number }>}
 */
async function aggregateToday(ctx, now = Date.now()) {
  if (aggregateCache && now - aggregateCache.at < AGGREGATE_TTL_MS) return aggregateCache.value;
  if (inflightAggregate) return inflightAggregate;
  inflightAggregate = runAggregate(ctx, now).finally(() => {
    inflightAggregate = null;
  });
  return inflightAggregate;
}

/** @param {import("@deepseek-ai/cordis").Context} ctx @param {number} now */
async function runAggregate(ctx, now) {
  const start = startOfDay(now);
  const end = start + 86_400_000;
  const windows = resolvedConfig().windows;
  const list = await ctx.sessionQuery.listSessions();
  const ids = list.map((record) => record.header.id);
  const emptyBucket = () => ({
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    requests: 0
  });
  const usage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    requests: 0,
    byPeriod: { peak: emptyBucket(), offPeak: emptyBucket() }
  };
  let sessionsScanned = 0;
  let sessionsFailed = 0;
  let sessionsSkipped = 0;
  const loadErrors = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      let loaded = null;
      try {
        loaded = await loadSessionEvents(ctx, id);
      } catch (error) {
        sessionsFailed += 1;
        if (loadErrors.length < 3) loadErrors.push(String(error && error.message || error));
        ctx.logger.warn(`deepseek-usage: failed to scan session "${id}"`);
        ctx.logger.warn(error);
      }
      if (loaded === null) {
        sessionsSkipped += 1;
        continue;
      }
      const folded = aggregateEvents(loaded.events ?? [], start, end, windows);
      usage.inputTokens += folded.inputTokens;
      usage.outputTokens += folded.outputTokens;
      usage.cacheReadTokens += folded.cacheReadTokens;
      usage.cacheWriteTokens += folded.cacheWriteTokens;
      usage.reasoningTokens += folded.reasoningTokens;
      usage.totalTokens += folded.totalTokens;
      usage.requests += folded.requests;
      usage.byPeriod.peak.inputTokens += folded.byPeriod.peak.inputTokens;
      usage.byPeriod.peak.outputTokens += folded.byPeriod.peak.outputTokens;
      usage.byPeriod.peak.cacheReadTokens += folded.byPeriod.peak.cacheReadTokens;
      usage.byPeriod.peak.cacheWriteTokens += folded.byPeriod.peak.cacheWriteTokens;
      usage.byPeriod.peak.reasoningTokens += folded.byPeriod.peak.reasoningTokens;
      usage.byPeriod.peak.requests += folded.byPeriod.peak.requests;
      usage.byPeriod.offPeak.inputTokens += folded.byPeriod.offPeak.inputTokens;
      usage.byPeriod.offPeak.outputTokens += folded.byPeriod.offPeak.outputTokens;
      usage.byPeriod.offPeak.cacheReadTokens += folded.byPeriod.offPeak.cacheReadTokens;
      usage.byPeriod.offPeak.cacheWriteTokens += folded.byPeriod.offPeak.cacheWriteTokens;
      usage.byPeriod.offPeak.reasoningTokens += folded.byPeriod.offPeak.reasoningTokens;
      usage.byPeriod.offPeak.requests += folded.byPeriod.offPeak.requests;
      sessionsScanned += 1;
    }
  };
  const workers = [];
  const count = Math.min(LOAD_CONCURRENCY, Math.max(1, ids.length));
  for (let i = 0; i < count; i += 1) workers.push(worker());
  await Promise.all(workers);
  const value = { day: dayLabel(now), start, end, usage, sessionsScanned, sessionsFailed, sessionsSkipped, loadErrors };
  aggregateCache = { value, at: Date.now() };
  return value;
}

/** @param {import("node:http").ServerResponse} res @param {number} status @param {unknown} body */
function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store"
  });
  res.end(payload);
}

/**
 * @param {import("@deepseek-ai/cordis").Context} ctx
 * @returns {(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => Promise<void>}
 */
function makeHandler(ctx) {
  return async (req, res) => {
    if (req.method !== "GET") {
      sendJson(res, 405, { ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "GET only" } });
      return;
    }
    try {
      const key = await resolveApiKey(ctx);
      if (key === null) {
        sendJson(res, 200, {
          ok: false,
          error: {
            code: "NO_API_KEY",
            message:
              "DEEPSEEK_API_KEY not configured. Store it through the web Models page (credentials service) or export DEEPSEEK_API_KEY in the launching environment."
          }
        });
        return;
      }
      const [balance, aggregate] = await Promise.all([fetchBalance(key), aggregateToday(ctx)]);
      const config = resolvedConfig();
      const split = priceCnySplit(aggregate.usage, config);
      const now = Date.now();
      sendJson(res, 200, {
        ok: true,
        fetchedAt: now,
        day: aggregate.day,
        currency: balance.balanceInfos[0]?.currency ?? "CNY",
        balance: {
          isAvailable: balance.isAvailable,
          totalBalance: balance.balanceInfos[0]?.totalBalance ?? "0",
          grantedBalance: balance.balanceInfos[0]?.grantedBalance ?? "0",
          toppedUpBalance: balance.balanceInfos[0]?.toppedUpBalance ?? "0"
        },
        usage: aggregate.usage,
        cost: {
          cny: split.totalCny,
          usd: split.totalCny / config.usdCny,
          peakCny: split.peakCny,
          offPeakCny: split.offPeakCny
        },
        pricing: {
          model: config.model,
          currency: config.currency,
          peak: { ...config.peak },
          offPeak: { ...config.offPeak },
          usdCny: config.usdCny
        },
        period: {
          now: isPeakHour(now, config.windows) ? "peak" : "offPeak",
          windows: config.windows.map((w) => ({ ...w })),
          timezone: "Asia/Shanghai (UTC+8)"
        },
        sessionsScanned: aggregate.sessionsScanned,
        sessionsFailed: aggregate.sessionsFailed,
        sessionsSkipped: aggregate.sessionsSkipped,
        loadErrors: aggregate.loadErrors
      });
    } catch (error) {
      ctx.logger.warn("deepseek-usage: request failed");
      ctx.logger.warn(error);
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 200, {
        ok: false,
        error: { code: err.code ?? "INTERNAL", message: err.message }
      });
    }
  };
}

/** @param {import("@deepseek-ai/cordis").Context} ctx @param {object} [config] */
function apply(ctx, config = {}) {
  // Register the billing-policy settings section; the dsh web Settings page
  // renders it automatically. Changes invalidate the aggregate cache so the
  // next request reprices with the new rates/windows.
  installSettingsSection(ctx, NS, Config, config, {
    setSource: (source) => {
      configSource = source;
    },
    onChange: () => {
      aggregateCache = null;
    }
  });
  ctx.effect(() => {
    const dispose = ctx.webServer.register({
      kind: "exact",
      path: "/api/deepseek-usage",
      handler: makeHandler(ctx)
    });
    ctx.logger.info("deepseek-usage: /api/deepseek-usage route registered");
    return dispose;
  }, "deepseek-usage: route");
}

export { Config, apply, inject, name, resolvedConfig };
