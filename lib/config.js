// Plugin-local configuration for dsh-plugin-deepseek-usage.
//
// The dsh settings seam does not expose third-party namespaces to the web
// Settings page yet (apiproxy allowlist is hardcoded), so the plugin owns
// its configuration: one JSON file under the dsh home, read/written through
// the plugin's own /api/deepseek-usage/config route. Pure module: no harness
// imports, unit-testable in isolation.
// @ts-check

import { DEFAULT_PRICING, PEAK_WINDOWS } from "./usage.js";

/**
 * File name (under the dsh home) holding the plugin configuration.
 */
export const CONFIG_FILE_NAME = "deepseek-usage-config.json";

/**
 * Default refresh interval (ms) for the browser top bar.
 */
export const DEFAULT_REFRESH_INTERVAL_MS = 300_000;

/**
 * Allowed refresh interval choices (ms) surfaced by the config panel.
 */
export const REFRESH_INTERVAL_CHOICES = Object.freeze([
  Object.freeze({ label: "1 分钟", value: 60_000 }),
  Object.freeze({ label: "5 分钟", value: 300_000 }),
  Object.freeze({ label: "10 分钟", value: 600_000 }),
  Object.freeze({ label: "30 分钟", value: 1_800_000 }),
  Object.freeze({ label: "1 小时", value: 3_600_000 })
]);

/** @typedef {{ inputCacheMiss: number, inputCacheHit: number, output: number }} RateTier */
/** @typedef {{ startHour: number, endHour: number }} PeakWindow */
/** @typedef {{ peak: RateTier, offPeak: RateTier }} ModelRates */
/**
 * Per-model pricing: peak/off-peak CNY rates per 1M tokens, keyed by the
 * model id as reported in `request/header` config (e.g. deepseek-v4-flash).
 * @typedef {Record<string, ModelRates>} ModelRatesMap
 */

/**
 * The plugin configuration document.
 * @typedef {{
 *   currency: string,
 *   models: ModelRatesMap,
 *   usdCny: number,
 *   peakWindows: PeakWindow[],
 *   refreshIntervalMs: number
 * }} PluginConfig
 */

/**
 * Default per-model pricing (CNY per 1M tokens), per the peak/off-peak policy
 * effective 2026-08-17. Extend with more model ids as needed.
 * @returns {ModelRatesMap}
 */
export function defaultModels() {
  return {
    "deepseek-v4-flash": {
      peak: { ...DEFAULT_PRICING.peak },
      offPeak: { ...DEFAULT_PRICING.offPeak }
    },
    "deepseek-v4-pro": {
      // V4-Pro: peak 0.30 / 9.00 / 27.00, offPeak 0.15 / 4.50 / 13.50
      peak: { inputCacheMiss: 9.0, inputCacheHit: 0.3, output: 27.0 },
      offPeak: { inputCacheMiss: 4.5, inputCacheHit: 0.15, output: 13.5 }
    }
  };
}

/** @returns {PluginConfig} */
export function defaultConfig() {
  return {
    currency: DEFAULT_PRICING.currency,
    models: defaultModels(),
    usdCny: DEFAULT_PRICING.usdCny,
    peakWindows: PEAK_WINDOWS.map((w) => ({ ...w })),
    refreshIntervalMs: DEFAULT_REFRESH_INTERVAL_MS
  };
}

/** @param {unknown} v @returns {number} */
function num(v) {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
}

/** @param {unknown} tier @param {RateTier} fallback @returns {RateTier} */
function mergeRate(tier, fallback) {
  const t = tier && typeof tier === "object" ? tier : {};
  return {
    inputCacheMiss: typeof t.inputCacheMiss === "number" && t.inputCacheMiss >= 0 ? t.inputCacheMiss : fallback.inputCacheMiss,
    inputCacheHit: typeof t.inputCacheHit === "number" && t.inputCacheHit >= 0 ? t.inputCacheHit : fallback.inputCacheHit,
    output: typeof t.output === "number" && t.output >= 0 ? t.output : fallback.output
  };
}

