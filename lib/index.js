// dsh-plugin-deepseek-usage — host half.
//
// Registers routes on the dsh web server:
//   GET  /api/deepseek-usage          — live balance + today's usage, priced
//   GET  /api/deepseek-usage/config   — current plugin configuration
//   POST /api/deepseek-usage/config   — save plugin configuration
//
// Usage accounting is incremental: the plugin subscribes to live session
// events (`session/event`) and accumulates per-day usage buckets in a small
// in-memory ledger, persisted as one JSON file under the dsh home. The API
// answers from the ledger (O(1), no scanning). A full-log scan exists only
// as a fallback: first start / after a pricing-window change / when the
// ledger has no entry for today (e.g. the plugin was idle over midnight),
// it runs once, single-flight, and adopts the result into the ledger.
//
// Configuration is plugin-owned (the dsh settings seam does not expose
// third-party namespaces to the web Settings page yet), stored as one JSON
// file under the dsh home and edited through the config routes — the
// browser half renders a small config panel on demand.
//
// The browser half (./client) renders the numbers in a compact top bar.
// @ts-check

import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { aggregateEvents, dayLabel, isPeakHour, priceCnySplit, startOfDay } from "./usage.js";
import { createLedger } from "./stats.js";
import { fetchBalance } from "./balance.js";
import { CONFIG_FILE_NAME, defaultConfig, loadConfigFile, normalizeConfig, saveConfigFile } from "./config.js";

/** Cordis plugin name. */
const name = "deepseek-usage";

/** Required services: the web route registry and the session query seam. */
const inject = ["webServer", "sessionQuery"];

/** Max concurrent persisted-session loads during one aggregate pass. */
const LOAD_CONCURRENCY = 4;

/**
 * Per-session read budget (ms). A session whose log is being actively written
 * by another instance can keep changing revision forever; give up on it after
 * this budget and skip it for the pass instead of blocking the event loop.
 */
const SESSION_READ_TIMEOUT_MS = 15_000;

/**
 * Ledger persistence throttle (ms). In-memory counters are flushed to the
 * JSON file at most this often; a crash loses at most this much tail.
 */
const LEDGER_FLUSH_INTERVAL_MS = 30_000;

/**
 * File name (under the dsh home) holding the per-day usage ledger.
 */
const LEDGER_FILE_NAME = "deepseek-usage-ledger.json";

/** @type {string | null} */
let cachedKey = null;
/** @type {{ value: string | null } | null} */
let keyCache = null;
/** @type {Promise<object> | null} */
let inflightAggregate = null;
/** @type {ReturnType<typeof defaultConfig>} */
let config = defaultConfig();
/** @type {string | null} */
let configPath = null;
/** @type {ReturnType<typeof createLedger>} */
let ledger = createLedger();
/** @type {string | null} */
let ledgerPath = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let ledgerFlushTimer = null;
/** @type {boolean} */
let ledgerDirty = false;

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
 * Run one full-log scan for the day containing `now` and fold the result
 * into the ledger (`adoptDay`). Single-flight and cached like before, but
 * this is now only a fallback/baseline path, not the hot path.
 * @param {import("@deepseek-ai/cordis").Context} ctx
 * @param {number} now
 * @returns {Promise<{ day: string, usage: ReturnType<typeof aggregateEvents>, sessionsScanned: number, sessionsFailed: number, sessionsSkipped: number }>}
 */
async function runBaselineScan(ctx, now = Date.now()) {
  if (inflightAggregate) return inflightAggregate;
  inflightAggregate = (async () => {
    const start = startOfDay(now);
    const end = start + 86_400_000;
    const windows = config.peakWindows;
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
    const day = dayLabel(now);
    ledger.adoptDay(day, usage);
    ledgerDirty = true;
    void flushLedger();
    return { day, usage, sessionsScanned, sessionsFailed, sessionsSkipped, loadErrors };
  })().finally(() => {
    inflightAggregate = null;
  });
  return inflightAggregate;
}

