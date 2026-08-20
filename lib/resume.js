// dsh-plugin-deepseek-usage — quota-exhaustion auto-resume (host half).
//
// Watches live agents for model-request failures classified as QUOTA
// (exhausted quota / balance). When one is observed it records a durable
// pending-resume entry (one JSON file under the dsh home) and arms a timer
// for the next quota reset (read from the provider's quota API when
// available; otherwise a configurable fallback delay). When the timer fires
// — or, after a restart, when a pending record's reset time has passed —
// it wakes the agent with a follow-up message asking it to continue the
// interrupted task.
//
// The agent loop is untouched: this module only listens to the public
// `agent/request-error` waterfall and drives the public `Agent` API
// (`followup` / `status`), the same delivery primitives the official
// `@deepseek-ai/dsh-schedule` plugin uses. No core package is modified.
//
// Provider coupling is injected by the caller (`lib/index.js`): this module
// never imports an adapter, so it works for every provider the usage plugin
// knows about (DeepSeek, Zhipu, Kimi) and degrades to a plain delay when no
// quota reset time is available.
// @ts-check

import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** File name (under the dsh home) holding pending-resume records. */
export const RESUME_FILE_NAME = "deepseek-usage-resume.json";

/**
 * Provider/services injected by the hosting plugin (`lib/index.js`).
 * `mapProvider` maps a failed request's route provider id to a billing
 * provider (deepseek/zhipu/kimi); `fetchQuotaWindows` returns the provider's
 * normalized quota windows, each optionally carrying `resetsAt`.
 * @typedef {{
 *   getConfig: () => { resume: { enabled: boolean, maxAttempts: number, defaultRetryDelayMs: number } },
 *   mapProvider: (providerHint: string) => string | null,
 *   resolveApiKey: (providerId: string) => Promise<string | null>,
 *   fetchQuotaWindows: (providerId: string, key: string) => Promise<Array<{ used?: unknown, limit?: unknown, resetsAt?: unknown }> | null>
 * }} ResumeDeps
 */

/** Durable record format version this module writes. */
const RESUME_STORE_VERSION = 1;

/** Node `setTimeout` upper bound (~24.8 days); longer waits are split. */
const MAX_TIMER_DELAY_MS = 2_147_483_647;

/** Never fire sooner than this after detection (ms). */
const MIN_DELAY_MS = 10_000;

/** Store flush throttle (ms). A crash loses at most this much tail. */
const STORE_FLUSH_INTERVAL_MS = 2_000;

/** Recheck spacing while the agent is not live (ms). */
const AGENT_GONE_RECHECK_MS = 5 * 60_000;

/** Recheck cap while the agent is not live; afterwards the record sleeps
 *  until a restart scan or the session is reopened. */
const AGENT_GONE_RECHECK_LIMIT = 12;

/** Deferral spacing while the agent is busy running (ms). */
const BUSY_DEFER_MS = 2 * 60_000;

/** Deferral cap while the agent is busy; afterwards the record is dropped
 *  (the user is actively using the session — do not inject). */
const BUSY_DEFER_LIMIT = 30;

/** Quota-recheck spacing at fire time when quota is still exhausted (ms). */
const QUOTA_RECHECK_MS = 10 * 60_000;

/** Quota-recheck cap; afterwards the record is marked failed. */
const QUOTA_RECHECK_LIMIT = 24;

/** Startup-fire delay (ms): let freshly created agents settle before waking. */
const FIRE_STARTUP_DELAY_MS = 5_000;

/** Cap for the last-user-message excerpt embedded in the resume prompt. */
const TASK_EXCERPT_MAX_CHARS = 400;

/**
 * One durable pending-resume record, keyed by session id.
 * @typedef {{
 *   sessionId: string,
 *   provider: string | null,
 *   interruptedAt: number,
 *   resumesAt: number,
 *   attempts: number,
 *   maxAttempts: number,
 *   rechecks: number,
 *   status: "pending" | "done" | "failed",
 *   lastError?: string
 * }} ResumeRecord
 */

/** @type {Map<string, ResumeRecord>} */
const records = new Map();
/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const timers = new Map();
/** @type {string | null} */
let storePath = null;
/** @type {boolean} */
let storeDirty = false;
/** @type {ReturnType<typeof setTimeout> | null} */
let flushTimer = null;
/** @type {boolean} */
let disposed = false;

