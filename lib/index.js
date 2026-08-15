// dsh-plugin-deepseek-usage — host half.
//
// Registers GET /api/deepseek-usage on the dsh web server. The endpoint
// returns live DeepSeek balance (official public API, via the credential
// seam's DEEPSEEK_API_KEY) plus today's token usage aggregated from the
// session store (assistant/message events carry provider-reported usage),
// priced with configurable per-token rates.
//
// The browser half (./client) renders the numbers in a compact top bar.
// @ts-check

import { aggregateEvents, dayLabel, priceUsd, DEFAULT_PRICING, startOfDay } from "./usage.js";
import { fetchBalance } from "./balance.js";

/** Cordis plugin name. */
const name = "deepseek-usage";

/** Required services: the web route registry and the session query seam. */
const inject = ["webServer", "sessionQuery"];

/** Aggregate cache TTL (ms): keep persisted-log scans off the hot path. */
const AGGREGATE_TTL_MS = 20_000;

/** Max concurrent persisted-session loads during one aggregate pass. */
const LOAD_CONCURRENCY = 4;

/** @type {string | null} */
let cachedKey = null;
/** @type {{ value: string | null } | null} */
let keyCache = null;
/** @type {{ value: object | null, at: number } | null} */
let aggregateCache = null;

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
 * Aggregate today's provider-reported token usage across every session
 * (live + persisted) through the session-query seam.
 * @param {import("@deepseek-ai/cordis").Context} ctx
 * @param {number} now
 * @returns {Promise<{ day: string, start: number, end: number, usage: ReturnType<typeof aggregateEvents>, sessionsScanned: number, sessionsFailed: number }>}
 */
async function aggregateToday(ctx, now = Date.now()) {
  if (aggregateCache && now - aggregateCache.at < AGGREGATE_TTL_MS) return aggregateCache.value;
  const start = startOfDay(now);
  const end = start + 86_400_000;
  const list = await ctx.sessionQuery.listSessions();
  const ids = list.map((record) => record.header.id);
  const usage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    requests: 0
  };
  let sessionsScanned = 0;
  let sessionsFailed = 0;
  const loadErrors = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      try {
        const loaded = await ctx.sessionQuery.readSession(id);
        const folded = aggregateEvents(loaded.events ?? [], start, end);
        usage.inputTokens += folded.inputTokens;
        usage.outputTokens += folded.outputTokens;
        usage.cacheReadTokens += folded.cacheReadTokens;
        usage.cacheWriteTokens += folded.cacheWriteTokens;
        usage.reasoningTokens += folded.reasoningTokens;
        usage.totalTokens += folded.totalTokens;
        usage.requests += folded.requests;
        sessionsScanned += 1;
      } catch (error) {
        sessionsFailed += 1;
        if (loadErrors.length < 3) loadErrors.push(String(error && error.message || error));
        ctx.logger.warn(`deepseek-usage: failed to scan session "${id}"`);
        ctx.logger.warn(error);
      }
    }
  };
  const workers = [];
  const count = Math.min(LOAD_CONCURRENCY, Math.max(1, ids.length));
  for (let i = 0; i < count; i += 1) workers.push(worker());
  await Promise.all(workers);
  const value = { day: dayLabel(now), start, end, usage, sessionsScanned, sessionsFailed, loadErrors };
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
      const costUsd = priceUsd(aggregate.usage, DEFAULT_PRICING);
      sendJson(res, 200, {
        ok: true,
        fetchedAt: Date.now(),
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
          usd: costUsd,
          cny: costUsd * DEFAULT_PRICING.usdCny
        },
        pricing: { ...DEFAULT_PRICING },
        sessionsScanned: aggregate.sessionsScanned,
        sessionsFailed: aggregate.sessionsFailed,
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

/** @param {import("@deepseek-ai/cordis").Context} ctx */
function apply(ctx) {
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

export { apply, inject, name };
