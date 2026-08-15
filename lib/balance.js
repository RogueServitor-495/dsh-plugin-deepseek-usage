// DeepSeek user balance fetcher for dsh-plugin-deepseek-usage.
// Uses the official public endpoint: GET https://api.deepseek.com/user/balance
// @ts-check

/** @type {string} */
export const BALANCE_ENDPOINT = "https://api.deepseek.com/user/balance";

/** @type {{ value: object | null, at: number } | null} */
let cache = null;

/** In-memory cache TTL in ms (the balance endpoint is rate-limited). */
const CACHE_TTL_MS = 60_000;

/**
 * Fetch the current balance for an API key, with a short in-process cache.
 * @param {string} apiKey - DeepSeek API key (sk-...)
 * @param {{ timeoutMs?: number, now?: number }} [opts]
 * @returns {Promise<{ isAvailable: boolean, balanceInfos: Array<{ currency: string, totalBalance: string, grantedBalance: string, toppedUpBalance: string }> }>}
 */
export async function fetchBalance(apiKey, opts = {}) {
  const now = opts.now ?? Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.value;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(BALANCE_ENDPOINT, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json"
      },
      signal: controller.signal
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const err = new Error(`DeepSeek balance endpoint returned HTTP ${res.status}`);
      err.code = "BALANCE_HTTP_ERROR";
      err.status = res.status;
      err.body = body.slice(0, 500);
      throw err;
    }
    const raw = await res.json();
    const value = normalizeBalance(raw);
    cache = { value, at: Date.now() };
    return value;
  } finally {
    clearTimeout(timer);
  }
}

/** @param {unknown} raw - raw API response */
function normalizeBalance(raw) {
  const rec = raw && typeof raw === "object" ? raw : {};
  const isAvailable = rec.is_available === true;
  const infos = Array.isArray(rec.balance_infos) ? rec.balance_infos : [];
  return {
    isAvailable,
    balanceInfos: infos.map((info) => ({
      currency: String(info?.currency ?? "CNY"),
      totalBalance: String(info?.total_balance ?? "0"),
      grantedBalance: String(info?.granted_balance ?? "0"),
      toppedUpBalance: String(info?.topped_up_balance ?? "0")
    }))
  };
}

/** Drop the balance cache (used in tests). */
export function clearBalanceCache() {
  cache = null;
}
