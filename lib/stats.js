// Incremental token-usage ledger for dsh-plugin-deepseek-usage.
//
// Subscribes to live session events (session/event) and accumulates
// per-day usage buckets in memory, persisted as a small JSON file, so
// the API answers from memory instead of scanning every session log.
// Pure module: no harness imports, unit-testable in isolation.
// @ts-check

import { isPeakHour, dayLabel } from "./usage.js";

/** @typedef {{ inputTokens: number, outputTokens: number, cacheReadTokens: number, cacheWriteTokens: number, reasoningTokens: number, requests: number }} Bucket */

/** @returns {Bucket} */
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

/**
 * Whether an event carries provider-reported usage this plugin counts.
 * Mirrors the aggregation predicate: assistant/message with a usage object.
 * @param {object | null | undefined} event
 * @returns {boolean}
 */
export function isUsageEvent(event) {
  return event != null && event.type === "assistant/message" && event.data != null && event.data.usage != null && typeof event.data.usage === "object";
}

/**
 * Fold one event's usage into a bucket (same semantics as aggregateEvents).
 * @param {Bucket} bucket
 * @param {object} usage - provider-reported usage fields
 */
function foldUsage(bucket, usage) {
  const num = (v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
  bucket.inputTokens += num(usage.inputTokens);
  bucket.outputTokens += num(usage.outputTokens);
  bucket.cacheReadTokens += num(usage.cacheReadTokens);
  bucket.cacheWriteTokens += num(usage.cacheWriteTokens);
  bucket.reasoningTokens += num(usage.reasoningTokens);
  bucket.requests += 1;
}

/**
 * Merge one bucket into another.
 * @param {Bucket} target
 * @param {Bucket} source
 */
function mergeBucket(target, source) {
  target.inputTokens += source.inputTokens;
  target.outputTokens += source.outputTokens;
  target.cacheReadTokens += source.cacheReadTokens;
  target.cacheWriteTokens += source.cacheWriteTokens;
  target.reasoningTokens += source.reasoningTokens;
  target.requests += source.requests;
}

/**
 * Build a day snapshot in the same shape aggregateEvents() returns, so
 * downstream pricing/client code is interchangeable between scan and ledger.
 * @param {{ peak: Bucket, offPeak: Bucket }} day
 * @returns {ReturnType<typeof import("./usage.js").aggregateEvents>}
 */
function daySnapshot(day) {
  const total = emptyBucket();
  mergeBucket(total, day.peak);
  mergeBucket(total, day.offPeak);
  return {
    inputTokens: total.inputTokens,
    outputTokens: total.outputTokens,
    cacheReadTokens: total.cacheReadTokens,
    cacheWriteTokens: total.cacheWriteTokens,
    reasoningTokens: total.reasoningTokens,
    totalTokens: total.inputTokens + total.outputTokens + total.cacheReadTokens + total.cacheWriteTokens,
    requests: total.requests,
    byPeriod: { peak: { ...day.peak }, offPeak: { ...day.offPeak } }
  };
}

/**
 * Incremental per-day usage ledger. Not tied to a file: persistence is
 * handled by the caller via serialize / deserialize.
 */
export function createLedger() {
  /** @type {Map<string, { peak: Bucket, offPeak: Bucket }>} */
  const days = new Map();

  /** @param {string} dayKey */
  function ensureDay(dayKey) {
    let day = days.get(dayKey);
    if (day === void 0) {
      day = { peak: emptyBucket(), offPeak: emptyBucket() };
      days.set(dayKey, day);
    }
    return day;
  }

  return {
    /**
     * Record one session event. Returns true when it contributed usage.
     * @param {object} event - a session event ({ type, time, data })
     * @param {Array<{ startHour: number, endHour: number }>} windows - peak windows
     * @returns {boolean}
     */
    record(event, windows) {
      if (!isUsageEvent(event)) return false;
      const time = event.time;
      if (typeof time !== "number" || !Number.isFinite(time)) return false;
      const day = ensureDay(dayLabel(time));
      const bucket = isPeakHour(time, windows) ? day.peak : day.offPeak;
      foldUsage(bucket, event.data.usage);
      return true;
    },

    /**
     * Adopt a full-day baseline computed by a scan (e.g. first start, or
     * after a config change invalidated the ledger). Replaces any existing
     * partial day with the scan result so totals never double-count.
     * @param {string} dayKey - YYYY-MM-DD
     * @param {ReturnType<typeof import("./usage.js").aggregateEvents>} usage
     */
    adoptDay(dayKey, usage) {
      const day = { peak: emptyBucket(), offPeak: emptyBucket() };
      mergeBucket(day.peak, usage.byPeriod.peak);
      mergeBucket(day.offPeak, usage.byPeriod.offPeak);
      days.set(dayKey, day);
    },

    /**
     * Current snapshot for one day, or null when the ledger has no data for it.
     * @param {string} dayKey - YYYY-MM-DD
     * @returns {ReturnType<typeof import("./usage.js").aggregateEvents> | null}
     */
    getDay(dayKey) {
      const day = days.get(dayKey);
      return day === void 0 ? null : daySnapshot(day);
    },

    /** @param {string} dayKey */
    hasDay(dayKey) {
      return days.has(dayKey);
    },

    /** Drop everything (used when pricing windows change and the day
     *  split no longer matches the configured windows). */
    clear() {
      days.clear();
    },

    /** Number of tracked days. */
    get size() {
      return days.size;
    },

    /**
     * Serialize for persistence (plain JSON data only).
     * @returns {{ version: number, days: Record<string, { peak: Bucket, offPeak: Bucket }> }}
     */
    serialize() {
      /** @type {Record<string, { peak: Bucket, offPeak: Bucket }>} */
      const out = {};
      for (const [dayKey, day] of days) {
        out[dayKey] = { peak: { ...day.peak }, offPeak: { ...day.offPeak } };
      }
      return { version: 1, days: out };
    },

    /**
     * Restore from previously serialized data. Invalid entries are ignored;
     * a malformed root resets the ledger to empty (caller may re-baseline).
     * @param {unknown} raw
     */
    deserialize(raw) {
      days.clear();
      if (raw == null || typeof raw !== "object") return;
      const root = /** @type {{ days?: unknown }} */ (raw);
      if (root.days == null || typeof root.days !== "object") return;
      for (const [dayKey, value] of Object.entries(root.days)) {
        if (typeof dayKey !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) continue;
        const day = /** @type {{ peak?: unknown, offPeak?: unknown }} */ (value);
        if (day == null || typeof day !== "object") continue;
        const bucket = (v) => {
          const b = emptyBucket();
          if (v == null || typeof v !== "object") return b;
          const src = /** @type {Record<string, unknown>} */ (v);
          const num = (k) => (typeof src[k] === "number" && Number.isFinite(src[k]) ? Number(src[k]) : 0);
          b.inputTokens = num("inputTokens");
          b.outputTokens = num("outputTokens");
          b.cacheReadTokens = num("cacheReadTokens");
          b.cacheWriteTokens = num("cacheWriteTokens");
          b.reasoningTokens = num("reasoningTokens");
          b.requests = num("requests");
          return b;
        };
        days.set(dayKey, { peak: bucket(day.peak), offPeak: bucket(day.offPeak) });
      }
    }
  };
}
