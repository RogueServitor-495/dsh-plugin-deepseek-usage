// Pure usage aggregation and pricing helpers for dsh-plugin-deepseek-usage.
// No harness imports — unit-testable in isolation.
// @ts-check

/**
 * Peak billing windows, in Beijing time (UTC+8), per the DeepSeek V4 tiered
 * pricing that took effect 2026-08-17. Windows are [startHour, endHour), i.e.
 * 09:00–12:00 and 14:00–18:00 Beijing time; everything else is off-peak.
 */
export const PEAK_WINDOWS = Object.freeze([
  Object.freeze({ startHour: 9, endHour: 12 }),
  Object.freeze({ startHour: 14, endHour: 18 })
]);

/** @param {number} hourUtc8 - hour of day in Beijing time (0-23) @param {Array<{ startHour: number, endHour: number }>} windows */
function isInPeakWindow(hourUtc8, windows) {
  return windows.some((w) => hourUtc8 >= w.startHour && hourUtc8 < w.endHour);
}

/**
 * Whether a Unix-ms timestamp falls in a DeepSeek peak billing window
 * (Beijing time). The server local timezone is deliberately NOT used.
 * @param {number} at - unix epoch milliseconds
 * @param {Array<{ startHour: number, endHour: number }>} [windows] - peak windows; defaults to {@link PEAK_WINDOWS}
 * @returns {boolean}
 */
export function isPeakHour(at, windows = PEAK_WINDOWS) {
  const hourUtc8 = (new Date(at).getUTCHours() + 8) % 24;
  return isInPeakWindow(hourUtc8, windows);
}

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

/** @typedef {{ inputTokens: number, outputTokens: number, cacheReadTokens: number, cacheWriteTokens: number, reasoningTokens: number, requests: number }} UsageBucket */

/** @returns {UsageBucket} */
function emptyBucket() {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    requests: 0
  };
}

/** @param {UsageBucket} a @param {UsageBucket} b */
function addBucket(a, b) {
  a.inputTokens += b.inputTokens;
  a.outputTokens += b.outputTokens;
  a.cacheReadTokens += b.cacheReadTokens;
  a.cacheWriteTokens += b.cacheWriteTokens;
  a.reasoningTokens += b.reasoningTokens;
  a.requests += b.requests;
}

/**
 * Fold session events into today's usage totals, split by DeepSeek peak vs
 * off-peak billing windows so the tiered rate applies per request.
 * @param {Array} events - session events ({ type, seq, time, data })
 * @param {number} start - day start ms
 * @param {number} end - next day start ms
 * @param {Array<{ startHour: number, endHour: number }>} [windows] - peak windows; defaults to {@link PEAK_WINDOWS}
 * @returns {{
 *   inputTokens: number, outputTokens: number, cacheReadTokens: number,
 *   cacheWriteTokens: number, reasoningTokens: number, totalTokens: number,
 *   requests: number,
 *   byPeriod: { peak: UsageBucket, offPeak: UsageBucket }
 * }}
 */
export function aggregateEvents(events, start, end, windows = PEAK_WINDOWS) {
  const peak = emptyBucket();
  const offPeak = emptyBucket();
  for (const event of events) {
    if (event == null || event.type !== "assistant/message") continue;
    const time = event.time;
    if (typeof time !== "number" || time < start || time >= end) continue;
    const usage = event.data && event.data.usage;
    if (usage == null || typeof usage !== "object") continue;
    const num = (v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
    const bucket = isPeakHour(time, windows) ? peak : offPeak;
    bucket.inputTokens += num(usage.inputTokens);
    bucket.outputTokens += num(usage.outputTokens);
    bucket.cacheReadTokens += num(usage.cacheReadTokens);
    bucket.cacheWriteTokens += num(usage.cacheWriteTokens);
    bucket.reasoningTokens += num(usage.reasoningTokens);
    bucket.requests += 1;
  }
  const total = emptyBucket();
  addBucket(total, peak);
  addBucket(total, offPeak);
  return {
    inputTokens: total.inputTokens,
    outputTokens: total.outputTokens,
    cacheReadTokens: total.cacheReadTokens,
    cacheWriteTokens: total.cacheWriteTokens,
    reasoningTokens: total.reasoningTokens,
    totalTokens: total.inputTokens + total.outputTokens + total.cacheReadTokens + total.cacheWriteTokens,
    requests: total.requests,
    byPeriod: { peak, offPeak }
  };
}

/**
 * Price a usage fold at one rate tier.
 * @param {{ inputTokens: number, cacheReadTokens: number, outputTokens: number }} bucket
 * @param {{ inputCacheMiss: number, inputCacheHit: number, output: number }} rates - CNY per 1M tokens
 * @returns {number} CNY
 */
function priceBucketCny(bucket, rates) {
  const miss = (bucket.inputTokens || 0) * rates.inputCacheMiss;
  const hit = (bucket.cacheReadTokens || 0) * rates.inputCacheHit;
  const out = (bucket.outputTokens || 0) * rates.output;
  return (miss + hit + out) / 1_000_000;
}

/**
 * Price the peak and off-peak buckets of one usage fold under DeepSeek's
 * tiered pricing and return the per-tier CNY costs plus the total.
 * @param {ReturnType<typeof aggregateEvents>} usage
 * @param {{
 *   peak: { inputCacheMiss: number, inputCacheHit: number, output: number },
 *   offPeak: { inputCacheMiss: number, inputCacheHit: number, output: number }
 * }} pricing - CNY per 1M tokens per tier
 * @returns {{ peakCny: number, offPeakCny: number, totalCny: number }}
 */
export function priceCnySplit(usage, pricing) {
  const byPeriod = usage.byPeriod || { peak: usage, offPeak: usage };
  const peakCny = priceBucketCny(byPeriod.peak || {}, pricing.peak || pricing);
  const offPeakCny = priceBucketCny(byPeriod.offPeak || {}, pricing.offPeak || pricing);
  return { peakCny, offPeakCny, totalCny: peakCny + offPeakCny };
}

/**
 * Estimated CNY cost of one usage fold under DeepSeek's peak/off-peak tiered
 * pricing. Each request is priced with the rate of the window it happened in.
 * @param {ReturnType<typeof aggregateEvents>} usage
 * @param {{
 *   peak: { inputCacheMiss: number, inputCacheHit: number, output: number },
 *   offPeak: { inputCacheMiss: number, inputCacheHit: number, output: number }
 * }} pricing - CNY per 1M tokens per tier
 * @returns {number} CNY
 */
export function priceCny(usage, pricing) {
  return priceCnySplit(usage, pricing).totalCny;
}

/**
 * Default pricing: DeepSeek-V4-Flash tiered list prices (CNY per 1M tokens)
 * per the peak/off-peak policy effective 2026-08-17, plus a CNY→USD reference
 * rate for display only.
 *
 * Peak (Beijing 09:00–12:00, 14:00–18:00):  cache hit 0.10 / cache miss 3.00 / output 9.00
 * Off-peak (all other hours):               cache hit 0.05 / cache miss 1.50 / output 4.50
 */
export const DEFAULT_PRICING = Object.freeze({
  currency: "CNY",
  model: "deepseek-v4-flash",
  peak: Object.freeze({
    inputCacheMiss: 3.0,
    inputCacheHit: 0.1,
    output: 9.0
  }),
  offPeak: Object.freeze({
    inputCacheMiss: 1.5,
    inputCacheHit: 0.05,
    output: 4.5
  }),
  usdCny: 7.15
});