/** @param {unknown} m @returns {ModelRates | null} */
function mergeModelRates(m) {
  if (m == null || typeof m !== "object") return null;
  const fallback = { peak: DEFAULT_PRICING.peak, offPeak: DEFAULT_PRICING.offPeak };
  const peak = mergeRate(m.peak, fallback.peak);
  const offPeak = mergeRate(m.offPeak, fallback.offPeak);
  return { peak, offPeak };
}

/** @param {unknown} w @returns {PeakWindow | null} */
function mergeWindow(w) {
  if (w == null || typeof w !== "object") return null;
  const startHour = typeof w.startHour === "number" && Number.isInteger(w.startHour) && w.startHour >= 0 && w.startHour <= 23 ? w.startHour : -1;
  const endHour = typeof w.endHour === "number" && Number.isInteger(w.endHour) && w.endHour >= 1 && w.endHour <= 24 ? w.endHour : -1;
  if (startHour < 0 || endHour < 0 || endHour <= startHour) return null;
  return { startHour, endHour };
}

/**
 * Validate and normalize raw (user-supplied) config into a complete document.
 * Unknown fields are dropped; missing/invalid fields fall back to defaults.
 * `models` is a map of model id -> { peak, offPeak }; any number of models is
 * allowed and `peakWindows` may hold zero or more windows.
 * @param {unknown} raw - parsed JSON from the client or config file
 * @returns {PluginConfig}
 */
export function normalizeConfig(raw) {
  const fallback = defaultConfig();
  const r = raw && typeof raw === "object" ? raw : {};

  // models: keep every well-formed entry; when none provided use defaults
  let models = fallback.models;
  if (r.models != null && typeof r.models === "object" && !Array.isArray(r.models)) {
    const merged = {};
    for (const [id, m] of Object.entries(r.models)) {
      const rates = mergeModelRates(m);
      if (rates !== null && id.length > 0) merged[id] = rates;
    }
    if (Object.keys(merged).length > 0) models = merged;
  }

  const windows = Array.isArray(r.peakWindows)
    ? r.peakWindows.map(mergeWindow).filter((w) => w !== null)
    : [];
  const refresh = typeof r.refreshIntervalMs === "number" && Number.isFinite(r.refreshIntervalMs) && r.refreshIntervalMs >= 5_000
    ? Math.round(r.refreshIntervalMs)
    : fallback.refreshIntervalMs;

  return {
    currency: typeof r.currency === "string" && r.currency.length > 0 ? r.currency : fallback.currency,
    models,
    usdCny: typeof r.usdCny === "number" && r.usdCny > 0 ? r.usdCny : fallback.usdCny,
    peakWindows: windows.length > 0 ? windows : fallback.peakWindows,
    refreshIntervalMs: refresh
  };
}

/**
 * Look up rates for a model id, falling back to the first configured model,
 * then to defaults, so unknown models never price at zero.
 * @param {PluginConfig} config
 * @param {string} [modelId]
 * @returns {ModelRates}
 */
export function ratesForModel(config, modelId) {
  if (modelId !== void 0 && Object.prototype.hasOwnProperty.call(config.models, modelId)) {
    return config.models[modelId];
  }
  const ids = Object.keys(config.models);
  if (ids.length > 0) return config.models[ids[0]];
  const d = defaultModels();
  return d["deepseek-v4-flash"] ?? Object.values(d)[0];
}

/**
 * Load configuration from a JSON file. Missing/corrupt files yield defaults.
 * @param {string} filePath
 * @returns {Promise<PluginConfig>}
 */
export async function loadConfigFile(filePath) {
  try {
    const fs = await import("node:fs/promises");
    const text = await fs.readFile(filePath, "utf8");
    return normalizeConfig(JSON.parse(text));
  } catch {
    return defaultConfig();
  }
}

/**
 * Persist configuration atomically (write tmp + rename).
 * @param {string} filePath
 * @param {PluginConfig} config
 * @returns {Promise<void>}
 */
export async function saveConfigFile(filePath, config) {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const payload = JSON.stringify(normalizeConfig(config), null, 2);
  const tmp = `${filePath}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(tmp, payload, "utf8");
  await fs.rename(tmp, filePath);
}
