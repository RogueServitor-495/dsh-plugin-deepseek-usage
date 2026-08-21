// Kimi For Coding (api.kimi.com/coding) provider adapter for
// dsh-plugin-deepseek-usage.
//
// Surface (auth = Bearer, either the KIMI_CODING_API_KEY api key or an OAuth
// access token):
//   Plan quota:  GET /coding/v1/usages
//     - limits[]: sliding-window quotas; the 5-hour window is
//       window.duration=300 / timeUnit=TIME_UNIT_MINUTE, with
//       detail.{limit,used,remaining,resetTime}
//     - usage:   the weekly quota {limit,used,remaining,resetTime}
//       (absent on legacy plans — old subscriptions have no weekly window)
//     - user.membership.level: plan tier (LEVEL_BASIC / LEVEL_PRO / ...)
// Endpoint shape verified live against api.kimi.com (2026-08).
// Pure module, unit-testable.
// @ts-check

/** Kimi coding host (no trailing slash). */
export const KIMI_HOST = "https://api.kimi.com/coding";

/** Quota endpoint path. */
export const KIMI_USAGE_PATH = "/v1/usages";

/** Default timeout for provider HTTP calls (ms). */
export const KIMI_TIMEOUT_MS = 10_000;

/**
 * Fetch JSON with a timeout; throws Error with .status on non-2xx.
 * @param {string} url
 * @param {string} apiKey - Kimi api key or OAuth access token
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<unknown>}
 */
async function getJson(url, apiKey, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? KIMI_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: "Bearer " + apiKey,
        Accept: "application/json",
        "User-Agent": "KimiCLI/1.5"
      },
      signal: controller.signal
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const err = new Error("Kimi endpoint returned HTTP " + res.status);
      err.code = "KIMI_HTTP_ERROR";
      err.status = res.status;
      err.body = body.slice(0, 500);
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** @param {unknown} v @returns {number} */
function numberOr(v, fallback = 0) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/**
 * Parse an ISO-8601 reset timestamp into epoch ms, or undefined.
 * @param {unknown} v
 * @returns {number | undefined}
 */
function resetMs(v) {
  if (typeof v !== "string" || v.length === 0) return void 0;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : void 0;
}

/**
 * Window duration in minutes, tolerating TIME_UNIT_MINUTE / TIME_UNIT_HOUR /
 * TIME_UNIT_SECOND / TIME_UNIT_DAY encodings.
 * @param {unknown} window
 * @returns {number | null}
 */
function windowMinutes(window) {
  if (window == null || typeof window !== "object") return null;
  const w = window;
  const duration = numberOr(w.duration, NaN);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  const unit = typeof w.timeUnit === "string" ? w.timeUnit : "";
  if (unit.includes("HOUR")) return duration * 60;
  if (unit.includes("SECOND")) return duration / 60;
  if (unit.includes("DAY")) return duration * 1440;
  return duration; // default: minutes
}

/**
 * Build normalized quota windows from the raw /v1/usages payload:
 * the 5-hour sliding window (limits[], duration ≈ 300 minutes) and the
 * weekly quota (top-level usage, absent on legacy plans).
 * @param {unknown} raw
 * @returns {Array<{ kind: string, label: string, used: number, limit: number, unit: string, resetsAt?: number }>}
 */
export function buildKimiQuotaWindows(raw) {
  const root = raw && typeof raw === "object" ? raw : {};
  const windows = [];
  const limits = Array.isArray(root.limits) ? root.limits : [];
  for (const entry of limits) {
    if (entry == null || typeof entry !== "object") continue;
    const minutes = windowMinutes(entry.window);
    const detail = entry.detail && typeof entry.detail === "object" ? entry.detail : {};
    const limit = numberOr(detail.limit, 100);
    const used = numberOr(detail.used, 0);
    const resetsAt = resetMs(detail.resetTime);
    let kind;
    let label;
    if (minutes !== null && Math.round(minutes) === 300) {
      kind = "session";
      label = "5 小时额度";
    } else if (minutes !== null && Math.round(minutes) === 10080) {
      kind = "weekly";
      label = "周额度";
    } else {
      kind = minutes !== null ? "window-" + minutes + "m" : "window";
      label = minutes !== null ? (minutes >= 60 ? (minutes / 60) + " 小时额度" : minutes + " 分钟额度") : "额度";
    }
    windows.push({
      kind,
      label,
      used,
      limit,
      unit: "%",
      ...(resetsAt !== void 0 ? { resetsAt } : {})
    });
  }
  // Weekly quota rides the top-level `usage` object (legacy plans omit it).
  if (!windows.some((w) => w.kind === "weekly") && root.usage != null && typeof root.usage === "object") {
    const u = root.usage;
    const limit = numberOr(u.limit, NaN);
    if (Number.isFinite(limit) && limit > 0) {
      const resetsAt = resetMs(u.resetTime);
      windows.push({
        kind: "weekly",
        label: "周额度",
        used: numberOr(u.used, 0),
        limit,
        unit: "%",
        ...(resetsAt !== void 0 ? { resetsAt } : {})
      });
    }
  }
  return windows;
}

/**
 * Extract the membership tier as a display plan name, e.g. LEVEL_BASIC →
 * "Basic", LEVEL_PRO → "Pro".
 * @param {unknown} raw
 * @returns {string | undefined}
 */
export function parseKimiPlan(raw) {
  const root = raw && typeof raw === "object" ? raw : {};
  const user = root.user && typeof root.user === "object" ? root.user : {};
  const membership = user.membership && typeof user.membership === "object" ? user.membership : {};
  const level = typeof membership.level === "string" ? membership.level : "";
  const m = level.match(/^LEVEL_(.+)$/);
  if (m === null) return void 0;
  const name = m[1].toLowerCase();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Kimi For Coding provider adapter. `fetchUsage` queries the coding-plan
 * quota endpoint; `fetchBalance` returns availability only (the plan is a
 * subscription — there is no cash balance to show).
 * @type {import("./base.js").ProviderAdapter}
 */
export const kimiAdapter = Object.freeze({
  id: "kimi",
  displayName: "Kimi For Coding",

  async fetchBalance() {
    return { currency: "CNY", isAvailable: true };
  },

  async fetchUsage(apiKey, opts = {}) {
    const raw = await getJson(KIMI_HOST + KIMI_USAGE_PATH, apiKey, opts);
    const plan = parseKimiPlan(raw);
    return {
      windows: buildKimiQuotaWindows(raw),
      ...(plan !== void 0 ? { plan: "Kimi " + plan } : {}),
      raw: raw && typeof raw === "object" ? raw : {}
    };
  }
});