/**
 * Load the resume store from disk. Missing or corrupt files yield an empty
 * store (records are advisory; losing them only means no auto-resume).
 * @returns {Promise<void>}
 */
async function loadStore() {
  if (storePath === null) return;
  try {
    const text = await readFile(storePath, "utf8");
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && parsed.version === RESUME_STORE_VERSION && Array.isArray(parsed.records)) {
      for (const raw of parsed.records) {
        if (raw == null || typeof raw !== "object") continue;
        const sessionId = typeof raw.sessionId === "string" && raw.sessionId.length > 0 ? raw.sessionId : null;
        if (sessionId === null) continue;
        const record = {
          sessionId,
          provider: typeof raw.provider === "string" && raw.provider.length > 0 ? raw.provider : null,
          interruptedAt: typeof raw.interruptedAt === "number" ? raw.interruptedAt : 0,
          resumesAt: typeof raw.resumesAt === "number" ? raw.resumesAt : Date.now(),
          attempts: typeof raw.attempts === "number" ? raw.attempts : 0,
          maxAttempts: typeof raw.maxAttempts === "number" && raw.maxAttempts >= 1 ? raw.maxAttempts : 2,
          rechecks: typeof raw.rechecks === "number" ? raw.rechecks : 0,
          status: raw.status === "done" || raw.status === "failed" ? raw.status : "pending",
          ...(typeof raw.lastError === "string" ? { lastError: raw.lastError } : {})
        };
        records.set(sessionId, record);
      }
    }
  } catch {
    records.clear();
  }
}

/**
 * Persist the resume store to disk (atomic rename). No-op when nothing
 * changed or the path is not ready yet.
 * @returns {Promise<void>}
 */
async function saveStore() {
  if (storePath === null || !storeDirty) return;
  storeDirty = false;
  const payload = JSON.stringify({ version: RESUME_STORE_VERSION, records: [...records.values()] }, null, 2);
  const tmp = `${storePath}.tmp`;
  try {
    await mkdir(dirname(storePath), { recursive: true });
    await writeFile(tmp, payload, "utf8");
    await rename(tmp, storePath);
  } catch {
    // A transient write failure must not lose the intent; retry next tick.
    storeDirty = true;
  }
}

/** @param {ResumeRecord} record */
function markDirty(record) {
  records.set(record.sessionId, record);
  storeDirty = true;
  void saveStore();
}

/** @param {string} sessionId */
function recordFor(sessionId) {
  return records.get(sessionId);
}

/** Cancel the armed timer for a record, if any. @param {string} sessionId */
function clearTimer(sessionId) {
  const timer = timers.get(sessionId);
  if (timer !== void 0) {
    clearTimeout(timer);
    timers.delete(sessionId);
  }
}

/**
 * Arm one bounded timer segment for a record; every wake rechecks the wall
 * clock, so a forward clock jump just makes the record overdue.
 * @param {ResumeRecord} record
 * @param {(record: ResumeRecord) => void} onFire
 */
function arm(record, onFire) {
  clearTimer(record.sessionId);
  const now = Date.now();
  const delay = Math.min(Math.max(record.resumesAt - now, 1_000), MAX_TIMER_DELAY_MS);
  timers.set(record.sessionId, setTimeout(() => {
    timers.delete(record.sessionId);
    if (!disposed) onFire(record);
  }, delay));
}

/**
 * Best-effort excerpt of the last accepted user message text in the session
 * log, so the resume prompt names what the interrupted task was about.
 * @param {import("@deepseek-ai/dsh-agent").Agent} agent
 * @returns {string}
 */
function lastUserTaskExcerpt(agent) {
  const events = agent.session?.events ?? [];
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event == null || event.type !== "user/message") continue;
    const message = event.data;
    const blocks = message && typeof message === "object" && Array.isArray(message.content) ? message.content : [];
    const text = blocks
      .filter((block) => block && block.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join("\n")
      .trim();
    if (text.length > 0) {
      return text.length > TASK_EXCERPT_MAX_CHARS ? `${text.slice(0, TASK_EXCERPT_MAX_CHARS)}…` : text;
    }
  }
  return "";
}

/**
 * Build the follow-up user message that resumes an interrupted task.
 * @param {import("@deepseek-ai/dsh-agent").Agent} agent
 * @param {ResumeRecord} record
 * @returns {import("@deepseek-ai/dsh-llm").UserMessage}
 */
