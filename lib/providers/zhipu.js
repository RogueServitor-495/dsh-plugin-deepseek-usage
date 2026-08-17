// Zhipu (bigmodel.cn) provider adapter for dsh-plugin-deepseek-usage.
//
// Surfaces (China station, auth = RAW api key, no Bearer prefix):
//   Coding Plan quota:  GET /api/monitor/usage/quota/limit
//   Plan subscription:  GET /api/biz/subscription/list
//   Cash account:       GET /api/biz/account/query-customer-account-report
//   Token packages:     GET /api/biz/tokenAccounts/list/my
// Endpoint shapes verified against the glm-for-copilot open-source client
// and the official docs at docs.bigmodel.cn. Pure module, unit-testable.
// @ts-check

/** China station host. */
export const ZHIPU_HOST = "https://open.bigmodel.cn";

/** Coding Plan usage paths (same shape as z.ai international). */
export const ZHIPU_USAGE_PATHS = Object.freeze({
  subscription: "/api/biz/subscription/list",
  quota: "/api/monitor/usage/quota/limit"
});

/** Standard API balance paths. */
export const ZHIPU_BALANCE_PATHS = Object.freeze({
  accountReport: "/api/biz/account/query-customer-account-report",
  tokenAccounts: "/api/biz/tokenAccounts/list/my"
});

/**
 * Default timeout for provider HTTP calls (ms).
 */
export const ZHIPU_TIMEOUT_MS = 10_000;

/**
 * Fetch JSON with a timeout; throws Error with .status on non-2xx.
 * @param {string} url
 * @param {string} apiKey - raw Zhipu api key (id.secret)
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<unknown>}
 */
async function getJson(url, apiKey, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? ZHIPU_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: apiKey, // bigmodel.cn uses the RAW key
        Accept: "application/json"
      },
      signal: controller.signal
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const err = new Error(`Zhipu endpoint returned HTTP ${res.status}`);
      err.code = "ZHIPU_HTTP_ERROR";
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
 * Extract the limits array from a quota response, tolerating both
 * { data: { limits: [...] } } and { data: [...] } and bare arrays.
 * @param {unknown} raw
 * @returns {Array<Record<string, unknown>>}
 */
function extractLimits(raw) {
  const root = raw && typeof raw === "object" ? raw : {};
  const data = root.data ?? root;
  if (Array.isArray(data)) return data;
  const limits = data && typeof data === "object" ? data.limits : void 0;
  return Array.isArray(limits) ? limits : [];
}

/**
 * Find a limit entry by type/name, optionally filtered by unit. Ported from
 * the glm-for-copilot client semantics.
 * @param {Array<Record<string, unknown>>} limits
 * @param {string} type
 * @param {number} [unit]
 * @returns {Record<string, unknown> | null}
 */
function findLimit(limits, type, unit) {
  let fallback = null;
  for (const item of limits) {
    if (item.type === type || item.name === type) {
      if (unit === void 0) return item;
      if (item.unit === unit) return item;
      if (fallback === null && item.unit === void 0) fallback = item;
    }
  }
  return fallback;
}

/**
 * Epoch-ms of the next UTC midnight on the 1st of the month.
 * @param {Date} [now]
 * @returns {number}
 */
function nextUtcFirstOfMonthMs(now = new Date()) {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
}

/**
 * Build normalized quota windows from raw limits: 5h session (TOKENS_LIMIT
 * unit 3), weekly (TOKENS_LIMIT unit 6), and monthly/web-search (TIME_LIMIT).
 * @param {Array<Record<string, unknown>>} limits
 * @returns {Array<{ kind: string, label: string, used: number, limit: number, unit: string, resetsAt?: number }>}
 */
export function buildQuotaWindows(limits) {
  const windows = [];
  const session = findLimit(limits, "TOKENS_LIMIT", 3);
  if (session) {
    windows.push({
      kind: "session",
      label: "5 小时额度",
      used: numberOr(session.percentage),
      limit: 100,
      unit: "%",
      ...(typeof session.nextResetTime === "number" ? { resetsAt: session.nextResetTime } : {})
    });
  }
  const weekly = findLimit(limits, "TOKENS_LIMIT", 6);
  if (weekly) {
    windows.push({
      kind: "weekly",
      label: "周额度",
      used: numberOr(weekly.percentage),
      limit: 100,
      unit: "%",
      ...(typeof weekly.nextResetTime === "number" ? { resetsAt: weekly.nextResetTime } : {})
    });
  }
  const time = findLimit(limits, "TIME_LIMIT");
  if (time) {
    windows.push({
      kind: "monthly",
      label: "月额度",
      used: numberOr(time.currentValue),
      limit: numberOr(time.usage),
      unit: "次",
      resetsAt: typeof time.nextResetTime === "number" ? time.nextResetTime : nextUtcFirstOfMonthMs()
    });
  }
  return windows;
}

/**
 * Normalize a raw subscription list into plan metadata. `productName` carries
 * the plan tier (Lite/Pro/Max) and, for legacy plans, a version marker such as
 * "历史版本 V1" / "历史版本 V2" — surfaced as planVersion.
 * @param {unknown} raw
 * @returns {{ plan?: string, planVersion?: string, renewsAt?: string }}
 */
