// Provider adapter vocabulary for dsh-plugin-deepseek-usage.
//
// Different LLM providers expose different account/usage surfaces:
//   - DeepSeek: official public balance endpoint only (GET /user/balance).
//   - Zhipu (bigmodel.cn): Coding Plan quota (5h/week/month limits, plan
//     version) via biz/monitor endpoints, plus standard API cash balance
//     and token resource packages.
// This module defines the shared shapes each adapter produces so the web
// API and the top bar can render provider-agnostic data.
// @ts-check

/**
 * One quota/limit window surfaced by a provider (e.g. a 5-hour session,
 * a weekly window, or a monthly allowance). used/limit are in the
 * provider unit (percentage for Zhipu plan, tokens for DeepSeek).
 * @typedef {{
 *   kind: string,
 *   label: string,
 *   used: number,
 *   limit: number,
 *   unit: string,
 *   resetsAt?: number
 * }} QuotaWindow
 */

/**
 * Normalized balance/account snapshot for one provider.
 * @typedef {{
 *   currency?: string,
 *   isAvailable: boolean,
 *   totalBalance?: string,
 *   grantedBalance?: string,
 *   toppedUpBalance?: string,
 *   availableBalance?: string,
 *   resourcePackages?: Array<{ name: string, balance: string, suitableModel?: string }>,
 *   plan?: string,
 *   planVersion?: string,
 *   renewsAt?: string
 * }} ProviderBalance
 */

/**
 * Normalized usage/quotas for one provider.
 * @typedef {{
 *   windows: QuotaWindow[],
 *   raw?: object
 * }} ProviderUsage
 */

/**
 * A provider adapter. Implementations own HTTP transport, auth, and the
 * normalization from provider JSON into ProviderBalance and ProviderUsage.
 * Pure modules: no harness imports, unit-testable.
 * @typedef {{
 *   id: string,
 *   displayName: string,
 *   fetchBalance(apiKey: string, opts?: { timeoutMs?: number }): Promise<ProviderBalance>,
 *   fetchUsage(apiKey: string, opts?: { timeoutMs?: number }): Promise<ProviderUsage>
 * }} ProviderAdapter
 */

export {};