function buildContinuationMessage(agent, record) {
  const interruptedAt = new Date(record.interruptedAt).toISOString();
  const taskExcerpt = lastUserTaskExcerpt(agent);
  const lines = [
    "[额度重置 · 自动续跑]",
    "",
    `上一轮任务因 API 额度耗尽（QUOTA）于 ${interruptedAt} 中断，额度现已重置。请继续完成被中断的任务：`,
    "",
    "1. 先根据当前会话历史与工作区现状判断上次进行到哪一步；",
    "2. 若进度不清楚，先检查工作区改动与最近的工具结果，再决定从何处继续；",
    "3. 完成目标：" + (taskExcerpt.length > 0 ? taskExcerpt : "（未能提取最近任务描述，请以会话历史为准）"),
    "",
    "请把任务继续做到完成；如再次遇到额度耗尽，请直接说明而不是反复重试。"
  ];
  return createUserMessage({
    content: [{ type: "text", text: lines.join("\n") }],
    source: { kind: "plugin", plugin: "deepseek-usage" }
  });
}

/**
 * Best-effort quota availability check: true when the provider reports no
 * exhausted quota window (or when no provider info is available).
 * @param {ResumeDeps} deps
 * @param {ResumeRecord} record
 * @returns {Promise<boolean>}
 */
async function quotaAvailable(deps, record) {
  if (record.provider === null) return true;
  const key = await deps.resolveApiKey(record.provider);
  if (key === null) return true;
  const windows = await deps.fetchQuotaWindows(record.provider, key);
  if (windows === null || windows.length === 0) return true;
  const exhausted = windows.filter((w) => {
    const used = w.used;
    const limit = w.limit;
    return typeof used === "number" && typeof limit === "number" && limit > 0 && used >= limit;
  });
  return exhausted.length === 0;
}

/**
 * The agent is no longer live (session closed / disposed). Recheck a few
 * times in case the session is reopened, then leave the record dormant for
 * the next startup scan or `agent/created` catch-up.
 * @param {import("@deepseek-ai/cordis").Context} ctx
 * @param {ResumeDeps} deps
 * @param {ResumeRecord} record
 */
function recheckGone(ctx, deps, record) {
  if (record.status !== "pending") return;
  record.rechecks += 1;
  if (record.rechecks > AGENT_GONE_RECHECK_LIMIT) {
    record.lastError = "agent not live; record dormant until session reopens";
    markDirty(record);
    ctx.logger.info(`deepseek-usage: quota-resume for session "${record.sessionId}" sleeping (agent not live)`);
    return;
  }
  record.resumesAt = Date.now() + AGENT_GONE_RECHECK_MS;
  markDirty(record);
  arm(record, (r) => void fire(ctx, deps, r));
}

/**
 * The agent is live but busy running (e.g. the user is chatting). Defer a
 * bounded number of times, then drop the record rather than interrupt.
 * @param {import("@deepseek-ai/cordis").Context} ctx
 * @param {ResumeDeps} deps
 * @param {ResumeRecord} record
 */
function deferBusy(ctx, deps, record) {
  if (record.status !== "pending") return;
  record.rechecks += 1;
  if (record.rechecks > BUSY_DEFER_LIMIT) {
    record.status = "failed";
    record.lastError = "agent busy; auto-resume dropped";
    markDirty(record);
    ctx.logger.info(`deepseek-usage: quota-resume for session "${record.sessionId}" dropped (agent busy)`);
    return;
  }
  record.resumesAt = Date.now() + BUSY_DEFER_MS;
  markDirty(record);
  arm(record, (r) => void fire(ctx, deps, r));
}

/**
 * Fire a record: locate the agent, decide whether to resume now, defer, or
 * sleep. Never throws into the caller.
 * @param {import("@deepseek-ai/cordis").Context} ctx
 * @param {ResumeDeps} deps
 * @param {ResumeRecord} record
 */
async function fire(ctx, deps, record) {
  if (disposed || record.status !== "pending") return;
  try {
    const agent = ctx.get("agents")?.get(record.sessionId);
    if (agent === void 0) {
      recheckGone(ctx, deps, record);
      return;
    }
    if (agent.status === "running") {
      deferBusy(ctx, deps, record);
      return;
    }
    await attemptResume(ctx, deps, record);
  } catch (error) {
    record.lastError = `fire failed: ${error instanceof Error ? error.message : String(error)}`;
    markDirty(record);
    ctx.logger.warn(`deepseek-usage: quota-resume for session "${record.sessionId}" error: ${record.lastError}`);
  }
}

