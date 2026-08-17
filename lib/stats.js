// Incremental token-usage ledger for dsh-plugin-deepseek-usage.
//
// Subscribes to live session events (session/event) and accumulates
// per-day, per-model usage buckets in memory, persisted as a small JSON
// file, so the API answers from memory instead of scanning every session
// log. Pure module: no harness imports, unit-testable in isolation.
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
 * Whether an event carries the request header (model/provider snapshot).
 * @param {object | null | undefined} event
 * @returns {boolean}
 */
export function isHeaderEvent(event) {
  return event != null && event.type === "request/header" && event.data != null && event.data.header != null && typeof event.data.header === "object";
}

/**
 * Extract the model id from a request/header event, or undefined.
 * @param {object} event
 * @returns {string | undefined}
 */
export function modelOfHeader(event) {
  const config = event.data && event.data.header && event.data.header.config;
  return config && typeof config.model === "string" && config.model.length > 0 ? config.model : void 0;
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

/** @typedef {{ peak: Bucket, offPeak: Bucket }} DayModel */
/** @typedef {{ peak: Bucket, offPeak: Bucket, byModel: Record<string, DayModel> }} DayEntry */

/** @returns {DayEntry} */
function emptyDay() {
  return { peak: emptyBucket(), offPeak: emptyBucket(), byModel: {} };
}

/**
 * Build a day snapshot in the same shape aggregateEvents() returns, so
 * downstream pricing/client code is interchangeable between scan and ledger.
 * Totals merge every model; per-model breakdown rides along in byModel.
 * @param {DayEntry} day
 * @returns {ReturnType<typeof import("./usage.js").aggregateEvents> & { byModel: Record<string, ReturnType<typeof import("./usage.js").aggregateEvents>> }}
 */
function daySnapshot(day) {
  const total = emptyBucket();
  mergeBucket(total, day.peak);
  mergeBucket(total, day.offPeak);
  const byModel = {};
  for (const [model, m] of Object.entries(day.byModel)) {
    const snap = {
      inputTokens: m.peak.inputTokens + m.offPeak.inputTokens,
      outputTokens: m.peak.outputTokens + m.offPeak.outputTokens,
      cacheReadTokens: m.peak.cacheReadTokens + m.offPeak.cacheReadTokens,
      cacheWriteTokens: m.peak.cacheWriteTokens + m.offPeak.cacheWriteTokens,
      reasoningTokens: m.peak.reasoningTokens + m.offPeak.reasoningTokens,
      totalTokens: (m.peak.inputTokens + m.offPeak.inputTokens) + (m.peak.outputTokens + m.offPeak.outputTokens) + (m.peak.cacheReadTokens + m.offPeak.cacheReadTokens) + (m.peak.cacheWriteTokens + m.offPeak.cacheWriteTokens),
      requests: m.peak.requests + m.offPeak.requests,
      byPeriod: { peak: { ...m.peak }, offPeak: { ...m.offPeak } }
    };
    byModel[model] = snap;
  }
  return {
    inputTokens: total.inputTokens,
    outputTokens: total.outputTokens,
    cacheReadTokens: total.cacheReadTokens,
    cacheWriteTokens: total.cacheWriteTokens,
    reasoningTokens: total.reasoningTokens,
    totalTokens: total.inputTokens + total.outputTokens + total.cacheReadTokens + total.cacheWriteTokens,
    requests: total.requests,
    byPeriod: { peak: { ...day.peak }, offPeak: { ...day.offPeak } },
    byModel
  };
}

/**
 * Incremental per-day usage ledger, bucketed per model. Not tied to a file:
 * persistence is handled by the caller via serialize / deserialize.
 */
export function createLedger() {
  /** @type {Map<string, DayEntry>} */
  const days = new Map();

  /** @param {string} dayKey */
  function ensureDay(dayKey) {
    let day = days.get(dayKey);
    if (day === void 0) {
      day = emptyDay();
      days.set(dayKey, day);
    }
    return day;
  }

  /**
   * Record one session event. Returns true when it contributed usage.
   * @param {object} event - a session event ({ type, time, data })
   * @param {Array<{ startHour: number, endHour: number }>} windows - peak windows
   * @param {string} [modelId] - model id from request/header; usage is bucketed
   *   under it when provided, otherwise under the "unknown" aggregate
   * @returns {boolean}
   */
  function record(event, windows, modelId) {
    if (!isUsageEvent(event)) return false;
    const time = event.time;
    if (typeof time !== "number" || !Number.isFinite(time)) return false;
    const day = ensureDay(dayLabel(time));
    const bucket = isPeakHour(time, windows) ? day.peak : day.offPeak;
    foldUsage(bucket, event.data.usage);
    // per-model bucket
    const key = typeof modelId === "string" && modelId.length > 0 ? modelId : "unknown";
    let model = day.byModel[key];
    if (model === void 0) {
      model = { peak: emptyBucket(), offPeak: emptyBucket() };
      day.byModel[key] = model;
    }
    const modelBucket = isPeakHour(time, windows) ? model.peak : model.offPeak;
    foldUsage(modelBucket, event.data.usage);
    return true;
  }

  return {
    record,

    /**
     * Adopt a full-day baseline computed by a scan. Replaces any existing
     * partial day with the scan result so totals never double-count.
     * @param {string} dayKey - YYYY-MM-DD
     * @param {ReturnType<typeof import("./usage.js").aggregateEvents>} usage
     * @param {Record<string, ReturnType<typeof import("./usage.js").aggregateEvents>>} [byModel]
     */
    adoptDay(dayKey, usage, byModel) {
      const day = emptyDay();
      mergeBucket(day.peak, usage.byPeriod.peak);
      mergeBucket(day.offPeak, usage.byPeriod.offPeak);
      if (byModel !== void 0) {
        for (const [model, snap] of Object.entries(byModel)) {
          day.byModel[model] = {
            peak: { ...snap.byPeriod.peak },
            offPeak: { ...snap.byPeriod.offPeak }
          };
        }
      }
      days.set(dayKey, day);
    },

    /**
     * Current snapshot for one day, or null when the ledger has no data for it.
     * @param {string} dayKey - YYYY-MM-DD
     * @returns {ReturnType<typeof import("./usage.js").aggregateEvents> & { byModel: Record<string, ReturnType<typeof import("./usage.js").aggregateEvents>> } | null}
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
     * @returns {{ version: number, days: Record<string, DayEntry> }}
     */
    serialize() {
      /** @type {Record<string, DayEntry>} */
      const out = {};
      for (const [dayKey, day] of days) {
        out[dayKey] = {
          peak: { ...day.peak },
          offPeak: { ...day.offPeak },
          byModel: Object.fromEntries(Object.entries(day.byModel).map(([m, e]) => [m, { peak: { ...e.peak }, offPeak: { ...e.offPeak } }]))
        };
      }
      return { version: 2, days: out };
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
        const src = /** @type {{ peak?: unknown, offPeak?: unknown, byModel?: unknown }} */ (value);
        if (src == null || typeof src !== "object") continue;
        const bucket = (v) => {
          const b = emptyBucket();
          if (v == null || typeof v !== "object") return b;
          const o = /** @type {Record<string, unknown>} */ (v);
          const num = (k) => (typeof o[k] === "number" && Number.isFinite(o[k]) ? Number(o[k]) : 0);
          b.inputTokens = num("inputTokens");
          b.outputTokens = num("outputTokens");
          b.cacheReadTokens = num("cacheReadTokens");
          b.cacheWriteTokens = num("cacheWriteTokens");
          b.reasoningTokens = num("reasoningTokens");
          b.requests = num("requests");
          return b;
        };
        const day = { peak: bucket(src.peak), offPeak: bucket(src.offPeak), byModel: {} };
        if (src.byModel != null && typeof src.byModel === "object") {
          for (const [model, m] of Object.entries(src.byModel)) {
            const e = /** @type {{ peak?: unknown, offPeak?: unknown }} */ (m);
            if (e == null || typeof e !== "object") continue;
            day.byModel[model] = { peak: bucket(e.peak), offPeak: bucket(e.offPeak) };
          }
        }
        days.set(dayKey, day);
      }
    }
  };
}
