// Pure usage aggregation and pricing helpers for dsh-plugin-deepseek-usage.
// No harness imports — unit-testable in isolation.
// @ts-check

/**
 * Local-day boundary in ms since epoch for the day containing `at`.
 * @param {number} at - unix epoch milliseconds
 * @param {number} [tzOffsetMs] - caller's local timezone offset in ms (defaults to server local time)
 * @returns {number} ms epoch at 00:00:00.000 local on that day
 */
export function startOfDay(at, tzOffsetMs = new Date(at).getTimezoneOffset() * 60000) {
  const local = at - tzOffsetMs;
  const dayStartLocal = Math.floor(local / 86400000) * 86400000;
  return dayStartLocal + tzOffsetMs;
}

/** ISO date string (YYYY-MM-DD) for the local day containing `at`. */
export function dayLabel(at) {
  const d = new Date(at);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Fold session events into today's usage totals.
 * @param {Array} events - session events ({ type, seq, time, data })
 * @param {number} start - day start ms
 * @param {number} end - next day start ms
 * @returns {{ inputTokens: number, outputTokens: number, cacheReadTokens: number, cacheWriteTokens: number, reasoningTokens: number, totalTokens: number, requests: number }}
 */
export function aggregateEvents(events, start, end) {
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let reasoningTokens = 0;
  let requests = 0;
  for (const event of events) {
    if (event == null || event.type !== "assistant/message") continue;
    const time = event.time;
    if (typeof time !== "number" || time < start || time >= end) continue;
    const usage = event.data && event.data.usage;
    if (usage == null || typeof usage !== "object") continue;
    const num = (v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
    inputTokens += num(usage.inputTokens);
    outputTokens += num(usage.outputTokens);
    cacheReadTokens += num(usage.cacheReadTokens);
    cacheWriteTokens += num(usage.cacheWriteTokens);
    reasoningTokens += num(usage.reasoningTokens);
    requests += 1;
  }
  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    reasoningTokens,
    totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens,
    requests
  };
}

/**
 * Estimated USD cost for one usage fold.
 * @param {{ inputTokens: number, outputTokens: number, cacheReadTokens: number }} usage
 * @param {{ inputCacheMiss: number, inputCacheHit: number, output: number }} pricing - USD per 1M tokens
 * @returns {number} USD
 */
export function priceUsd(usage, pricing) {
  const miss = (usage.inputTokens || 0) * pricing.inputCacheMiss;
  const hit = (usage.cacheReadTokens || 0) * pricing.inputCacheHit;
  const out = (usage.outputTokens || 0) * pricing.output;
  return (miss + hit + out) / 1_000_000;
}

/** Default pricing: deepseek-v4-flash current list prices (USD per 1M tokens) plus a USD→CNY estimate. */
export const DEFAULT_PRICING = Object.freeze({
  inputCacheMiss: 0.14,
  inputCacheHit: 0.0028,
  output: 0.28,
  usdCny: 7.15
});