/**
 * Attempt one resume: verify quota availability (best effort), then wake the
 * agent with a continuation message.
 * @param {import("@deepseek-ai/cordis").Context} ctx
 * @param {ResumeDeps} deps
 * @param {ResumeRecord} record
 * @returns {Promise<void>}
 */
async function attemptResume(ctx, deps, record) {
  if (record.attempts >= record.maxAttempts) {
    record.status = "failed";
    record.lastError = `max attempts reached (${record.maxAttempts})`;
    markDirty(record);
    ctx.logger.warn(`deepseek-usage: quota-resume for session "${record.sessionId}" failed: ${record.lastError}`);
    return;
  }
  // Best-effort quota re-check: if the provider still reports an exhausted
  // window, wait for the next reset instead of waking the model into a
  // guaranteed second failure.
  const available = await quotaAvailable(deps, record);
  if (!available) {
    record.rechecks += 1;
    if (record.rechecks > QUOTA_RECHECK_LIMIT) {
      record.status = "failed";
      record.lastError = "quota still exhausted after repeated rechecks";
      markDirty(record);
      ctx.logger.warn(`deepseek-usage: quota-resume for session "${record.sessionId}" failed: ${record.lastError}`);
      return;
    }
    record.resumesAt = Date.now() + QUOTA_RECHECK_MS;
    record.lastError = "quota still exhausted at fire time; rechecking";
    markDirty(record);
    ctx.logger.info(`deepseek-usage: quota-resume for session "${record.sessionId}" deferred (quota not yet reset)`);
    arm(record, (r) => void fire(ctx, deps, r));
    return;
  }
  const agent = ctx.get("agents")?.get(record.sessionId);
  if (agent === void 0) {
    recheckGone(ctx, deps, record);
    return;
  }
  let message;
  try {
    message = buildContinuationMessage(agent, record);
  } catch (error) {
    record.status = "failed";
    record.lastError = `resume prompt build failed: ${error instanceof Error ? error.message : String(error)}`;
    markDirty(record);
    ctx.logger.warn(`deepseek-usage: quota-resume for session "${record.sessionId}" failed: ${record.lastError}`);
    return;
  }
  agent.followup(message);
  record.attempts += 1;
  record.status = "done";
  record.lastError = void 0;
  markDirty(record);
  ctx.logger.info(`deepseek-usage: quota-resume queued follow-up for session "${record.sessionId}" (attempt ${record.attempts}/${record.maxAttempts})`);
}

/**
 * Handle one `agent/request-error` observation. Returns `undefined` (never a
 * retry claim), so the failure stays terminal exactly as it would without
 * this plugin; the agent loop is not influenced.
 * @param {import("@deepseek-ai/cordis").Context} ctx
 * @param {ResumeDeps} deps
 * @param {import("@deepseek-ai/dsh-agent").Agent} agent
 * @param {{ failure?: { code?: string }, provider?: string }} payload
 * @returns {Promise<undefined>}
 */
