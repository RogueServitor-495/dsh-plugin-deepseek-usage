// DeepSeek provider adapter for dsh-plugin-deepseek-usage.
// Uses the official public balance endpoint: GET https://api.deepseek.com/user/balance
// Pure module, unit-testable.
// @ts-check

/** @type {string} */
export const DEEPSEEK_BALANCE_ENDPOINT = "https://api.deepseek.com/user/balance";

/**
 * DeepSeek provider adapter. `fetchBalance` hits the official public balance
 * endpoint; `fetchUsage` returns empty windows (DeepSeek exposes no quota
 * API — usage is derived from session events on the plugin side).
 * @type {import("./base.js").ProviderAdapter}
 */
export const deepseekAdapter = Object.freeze({
  id: "deepseek",
  displayName: "DeepSeek",

  async fetchBalance(apiKey, opts = {}) {
    const timeoutMs = opts.timeoutMs ?? 10_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(DEEPSEEK_BALANCE_ENDPOINT, {
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
      const rec = raw && typeof raw === "object" ? raw : {};
      const infos = Array.isArray(rec.balance_infos) ? rec.balance_infos : [];
      const first = infos[0] && typeof infos[0] === "object" ? infos[0] : {};
      const currency = String(first.currency ?? "CNY");
      const total = String(first.total_balance ?? "0");
      return {
        currency,
        isAvailable: rec.is_available === true,
        totalBalance: total,
        grantedBalance: String(first.granted_balance ?? "0"),
        toppedUpBalance: String(first.topped_up_balance ?? "0")
      };
    } finally {
      clearTimeout(timer);
    }
  },

  async fetchUsage() {
    // DeepSeek has no public quota API; usage comes from session events.
    return { windows: [] };
  }
});