export function parseSubscription(raw) {
  const root = raw && typeof raw === "object" ? raw : {};
  const data = Array.isArray(root.data) ? root.data : [];
  const first = data[0] && typeof data[0] === "object" ? data[0] : {};
  const productName = typeof first.productName === "string" ? first.productName : void 0;
  if (productName === void 0) return {};
  let plan = productName;
  let planVersion = void 0;
  const strip = (marker) => productName
    .replace(new RegExp(`历史版本\\s*${marker}`, "i"), "")
    .replace(/^[\s·•|\-]+/, "")
    .trim();
  if (/历史版本\s*V1/i.test(productName)) { planVersion = "V1"; plan = strip("V1"); }
  else if (/历史版本\s*V2/i.test(productName)) { planVersion = "V2"; plan = strip("V2"); }
  return {
    plan: plan.length > 0 ? plan : void 0,
    ...(planVersion !== void 0 ? { planVersion } : {}),
    ...(typeof first.nextRenewTime === "string" ? { renewsAt: first.nextRenewTime } : {})
  };
}

/**
 * Normalize the account report JSON into a cash balance snapshot.
 * @param {unknown} raw
 * @returns {{ availableBalance?: string, totalRecharged?: string, totalSpent?: string, giftedAmount?: string, frozenAmount?: string }}
 */
export function parseAccountReport(raw) {
  const root = raw && typeof raw === "object" ? raw : {};
  const data = root.data && typeof root.data === "object" ? root.data : {};
  return {
    ...(data.availableBalance !== void 0 ? { availableBalance: String(data.availableBalance) } : {}),
    ...(data.rechargeAmount !== void 0 ? { totalRecharged: String(data.rechargeAmount) } : {}),
    ...(data.totalSpendAmount !== void 0 ? { totalSpent: String(data.totalSpendAmount) } : {}),
    ...(data.giveAmount !== void 0 ? { giftedAmount: String(data.giveAmount) } : {}),
    ...(data.frozenBalance !== void 0 ? { frozenAmount: String(data.frozenBalance) } : {})
  };
}

/**
 * Normalize token resource-package rows.
 * @param {unknown} raw
 * @returns {Array<{ name: string, balance: string, suitableModel?: string }>}
 */
export function parseTokenAccounts(raw) {
  const root = raw && typeof raw === "object" ? raw : {};
  const rows = Array.isArray(root.rows) ? root.rows : (Array.isArray(root.data) ? root.data : []);
  return rows
    .filter((r) => r && typeof r === "object")
    .map((r) => ({
      name: typeof r.resourcePackageName === "string" ? r.resourcePackageName : "资源包",
      balance: r.tokenBalance !== void 0 ? String(r.tokenBalance) : "0",
      ...(typeof r.suitableModel === "string" ? { suitableModel: r.suitableModel } : {})
    }));
}

/**
 * Zhipu provider adapter. `fetchBalance` queries the standard API account;
 * `fetchUsage` queries Coding Plan quota + subscription (plan + version).
 * @type {import("./base.js").ProviderAdapter}
 */
export const zhipuAdapter = Object.freeze({
  id: "zhipu",
  displayName: "智谱 (bigmodel.cn)",

  async fetchBalance(apiKey, opts = {}) {
    const [accountResult, packagesResult] = await Promise.allSettled([
      getJson(ZHIPU_HOST + ZHIPU_BALANCE_PATHS.accountReport, apiKey, opts),
      getJson(ZHIPU_HOST + ZHIPU_BALANCE_PATHS.tokenAccounts, apiKey, opts)
    ]);
    const account = accountResult.status === "fulfilled" ? parseAccountReport(accountResult.value) : {};
    const packages = packagesResult.status === "fulfilled" ? parseTokenAccounts(packagesResult.value) : [];
    const available = account.availableBalance !== void 0 ? Number(account.availableBalance) : NaN;
    return {
      currency: "CNY",
      isAvailable: accountResult.status === "fulfilled" && Number.isFinite(available),
      ...(account.availableBalance !== void 0 ? { availableBalance: account.availableBalance } : {}),
      ...(account.totalRecharged !== void 0 ? { toppedUpBalance: account.totalRecharged } : {}),
      ...(account.giftedAmount !== void 0 ? { grantedBalance: account.giftedAmount } : {}),
      ...(account.totalSpent !== void 0 ? { totalBalance: account.availableBalance ?? account.totalRecharged } : {}),
      ...(packages.length > 0 ? { resourcePackages: packages } : {})
    };
  },

  async fetchUsage(apiKey, opts = {}) {
    const [quotaResult, subscriptionResult] = await Promise.allSettled([
      getJson(ZHIPU_HOST + ZHIPU_USAGE_PATHS.quota, apiKey, opts),
      getJson(ZHIPU_HOST + ZHIPU_USAGE_PATHS.subscription, apiKey, opts)
    ]);
    const windows = quotaResult.status === "fulfilled" ? buildQuotaWindows(extractLimits(quotaResult.value)) : [];
    const sub = subscriptionResult.status === "fulfilled" ? parseSubscription(subscriptionResult.value) : {};
    return {
      windows,
      ...(sub.plan !== void 0 || sub.planVersion !== void 0 ? { plan: sub.plan, planVersion: sub.planVersion, renewsAt: sub.renewsAt } : {})
    };
  }
});

export { getJson };