async function handleRequestError(ctx, deps, agent, payload) {
  try {
    const failure = payload.failure;
    if (failure == null || failure.code !== "QUOTA") return void 0;
    if (!deps.getConfig().resume.enabled) return void 0;

    const existing = recordFor(agent.id);
    if (existing !== void 0) {
      // Already tracking this session; refresh the reset target in case the
      // window changed (a repeated QUOTA under always-mode retry lands here).
      if (existing.status === "pending") {
        const resumesAt = await computeResumesAt(deps, payload.provider ?? "");
        if (resumesAt !== null) {
          existing.resumesAt = resumesAt;
          existing.lastError = void 0;
          markDirty(existing);
          arm(existing, (r) => void fire(ctx, deps, r));
        }
      }
      return void 0;
    }

    const interruptedAt = Date.now();
    const resumesAt = await computeResumesAt(deps, payload.provider ?? "");
    const record = {
      sessionId: agent.id,
      provider: deps.mapProvider(payload.provider ?? ""),
      interruptedAt,
      resumesAt,
      attempts: 0,
      maxAttempts: deps.getConfig().resume.maxAttempts,
      rechecks: 0,
      status: "pending"
    };
    markDirty(record);
    arm(record, (r) => void fire(ctx, deps, r));
    ctx.logger.info(
      `deepseek-usage: quota exhausted for session "${agent.id}"; auto-resume scheduled at ${new Date(record.resumesAt).toISOString()}`
    );
  } catch (error) {
    // The request-error waterfall must never be broken by this plugin.
    ctx.logger.warn(`deepseek-usage: quota-resume detection failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return void 0;
}

/**
 * Compute the next quota reset instant: map the failed route provider to a
 * billing provider, fetch its quota windows, and take the earliest future
 * reset. Falls back to the configured default delay.
 * @param {ResumeDeps} deps
 * @param {string} providerHint - the failed request's route provider id
 * @returns {Promise<number>} epoch ms, never in the past
 */
async function computeResumesAt(deps, providerHint) {
  const now = Date.now();
  const providerId = deps.mapProvider(providerHint);
  let resumesAt = null;
  if (providerId !== null) {
    const key = await deps.resolveApiKey(providerId);
    if (key !== null) {
      const windows = await deps.fetchQuotaWindows(providerId, key);
      if (windows !== null && windows.length > 0) {
        const future = windows
          .map((w) => w.resetsAt)
          .filter((t) => typeof t === "number" && Number.isFinite(t) && t > now);
        if (future.length > 0) resumesAt = Math.min(...future);
      }
    }
  }
  if (resumesAt === null) resumesAt = now + deps.getConfig().resume.defaultRetryDelayMs;
  return Math.max(resumesAt, now + MIN_DELAY_MS);
}

/**
 * Install listeners for one agent: detect QUOTA request errors and catch up
 * any pending record for a reopened session. Returns a disposer.
 * @param {import("@deepseek-ai/cordis").Context} ctx
 * @param {ResumeDeps} deps
 * @param {import("@deepseek-ai/dsh-agent").Agent} agent
 * @returns {() => void}
 */
function installAgent(ctx, deps, agent) {
  const stopError = agent.ctx.on("agent/request-error", (payload) => handleRequestError(ctx, deps, agent, payload));
  const pending = recordFor(agent.id);
  if (pending !== void 0 && pending.status === "pending") {
    // Session was reopened before the reset time (or the reset passed while
    // it was closed): re-arm so it fires as soon as the agent is idle.
    clearTimer(pending.sessionId);
    if (pending.resumesAt <= Date.now()) {
      setTimeout(() => void fire(ctx, deps, pending), FIRE_STARTUP_DELAY_MS);
    } else {
      arm(pending, (r) => void fire(ctx, deps, r));
    }
  }
  return stopError;
}

/**
 * Install the quota auto-resume feature. Called from the plugin's apply()
 * effect; returns a disposer.
 * @param {import("@deepseek-ai/cordis").Context} ctx
 * @param {ResumeDeps} deps
 * @returns {() => void}
 */
export function installQuotaResume(ctx, deps) {
  disposed = false;
  const home = resolveDshHome();
  storePath = join(home, RESUME_FILE_NAME);
  void loadStore().then(() => {
    if (disposed) return;
    // Startup recovery: pending records whose reset time has already passed
    // fire shortly after boot (agents may not be live yet — rechecks cover
    // that); future ones arm normally.
    for (const record of records.values()) {
      if (record.status !== "pending") continue;
      if (record.resumesAt <= Date.now()) {
        if (ctx.get("agents")?.get(record.sessionId) !== void 0) {
          setTimeout(() => void fire(ctx, deps, record), FIRE_STARTUP_DELAY_MS);
        } else {
          record.lastError = "pending at startup; waiting for agent";
          markDirty(record);
        }
      } else {
        arm(record, (r) => void fire(ctx, deps, r));
      }
    }
  });

  flushTimer = setInterval(() => void saveStore(), STORE_FLUSH_INTERVAL_MS);
  flushTimer.unref?.();

  const stopCreated = ctx.on("agent/created", ({ agent }) => {
    installAgent(ctx, deps, agent);
  });
  // Cover agents created before this plugin loaded (e.g. hot reload).
  const roots = ctx.get("agents")?.roots() ?? [];
  const stopExisting = roots.map((agent) => installAgent(ctx, deps, agent));

  return () => {
    disposed = true;
    stopCreated();
    for (const stop of stopExisting) stop();
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    if (flushTimer !== null) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
    void saveStore();
    records.clear();
    storePath = null;
  };
}