/**
 * Persist the ledger to disk (atomic rename). No-op when the file path is
 * not ready or nothing changed since the last flush.
 * @returns {Promise<void>}
 */
async function flushLedger() {
  if (ledgerPath === null || !ledgerDirty) return;
  ledgerDirty = false;
  const payload = JSON.stringify(ledger.serialize());
  const tmp = `${ledgerPath}.tmp`;
  try {
    await mkdir(dirname(ledgerPath), { recursive: true });
    await writeFile(tmp, payload, "utf8");
    await rename(tmp, ledgerPath);
  } catch (error) {
    // A transient write failure must not break accounting; retry on next tick.
    ledgerDirty = true;
  }
}

/**
 * Load the ledger from disk, if present. Invalid/corrupt files reset to empty
 * (the caller re-baselines today).
 * @returns {Promise<void>}
 */
async function loadLedger() {
  if (ledgerPath === null) return;
  try {
    const text = await readFile(ledgerPath, "utf8");
    ledger.deserialize(JSON.parse(text));
  } catch (error) {
    ledger = createLedger();
  }
}

/**
 * Ensure the ledger has an entry for today: if not (first start, or the
 * plugin was idle over midnight), run a one-time baseline scan to fill it.
 * @param {import("@deepseek-ai/cordis").Context} ctx
 * @param {number} now
 * @returns {Promise<void>}
 */
async function ensureToday(ctx, now = Date.now()) {
  const day = dayLabel(now);
  if (ledger.hasDay(day)) return;
  try {
    await runBaselineScan(ctx, now);
  } catch (error) {
    ctx.logger.warn("deepseek-usage: baseline scan failed; will retry on next request");
    ctx.logger.warn(error);
  }
}

/**
 * Answer today's usage: ledger-first (O(1)), scanning only as a fallback
 * when the ledger has no entry yet (e.g. the very first request racing the
 * baseline).
 * @param {import("@deepseek-ai/cordis").Context} ctx
 * @param {number} now
 * @returns {Promise<{ day: string, usage: ReturnType<typeof aggregateEvents>, sessionsScanned: number, sessionsFailed: number, sessionsSkipped: number, fromLedger: boolean }>}
 */
async function todayUsage(ctx, now = Date.now()) {
  const day = dayLabel(now);
  const fromLedger = ledger.getDay(day);
  if (fromLedger !== null) {
    return { day, usage: fromLedger, sessionsScanned: 0, sessionsFailed: 0, sessionsSkipped: 0, fromLedger: true };
  }
  const baseline = await runBaselineScan(ctx, now);
  return {
    day: baseline.day,
    usage: ledger.getDay(baseline.day) ?? baseline.usage,
    sessionsScanned: baseline.sessionsScanned,
    sessionsFailed: baseline.sessionsFailed,
    sessionsSkipped: baseline.sessionsSkipped,
    fromLedger: false
  };
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
 * Read the JSON request body (bounded).
 * @param {import("node:http").IncomingMessage} req
 * @returns {Promise<unknown>}
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    const MAX = 64 * 1024;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body.length === 0 ? {} : JSON.parse(body));
      } catch (error) {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

/**
 * Handle GET /api/deepseek-usage — balance + today's usage priced with the
 * current configuration.
 * @param {import("@deepseek-ai/cordis").Context} ctx
 * @returns {(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => Promise<void>}
 */
function makeUsageHandler(ctx) {
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
      const [balance, aggregate] = await Promise.all([fetchBalance(key), todayUsage(ctx)]);
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
          now: isPeakHour(now, config.peakWindows) ? "peak" : "offPeak",
          windows: config.peakWindows.map((w) => ({ ...w })),
          timezone: "Asia/Shanghai (UTC+8)"
        },
        refreshIntervalMs: config.refreshIntervalMs,
        fromLedger: aggregate.fromLedger,
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

/**
 * Handle GET/POST /api/deepseek-usage/config — read or save the plugin
 * configuration (billing rates, peak windows, refresh interval).
 * @param {import("@deepseek-ai/cordis").Context} ctx
 * @returns {(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => Promise<void>}
 */
function makeConfigHandler(ctx) {
  return async (req, res) => {
    try {
      if (req.method === "GET") {
        sendJson(res, 200, { ok: true, config });
        return;
      }
      if (req.method !== "POST") {
        sendJson(res, 405, { ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "GET or POST only" } });
        return;
      }
      const raw = await readBody(req);
      const next = normalizeConfig(raw);
      const windowsChanged = JSON.stringify(next.peakWindows) !== JSON.stringify(config.peakWindows);
      config = next;
      if (configPath !== null) await saveConfigFile(configPath, config);
      // A window change invalidates the ledger split; drop it so the next
      // request re-baselines today under the new windows.
      if (windowsChanged) {
        ledger.clear();
        ledgerDirty = true;
        void flushLedger();
        void ensureToday(ctx);
      }
      sendJson(res, 200, { ok: true, config });
    } catch (error) {
      ctx.logger.warn("deepseek-usage: config request failed");
      ctx.logger.warn(error);
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 200, {
        ok: false,
        error: { code: err.code ?? "CONFIG_INVALID", message: err.message }
      });
    }
  };
}

/** @param {import("@deepseek-ai/cordis").Context} ctx @param {object} [pluginConfig] */
function apply(ctx, pluginConfig = {}) {
  // Resolve file paths under the dsh home (e.g. ~/.dsh).
  const home = resolveDshHome();
  configPath = join(home, CONFIG_FILE_NAME);
  ledgerPath = join(home, LEDGER_FILE_NAME);

  ctx.effect(() => {
    const disposers = [];

    // Subscribe to live session events and increment the ledger. This is the
    // hot path: O(1) arithmetic per assistant/message, no scanning. `ctx.on`
    // (cordis) returns a disposer; subscriptions die with this effect.
    disposers.push(ctx.on("session/event", (session, event) => {
      if (ledger.record(event, config.peakWindows)) {
        ledgerDirty = true;
      }
    }));
    disposers.push(ctx.on("session/flush", () => {
      void flushLedger();
    }));

    // Periodic ledger flush (in-memory counters → JSON file).
    ledgerFlushTimer = setInterval(() => {
      void flushLedger();
    }, LEDGER_FLUSH_INTERVAL_MS);
    ledgerFlushTimer.unref?.();
    disposers.push(() => {
      if (ledgerFlushTimer !== null) clearInterval(ledgerFlushTimer);
      ledgerFlushTimer = null;
    });

    // Load persisted configuration + ledger, then ensure today is present
    // (baseline if needed). Requests that arrive before this settles fall
    // through todayUsage() to the single-flight scan, so the API never hangs
    // on the ledger being empty.
    void (async () => {
      config = await loadConfigFile(configPath);
      await loadLedger();
      await ensureToday(ctx);
    })().catch((error) => {
      ctx.logger.warn("deepseek-usage: init failed; falling back to scans");
      ctx.logger.warn(error);
    });

    disposers.push(ctx.webServer.register({
      kind: "exact",
      path: "/api/deepseek-usage",
      handler: makeUsageHandler(ctx)
    }));
    disposers.push(ctx.webServer.register({
      kind: "exact",
      path: "/api/deepseek-usage/config",
      handler: makeConfigHandler(ctx)
    }));
    ctx.logger.info("deepseek-usage: /api/deepseek-usage and /api/deepseek-usage/config routes registered");

    return () => {
      for (const dispose of disposers) {
        try {
          dispose();
        } catch {
          /* best-effort teardown */
        }
      }
      void flushLedger();
    };
  }, "deepseek-usage: lifecycle");
}

export { apply, inject, name };
