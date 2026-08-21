window.__ModuleLoader__.load({
	id: "dsh-plugin-deepseek-usage",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		/** Cordis plugin name. */
		const name = "deepseek-usage";
		/** No injected services: the bar only talks to the same-origin API routes. */
		const inject = [];

		/** Providers that bill by subscription quota windows (5h/weekly). */
		const PLAN_PROVIDERS = new Set(["zhipu", "kimi"]);

		const STYLE_ID = "dsh-plugin-deepseek-usage/client.css";
		const CSS = [
			".dsu-root{position:fixed;z-index:2147483000;display:flex;align-items:center;gap:0;box-sizing:border-box;max-width:min(92vw,720px);height:28px;padding:0 6px 0 12px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08));background:var(--dsw-alias-bg-overlay,rgba(255,255,255,.94));color:var(--dsw-alias-label-primary,#1f2329);box-shadow:0 4px 16px rgba(0,0,0,.12);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);font:12px/1.4 -apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,\"PingFang SC\",\"Microsoft YaHei\",sans-serif;user-select:none;cursor:grab;touch-action:none;transition:opacity .2s ease;animation:dsu-in .25s ease}",
			".dsu-root.dsu-dragging{cursor:grabbing;opacity:.95}",
			".dsu-root.dsu-hidden{opacity:0;pointer-events:none}",
			"@keyframes dsu-in{from{opacity:0}to{opacity:1}}",
			".dsu-seg{display:flex;align-items:baseline;gap:5px;white-space:nowrap}",
			".dsu-label{color:var(--dsw-alias-label-secondary,#646a73);font-size:11px}",
			".dsu-value{font-weight:600;font-variant-numeric:tabular-nums}",
			".dsu-value.dsu-tokens{color:var(--dsw-alias-label-primary,#1f2329)}",
			".dsu-value.dsu-cost{color:var(--dsw-alias-state-business-primary,#2563eb)}",
			".dsu-value.dsu-balance{color:var(--dsw-alias-state-success-primary,#1f883d)}",
			".dsu-value.dsu-balance.dsu-low{color:var(--dsw-alias-state-error-primary,#d1242f)}",
			".dsu-value.dsu-error{color:var(--dsw-alias-state-error-primary,#d1242f)}",
			".dsu-period{display:inline-flex;align-items:center;height:16px;margin-left:8px;padding:0 6px;border-radius:999px;font-size:10px;font-weight:600;line-height:1;white-space:nowrap}",
			".dsu-period.dsu-peak{color:var(--dsw-alias-state-error-primary,#d1242f);background:rgba(209,36,47,.1)}",
			".dsu-period.dsu-offpeak{color:var(--dsw-alias-state-success-primary,#1f883d);background:rgba(31,136,61,.1)}",
			".dsu-div{width:1px;height:14px;margin:0 9px;background:var(--dsw-alias-border-l1,rgba(0,0,0,.12))}",
			".dsu-btn{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;margin-left:6px;padding:0;border:none;border-radius:999px;background:transparent;color:var(--dsw-alias-label-tertiary,#9aa0a6);cursor:pointer;font-size:13px;line-height:1}",
			".dsu-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,#1f2329)}",
			".dsu-btn.dsu-spin svg{animation:dsu-spin .6s linear infinite}",
			"@keyframes dsu-spin{to{transform:rotate(360deg)}}",
			".dsu-root.dsu-loading .dsu-value:not(.dsu-ok){color:var(--dsw-alias-label-tertiary,#9aa0a6)}",
			".dsu-panel{position:fixed;z-index:2147483001;width:min(92vw,360px);box-sizing:border-box;padding:14px 16px;border-radius:12px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08));background:var(--dsw-alias-bg-overlay,rgba(255,255,255,.98));color:var(--dsw-alias-label-primary,#1f2329);box-shadow:0 12px 40px rgba(0,0,0,.18);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);font:12px/1.5 -apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,\"PingFang SC\",\"Microsoft YaHei\",sans-serif}",
			".dsu-panel h3{margin:0 0 10px;font-size:13px;font-weight:600}",
			".dsu-panel .dsu-p-close{position:absolute;top:8px;right:10px;border:none;background:none;cursor:pointer;color:var(--dsw-alias-label-tertiary,#9aa0a6);font-size:14px;line-height:1}",
			".dsu-panel .dsu-p-field{margin-bottom:10px}",
			".dsu-panel label{display:block;margin-bottom:3px;color:var(--dsw-alias-label-secondary,#646a73);font-size:11px}",
			".dsu-panel .dsu-p-row{display:flex;gap:8px;align-items:center}",
			".dsu-panel input[type=number],.dsu-panel input[type=text],.dsu-panel select{width:100%;box-sizing:border-box;padding:4px 8px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.14));border-radius:6px;background:var(--dsw-alias-bg-field,#fff);color:inherit;font:inherit}",
			".dsu-panel .dsu-p-num{flex:1;min-width:0}",
			".dsu-panel .dsu-p-hint{color:var(--dsw-alias-label-tertiary,#9aa0a6);font-size:10px;margin-top:2px}",
			".dsu-panel .dsu-p-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}",
			".dsu-panel button.dsu-p-save{padding:5px 14px;border:none;border-radius:6px;background:var(--dsw-alias-state-business-primary,#2563eb);color:#fff;cursor:pointer;font:inherit}",
			".dsu-panel button.dsu-p-reset{padding:5px 10px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.14));border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#646a73);cursor:pointer;font:inherit}",
			".dsu-panel button.dsu-p-save:disabled{opacity:.5;cursor:not-allowed}",
			".dsu-stats{position:fixed;z-index:2147483001;width:min(94vw,560px);max-height:72vh;overflow:auto;box-sizing:border-box;padding:14px 16px;border-radius:12px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08));background:var(--dsw-alias-bg-overlay,rgba(255,255,255,.98));color:var(--dsw-alias-label-primary,#1f2329);box-shadow:0 12px 40px rgba(0,0,0,.18);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);font:12px/1.5 -apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,\"PingFang SC\",\"Microsoft YaHei\",sans-serif}",
			".dsu-stats h3{margin:0 0 4px;font-size:13px;font-weight:600}",
			".dsu-stats .dsu-s-close{position:absolute;top:8px;right:10px;border:none;background:none;cursor:pointer;color:var(--dsw-alias-label-tertiary,#9aa0a6);font-size:14px;line-height:1}",
			".dsu-stats .dsu-s-sub{color:var(--dsw-alias-label-tertiary,#9aa0a6);font-size:10px;margin-bottom:8px}",
			".dsu-stats .dsu-s-sec{margin:10px 0 4px;color:var(--dsw-alias-label-secondary,#646a73);font-size:11px;font-weight:600}",
			".dsu-qrow{margin:6px 0}",
			".dsu-qhead{display:flex;justify-content:space-between;gap:8px;font-variant-numeric:tabular-nums}",
			".dsu-qhead .dsu-qname{color:var(--dsw-alias-label-primary,#1f2329)}",
			".dsu-qhead .dsu-qval{color:var(--dsw-alias-label-secondary,#646a73)}",
			".dsu-qbar{height:6px;border-radius:3px;background:var(--dsw-alias-border-l1,rgba(0,0,0,.08));overflow:hidden;margin-top:3px}",
			".dsu-qbar-fill{height:100%;border-radius:3px;background:var(--dsw-alias-state-success-primary,#1f883d);transition:width .3s ease}",
			".dsu-qbar-fill.dsu-warn{background:var(--dsw-alias-state-warning-primary,#d4a72c)}",
			".dsu-qbar-fill.dsu-crit{background:var(--dsw-alias-state-error-primary,#d1242f)}",
			".dsu-qreset{color:var(--dsw-alias-label-tertiary,#9aa0a6);font-size:10px;margin-top:2px}",
			".dsu-table{width:100%;border-collapse:collapse;margin-top:4px}",
			".dsu-table th,.dsu-table td{padding:3px 6px;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;font-size:11px}",
			".dsu-table th:first-child,.dsu-table td:first-child{text-align:left;max-width:150px;overflow:hidden;text-overflow:ellipsis}",
			".dsu-table thead th{color:var(--dsw-alias-label-secondary,#646a73);font-weight:500;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12))}",
			".dsu-table tfoot td{border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));font-weight:600}",
			".dsu-table tr.dsu-active td:first-child{font-weight:600}",
			".dsu-cur{display:inline-block;margin-left:4px;padding:0 4px;border-radius:4px;background:var(--dsw-alias-state-business-primary,#2563eb);color:#fff;font-size:9px;line-height:14px;vertical-align:1px}",
			".dsu-s-meta{margin-top:10px;color:var(--dsw-alias-label-tertiary,#9aa0a6);font-size:10px}",
			".dsu-s-empty{color:var(--dsw-alias-label-tertiary,#9aa0a6);font-size:11px;padding:8px 0}"
		].join("\n");


		/** @param {string} id @param {string} css */
		function ensureStyle(id, css) {
			if (typeof document === "undefined") return;
			if (document.querySelector(`style[data-plugin-css="${id}"]`)) return;
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-plugin-deepseek-usage";
			tag.dataset.pluginCss = id;
			tag.textContent = css;
			document.head.appendChild(tag);
		}

		/** @param {number} n */
		function fmtTokens(n) {
			if (!Number.isFinite(n) || n <= 0) return "0";
			if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
			if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
			return String(Math.round(n));
		}

		/** @param {number} v @param {string} [currency] */
		function fmtMoney(v, currency) {
			const symbol = currency === "CNY" || currency === void 0 ? "¥" : currency === "USD" ? "$" : currency + " ";
			if (!Number.isFinite(v)) return symbol + "0";
			const abs = Math.abs(v);
			const digits = abs >= 1 ? 2 : abs >= 0.01 ? 3 : 4;
			return symbol + v.toFixed(digits);
		}

		/** Format a reset timestamp: HH:MM when today, MM-DD HH:MM otherwise. @param {number} ms */
		function fmtReset(ms) {
			if (!Number.isFinite(ms)) return "—";
			const d = new Date(ms);
			const now = new Date();
			const hm = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
			const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
			if (sameDay) return hm;
			return (d.getMonth() + 1) + "-" + String(d.getDate()).padStart(2, "0") + " " + hm;
		}

		/** @param {string} text */
		function el(tag, className, text) {
			const node = document.createElement(tag);
			if (className) node.className = className;
			if (text !== void 0) node.textContent = text;
			return node;
		}

		function apply(ctx) {
			ensureStyle(STYLE_ID, CSS);
			if (!document.body) {
				document.addEventListener("DOMContentLoaded", () => mount(ctx), { once: true });
				return;
			}
			mount(ctx);
		}

		function mount(ctx) {
			const root = el("div", "dsu-root");
			root.setAttribute("role", "status");
			root.setAttribute("aria-live", "polite");

			// ── segments ────────────────────────────────────────────────────────
			const segTokens = el("span", "dsu-seg");
			const segCost = el("span", "dsu-seg");
			const segBalance = el("span", "dsu-seg");
			const lTokens = el("span", "dsu-label", "今日用量");
			const lCost = el("span", "dsu-label", "今日费用");
			const lBalance = el("span", "dsu-label", "余额");
			const vTokens = el("span", "dsu-value dsu-tokens", "…");
			const vCost = el("span", "dsu-value dsu-cost", "…");
			const vBalance = el("span", "dsu-value dsu-balance", "…");
			const vPeriod = el("span", "dsu-period dsu-offpeak", "闲时");
			segTokens.append(lTokens, vTokens);
			segCost.append(lCost, vCost);
			segBalance.append(lBalance, vBalance);

			const statsBtn = el("button", "dsu-btn dsu-stats-btn");
			statsBtn.type = "button";
			statsBtn.title = "展开统计（今日各模型用量）";
			statsBtn.innerHTML =
				'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="20" x2="4" y2="12"/><line x1="10" y1="20" x2="10" y2="6"/><line x1="16" y1="20" x2="16" y2="14"/><line x1="22" y1="20" x2="22" y2="9"/></svg>';

			const refreshBtn = el("button", "dsu-btn dsu-refresh");
			refreshBtn.type = "button";
			refreshBtn.title = "刷新";
			refreshBtn.innerHTML =
				'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>';

			const configBtn = el("button", "dsu-btn dsu-config-btn");
			configBtn.type = "button";
			configBtn.title = "设置";
			configBtn.innerHTML =
				'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06-.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

			root.append(segTokens, el("span", "dsu-div"), segCost, el("span", "dsu-div"), segBalance, vPeriod, statsBtn, configBtn, refreshBtn);
			document.body.appendChild(root);

			// ── relative (viewport-ratio) positioning ───────────────────────────
			// Position is stored as fractions of the viewport (0..1), so the bar
			// stays proportionally placed when the window is resized or the layout
			// changes. Default: centered near the top (left 50% / top ~2%).
			const POS_KEY = "dsh-plugin-deepseek-usage/pos";
			const DRAG_MARGIN = 4;
			let dragging = false;

			/** Clamp a top-left pixel position so the bar stays fully on screen. */
			function clampPx(x, y) {
				const rect = root.getBoundingClientRect();
				const maxX = Math.max(DRAG_MARGIN, window.innerWidth - rect.width - DRAG_MARGIN);
				const maxY = Math.max(DRAG_MARGIN, window.innerHeight - rect.height - DRAG_MARGIN);
				return {
					x: Math.min(Math.max(DRAG_MARGIN, x), maxX),
					y: Math.min(Math.max(DRAG_MARGIN, y), maxY)
				};
			}

			/** Convert a pixel top-left position to viewport fractions. */
			function pxToRatio(x, y) {
				const rect = root.getBoundingClientRect();
				const vw = Math.max(1, window.innerWidth - rect.width);
				const vh = Math.max(1, window.innerHeight - rect.height);
				return { px: x / vw, py: y / vh };
			}

			/** Apply a ratio position: left/top are computed from viewport size. */
			function applyRatio(px, py) {
				const rect = root.getBoundingClientRect();
				const vw = Math.max(1, window.innerWidth - rect.width);
				const vh = Math.max(1, window.innerHeight - rect.height);
				const p = clampPx(px * vw, py * vh);
				root.style.left = Math.round(p.x) + "px";
				root.style.top = Math.round(p.y) + "px";
				root.style.transform = "none";
			}

			// restore a previously dragged ratio position; default = centered top
			let ratio = { px: 0.5, py: 0.02 };
			try {
				const saved = JSON.parse(localStorage.getItem(POS_KEY) || "null");
				if (saved && Number.isFinite(saved.px) && Number.isFinite(saved.py)) {
					ratio = { px: Math.min(1, Math.max(0, saved.px)), py: Math.min(1, Math.max(0, saved.py)) };
					applyRatio(ratio.px, ratio.py);
					root.style.animation = "none"; // no entrance animation when restoring
				}
			} catch { /* ignore corrupt saved state */ }

			// keep the bar proportionally placed when the viewport size changes
			const onResize = () => applyRatio(ratio.px, ratio.py);
			window.addEventListener("resize", onResize);

			root.addEventListener("pointerdown", (event) => {
				if (disposed) return;
				// buttons keep their own clicks; never start a drag on them
				const target = event.target;
				if (target && typeof target.closest === "function" && target.closest(".dsu-btn")) return;
				event.preventDefault();
				dragging = true;
				root.classList.add("dsu-dragging");
				const rect = root.getBoundingClientRect();
				const startX = event.clientX;
				const startY = event.clientY;
				const originX = rect.left;
				const originY = rect.top;
				try {
					root.setPointerCapture(event.pointerId);
				} catch { /* capture is best-effort */ }
				const onMove = (moveEvent) => {
					if (!dragging) return;
					const p = clampPx(originX + (moveEvent.clientX - startX), originY + (moveEvent.clientY - startY));
					root.style.left = Math.round(p.x) + "px";
					root.style.top = Math.round(p.y) + "px";
					root.style.transform = "none";
				};
				const onUp = (upEvent) => {
					if (!dragging) return;
					dragging = false;
					root.classList.remove("dsu-dragging");
					try {
						root.releasePointerCapture(upEvent.pointerId);
					} catch { /* ignore */ }
					root.removeEventListener("pointermove", onMove);
					root.removeEventListener("pointerup", onUp);
					root.removeEventListener("pointercancel", onUp);
					const rect = root.getBoundingClientRect();
					ratio = pxToRatio(rect.left, rect.top);
					try {
						localStorage.setItem(POS_KEY, JSON.stringify(ratio));
					} catch { /* storage may be unavailable */ }
				};
				root.addEventListener("pointermove", onMove);
				root.addEventListener("pointerup", onUp);
				root.addEventListener("pointercancel", onUp);
			});

			let last = null;
			let timer = null;
			let inFlight = false;
			let disposed = false;

			// ── current-conversation model tracking ────────────────────────────
			// Follows the web shell: `sessions` exposes the open session id,
			// `modelDirectories` exposes that session's selected provider/model.
			// Both are core client services; tracking is best-effort — the bar
			// keeps working (fixed provider from config) when they are absent.
			let currentSessionId = null;
			/** @type {{ provider?: string, model?: string } | null} */
			let currentModel = null;
			let modelRefreshTimer = null;

			function scheduleModelRefresh() {
				if (disposed) return;
				if (modelRefreshTimer !== null) clearTimeout(modelRefreshTimer);
				modelRefreshTimer = setTimeout(() => {
					modelRefreshTimer = null;
					refresh();
				}, 300);
			}

			try {
				ctx.inject(["sessions", "modelDirectories"], (mctx) => {
					const sessions = mctx.get("sessions");
					const directories = mctx.get("modelDirectories");
					let dirStop = null;
					const followDirectory = (sid) => {
						if (dirStop) { try { dirStop(); } catch { /* ignore */ } dirStop = null; }
						currentModel = null;
						if (!sid) return;
						let directory = null;
						try {
							directory = directories.directoryFor(sid);
						} catch {
							directory = null; // session scope not materialized yet
						}
						if (!directory) return;
						const snap = directory.store.getSnapshot();
						if (snap && snap.status === "idle") directory.load().catch(() => {});
						currentModel = snap && snap.current ? snap.current : null;
						dirStop = directory.store.subscribe(() => {
							const s = directory.store.getSnapshot();
							const next = s && s.current ? s.current : null;
							const prev = currentModel;
							const changed = (next ? next.model : null) !== (prev ? prev.model : null)
								|| (next ? next.provider : null) !== (prev ? prev.provider : null);
							currentModel = next;
							if (changed) scheduleModelRefresh();
						});
					};
					const onList = () => {
						const snap = sessions.list.getSnapshot();
						const sid = snap && snap.current ? String(snap.current) : null;
						if (sid !== currentSessionId) {
							currentSessionId = sid;
							followDirectory(sid);
							scheduleModelRefresh();
						}
					};
					const stopList = sessions.list.subscribe(onList);
					onList();
					mctx.effect(() => () => {
						stopList();
						if (dirStop) dirStop();
					}, "deepseek-usage: model tracking");
				});
			} catch { /* model tracking unavailable: fixed-provider mode still works */ }

			/**
			 * Render one API payload. `data.provider` selects the billing face:
			 * deepseek → tokens/cost/balance, zhipu|kimi → plan + quota windows,
			 * none → tokens + configured-rate estimate without account data.
			 * @param {{ ok: boolean, error?: { code?: string, message?: string }, accountError?: { code?: string, message?: string }, day?: string, balance?: any, quotas?: any[], usage?: any, usageByModel?: any, cost?: any, fetchedAt?: number, currency?: string, provider?: string, providerName?: string, providerAuto?: boolean, model?: string, fromLedger?: boolean, period?: any }} data
			 */
			function render(data) {
				if (disposed) return;
				root.classList.remove("dsu-loading");
				if (data && data.ok === true) {
					last = data;
					const provider = typeof data.provider === "string" ? data.provider : "deepseek";
					const u = data.usage || {};
					const byModel = data.usageByModel || (u.byModel || {});
					const modelId = typeof data.model === "string" ? data.model : null;
					const mu = modelId !== null && byModel[modelId] ? byModel[modelId] : null;
					const bp = u.byPeriod || {};
					const peakU = bp.peak || {};
					const offU = bp.offPeak || {};
					const bucketTotal = (b) => (b.inputTokens || 0) + (b.outputTokens || 0) + (b.cacheReadTokens || 0) + (b.cacheWriteTokens || 0);

					// tokens segment: the current model's bucket when the conversation
					// context is known, otherwise the whole-day total.
					lTokens.textContent = mu ? "模型用量" : "今日用量";
					vTokens.textContent = fmtTokens(mu ? (mu.totalTokens || 0) : (u.totalTokens || 0));
					vTokens.classList.add("dsu-ok");
					vTokens.title = [
						mu ? ("当前模型 " + modelId + " 今日用量 (" + (data.day ?? "") + ")") : ("今日token使用量 (" + (data.day ?? "") + ")"),
						"输入: " + fmtTokens((mu || u).inputTokens || 0),
						"输出: " + fmtTokens((mu || u).outputTokens || 0),
						"缓存命中: " + fmtTokens((mu || u).cacheReadTokens || 0),
						"请求数: " + ((mu || u).requests || 0),
						mu ? ("全天总量: " + fmtTokens(u.totalTokens || 0) + "（点击图表按钮查看各模型明细）") : null,
						"高峰: " + fmtTokens(bucketTotal(peakU)) + " tokens / " + (peakU.requests || 0) + " 请求",
						"闲时: " + fmtTokens(bucketTotal(offU)) + " tokens / " + (offU.requests || 0) + " 请求",
						"统计: " + (data.fromLedger ? "实时增量" : "会话扫描")
					].filter((line) => line !== null).join("\n");

					const b = data.balance || {};
					const quotas = Array.isArray(data.quotas) ? data.quotas : [];
					const quotaLines = quotas.map((q) => {
						const usedPct = q.limit > 0 ? Math.round((q.used / q.limit) * 100) : Math.round(q.used);
						const remainPct = Math.max(0, 100 - usedPct);
						return q.label + ": 已用 " + usedPct + "% · 剩余 " + remainPct + "%" + (q.resetsAt ? " · 重置 " + fmtReset(q.resetsAt) : "");
					});

					if (PLAN_PROVIDERS.has(provider)) {
						// subscription plans (glm-coding-plan / kimi-coding): plan name
						// in the cost slot, 5h quota usage in the balance slot.
						const planLabel = b.plan ? (b.plan + (b.planVersion ? "·" + b.planVersion : "")) : (data.providerName || provider);
						lCost.textContent = "套餐";
						vCost.textContent = planLabel;
						vCost.classList.add("dsu-ok");
						vCost.title = [
							"套餐: " + (b.plan ?? "—") + (b.planVersion ? "（" + b.planVersion + " 版本）" : ""),
							b.renewsAt ? ("续费: " + b.renewsAt) : null,
							quotas.length > 0 ? ("额度窗口: " + quotas.length + " 个（详见余额悬浮或统计面板）") : "额度: 无数据"
						].filter((line) => line !== null).join("\n");
						const sessionQuota = quotas.find((q) => q.kind === "session") || quotas[0] || null;
						lBalance.textContent = "5h额度";
						if (sessionQuota) {
							const pct = sessionQuota.limit > 0 ? Math.round((sessionQuota.used / sessionQuota.limit) * 100) : Math.round(sessionQuota.used);
							vBalance.textContent = "已用" + pct + "%";
							vBalance.classList.toggle("dsu-low", pct >= 90);
						} else {
							vBalance.textContent = "—";
							vBalance.classList.toggle("dsu-low", data.accountError != null);
						}
						vBalance.classList.add("dsu-ok");
						vBalance.title = [
							quotaLines.length > 0 ? quotaLines.join("\n") : "额度: 无数据",
							provider === "zhipu" && b.resourcePackages && b.resourcePackages.length > 0
								? b.resourcePackages.map((p) => "资源包 " + p.name + ": " + p.balance).join("\n") : null,
							provider === "zhipu" ? ("现金余额: " + (b.availableBalance ?? "0") + " CNY") : null,
							data.accountError ? ("账户查询: " + (data.accountError.message || data.accountError.code)) : null
						].filter((line) => line !== null).join("\n");
						vPeriod.style.display = "none"; // 峰谷时段仅适用于 DeepSeek 计费
					} else if (provider === "none") {
						// unrecognized billing surface: tokens + configured-rate estimate
						lCost.textContent = "估算费用";
						const costByModel = (data.cost && data.cost.byModel) || {};
						const mc = modelId !== null ? costByModel[modelId] : void 0;
						if (mc) {
							vCost.textContent = (mc.estimated ? "~" : "") + fmtMoney(mc.totalCny, "CNY");
							vCost.title = mc.estimated
								? "模型 " + modelId + " 未配置单价，按默认费率估算"
								: "模型 " + modelId + " 今日估算费用";
						} else {
							vCost.textContent = "—";
							vCost.title = "当前模型无用量或未识别";
						}
						vCost.classList.add("dsu-ok");
						lBalance.textContent = "余额";
						vBalance.textContent = "—";
						vBalance.classList.remove("dsu-low");
						vBalance.classList.add("dsu-ok");
						vBalance.title = data.providerAuto
							? "模型 " + (modelId ?? "?") + " 未匹配到计费厂商，仅统计 token"
							: "未配置厂商，仅统计 token";
						vPeriod.style.display = "none";
					} else {
						// DeepSeek: cost + balance
						lCost.textContent = "今日费用";
						const costCny = (data.cost && data.cost.cny) || 0;
						const costUsd = (data.cost && data.cost.usd) || 0;
						vCost.textContent = fmtMoney(costCny, "CNY");
						vCost.classList.add("dsu-ok");
						vCost.title = [
							"费用 (CNY)",
							"高峰: " + fmtMoney((data.cost && data.cost.peakCny) || 0, "CNY"),
							"闲时: " + fmtMoney((data.cost && data.cost.offPeakCny) || 0, "CNY"),
							"USD: $" + costUsd.toFixed(6)
						].join("\n");
						lBalance.textContent = "余额";
						const total = Number(b.totalBalance || 0);
						vBalance.textContent = data.balance ? fmtMoney(total, data.currency || "CNY") : "—";
						vBalance.classList.toggle("dsu-low", data.balance == null || b.isAvailable === false || total <= 0);
						vBalance.classList.add("dsu-ok");
						vBalance.title = [
							"余额 (" + (data.currency ?? "CNY") + ")",
							"总额: " + (b.totalBalance ?? "0"),
							"充值: " + (b.toppedUpBalance ?? "0"),
							"赠送: " + (b.grantedBalance ?? "0"),
							"可用: " + (b.isAvailable === false ? "否" : "是"),
							data.accountError ? ("账户查询: " + (data.accountError.message || data.accountError.code)) : null
						].filter((line) => line !== null).join("\n");
						vPeriod.style.display = "";
						const per = data.period || {};
						if (per.now === "peak") {
							vPeriod.textContent = "高峰";
							vPeriod.classList.remove("dsu-offpeak");
							vPeriod.classList.add("dsu-peak");
						} else {
							vPeriod.textContent = "闲时";
							vPeriod.classList.remove("dsu-peak");
							vPeriod.classList.add("dsu-offpeak");
						}
						vPeriod.title = per.timezone || "Asia/Shanghai (UTC+8)";
					}
					root.title = [
						(data.providerName || "用量监控") + (modelId ? (" · 当前模型 " + modelId) : ""),
						"更新于 " + new Date(data.fetchedAt ?? Date.now()).toLocaleTimeString(),
						data.accountError ? ("账户查询失败: " + (data.accountError.message || data.accountError.code)) : null
					].filter((line) => line !== null).join("\n");
					if (statsPanel) renderStats(data);
					return;
				}
				// error state — keep last known values where present
				const msg = data && data.error ? data.error.message || data.error.code || "未知错误" : "无法获取数据";
				if (last) {
					vTokens.title = "使用上次数据\n" + msg;
					root.title = msg;
				} else {
					vTokens.textContent = "—";
					vCost.textContent = "—";
					vBalance.textContent = "—";
					vTokens.classList.remove("dsu-ok");
					vCost.classList.remove("dsu-ok");
					vBalance.classList.remove("dsu-ok");
					vTokens.classList.add("dsu-error");
					vCost.classList.add("dsu-error");
					vBalance.classList.add("dsu-error");
					vTokens.title = msg;
					root.title = "用量监控: " + msg;
				}
			}

			/** @returns {Promise<void>} */
			async function refresh() {
				if (inFlight || disposed) return;
				inFlight = true;
				root.classList.add("dsu-loading");
				refreshBtn.classList.add("dsu-spin");
				try {
					let url = "/api/deepseek-usage";
					const params = new URLSearchParams();
					if (currentSessionId) params.set("sessionId", currentSessionId);
					if (currentModel && currentModel.model) params.set("model", currentModel.model);
					if (currentModel && currentModel.provider) params.set("providerHint", currentModel.provider);
					const qs = params.toString();
					if (qs) url += "?" + qs;
					const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
					let data = null;
					try {
						data = await res.json();
					} catch {
						data = { ok: false, error: { code: "BAD_RESPONSE", message: "HTTP " + res.status } };
					}
					render(data);
					// adopt the server-side refresh interval (kept in sync via config saves)
					if (data && data.ok === true && Number.isFinite(data.refreshIntervalMs) && data.refreshIntervalMs > 0) {
						updateTimer(data.refreshIntervalMs);
					}
				} catch (error) {
					render({ ok: false, error: { code: "NETWORK", message: String(error && error.message || error) } });
				} finally {
					inFlight = false;
					root.classList.remove("dsu-loading");
					refreshBtn.classList.remove("dsu-spin");
				}
			}

			/** Re-arm the auto-refresh timer with a new interval. */
			function updateTimer(intervalMs) {
				const next = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 300_000;
				if (timer !== null && Math.abs(timer._dsuInterval - next) < 100) return;
				if (timer !== null) clearInterval(timer);
				timer = setInterval(refresh, next);
				timer._dsuInterval = next;
				timer.unref?.();
			}

			// ── stats panel (expandable per-model breakdown) ───────────────────
			let statsPanel = null;

			/** Render the stats panel content from the latest payload. */
			function renderStats(data) {
				if (!statsPanel) return;
				const body = statsPanel.querySelector(".dsu-s-body");
				if (!body) return;
				body.textContent = "";
				if (!data || data.ok !== true) {
					body.append(el("div", "dsu-s-empty", "暂无数据，点击刷新按钮重试。"));
					return;
				}
				const provider = typeof data.provider === "string" ? data.provider : "deepseek";
				const modelId = typeof data.model === "string" ? data.model : null;
				const quotas = Array.isArray(data.quotas) ? data.quotas : [];

				// quota windows for subscription providers
				if (PLAN_PROVIDERS.has(provider)) {
					body.append(el("div", "dsu-s-sec", "套餐额度（" + (data.providerName || provider) + "）"));
					if (quotas.length === 0) {
						body.append(el("div", "dsu-s-empty", data.accountError
							? ("额度查询失败: " + (data.accountError.message || data.accountError.code))
							: "暂无额度数据"));
					}
					for (const q of quotas) {
						const usedPct = q.limit > 0 ? Math.min(100, Math.round((q.used / q.limit) * 100)) : Math.round(q.used);
						const remainPct = Math.max(0, 100 - usedPct);
						const row = el("div", "dsu-qrow");
						const head = el("div", "dsu-qhead");
						head.append(
							el("span", "dsu-qname", q.label),
							el("span", "dsu-qval", "已用 " + usedPct + "% · 剩余 " + remainPct + "%")
						);
						const bar = el("div", "dsu-qbar");
						const fill = el("div", "dsu-qbar-fill" + (usedPct >= 90 ? " dsu-crit" : usedPct >= 70 ? " dsu-warn" : ""));
						fill.style.width = usedPct + "%";
						bar.append(fill);
						row.append(head, bar);
						if (q.resetsAt) row.append(el("div", "dsu-qreset", "重置时间: " + fmtReset(q.resetsAt)));
						body.append(row);
					}
					if (!quotas.some((q) => q.kind === "weekly")) {
						body.append(el("div", "dsu-qreset", "周额度: 无（老套餐不含周额度窗口）"));
					}
				}

				// per-model usage table for today
				body.append(el("div", "dsu-s-sec", "今日各模型用量（" + (data.day ?? "") + "）"));
				const byModel = data.usageByModel || (data.usage && data.usage.byModel) || {};
				const costByModel = (data.cost && data.cost.byModel) || {};
				const rows = Object.entries(byModel)
					map(([id, m]) => ({ id, m }))
					filter((r) => (r.m.totalTokens || 0) > 0 || (r.m.requests || 0) > 0)
					sort((a, b2) => (b2.m.totalTokens || 0) - (a.m.totalTokens || 0));
				if (rows.length === 0) {
					body.append(el("div", "dsu-s-empty", "今日暂无模型用量。"));
				} else {
					const table = el("table", "dsu-table");
					const thead = document.createElement("thead");
					const hr = document.createElement("tr");
					for (const h of ["模型", "Tokens", "输入", "输出", "缓存读", "请求", "费用"]) {
						hr.append(el("th", null, h));
					}
					thead.append(hr);
					table.append(thead);
					const tbody = document.createElement("tbody");
					for (const r of rows) {
						const tr = document.createElement("tr");
						if (modelId !== null && r.id === modelId) tr.className = "dsu-active";
						const nameTd = el("td", null, r.id);
						nameTd.title = r.id;
						if (modelId !== null && r.id === modelId) nameTd.append(el("span", "dsu-cur", "当前"));
						tr.append(nameTd);
						tr.append(el("td", null, fmtTokens(r.m.totalTokens || 0)));
						tr.append(el("td", null, fmtTokens(r.m.inputTokens || 0)));
						tr.append(el("td", null, fmtTokens(r.m.outputTokens || 0)));
						tr.append(el("td", null, fmtTokens(r.m.cacheReadTokens || 0)));
						tr.append(el("td", null, String(r.m.requests || 0)));
						const c = costByModel[r.id];
						const costTd = el("td", null, c ? ((c.estimated ? "~" : "") + fmtMoney(c.totalCny, "CNY")) : "—");
						if (c && c.estimated) costTd.title = "未配置该模型单价，按默认费率估算";
						tr.append(costTd);
						tbody.append(tr);
					}
					table.append(tbody);
					const tfoot = document.createElement("tfoot");
					const fr = document.createElement("tr");
					const u = data.usage || {};
					fr.append(el("td", null, "合计"));
					fr.append(el("td", null, fmtTokens(u.totalTokens || 0)));
					fr.append(el("td", null, fmtTokens(u.inputTokens || 0)));
					fr.append(el("td", null, fmtTokens(u.outputTokens || 0)));
					fr.append(el("td", null, fmtTokens(u.cacheReadTokens || 0)));
					fr.append(el("td", null, String(u.requests || 0)));
					fr.append(el("td", null, fmtMoney((data.cost && data.cost.cny) || 0, "CNY")));
					tfoot.append(fr);
					table.append(tfoot);
					body.append(table);
				}

				body.append(el("div", "dsu-s-meta", [
					"计费: " + (data.providerName || "—") + (data.providerAuto ? "（自动跟随当前会话）" : "（固定）"),
					modelId ? ("当前模型: " + modelId) : null,
					"统计: " + (data.fromLedger ? "实时增量" : "会话扫描"),
					"更新于 " + new Date(data.fetchedAt ?? Date.now()).toLocaleTimeString()
				].filter((x) => x !== null).join(" · ")));
			}

			/** Toggle the expandable stats panel. */
			function openStatsPanel() {
				if (statsPanel) { statsPanel.remove(); statsPanel = null; return; }
				statsPanel = el("div", "dsu-stats");
				const r = root.getBoundingClientRect();
				statsPanel.style.left = Math.min(Math.max(8, r.right - 560), Math.max(8, window.innerWidth - 570)) + "px";
				statsPanel.style.top = Math.max(8, r.bottom + 8) + "px";
				const title = el("h3", null, "今日用量统计");
				const closeBtn = el("button", "dsu-s-close", "×");
				closeBtn.type = "button";
				closeBtn.title = "关闭";
				const body = el("div", "dsu-s-body");
				statsPanel.append(title, closeBtn, body);
				document.body.appendChild(statsPanel);
				closeBtn.addEventListener("click", () => {
					if (statsPanel) { statsPanel.remove(); statsPanel = null; }
				});
				renderStats(last);
				if (!last) refresh();
			}

			// ── config panel ─────────────────────────────────────────────────────
			let panel = null;

			/** Toggle the config panel; builds its form from the server config. */
			function openConfigPanel() {
				if (panel) { panel.remove(); panel = null; return; }
				panel = el("div", "dsu-panel");
				const r = root.getBoundingClientRect();
				panel.style.left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - 370)) + "px";
				panel.style.top = Math.max(8, r.bottom + 8) + "px";

				const title = el("h3", null, "用量监控 · 设置");
				const closeBtn = el("button", "dsu-p-close", "×");
				closeBtn.type = "button";
				closeBtn.title = "关闭";
				panel.append(title, closeBtn);
				document.body.appendChild(panel);

				let current = null;
				const fields = [];

				const numField = (label, key, value, step) => {
					const wrap = el("div", "dsu-p-field");
					const lb = el("label", null, label);
					const input = document.createElement("input");
					input.type = "number";
					input.min = "0";
					input.step = String(step ?? "0.01");
					input.value = String(value);
					wrap.append(lb, input);
					fields.push({ key, input });
					return wrap;
				};

				function buildForm(cfg) {
					// provider selector
					const provField = el("div", "dsu-p-field");
					provField.append(el("label", null, "计费厂商（用量/余额来源）"));
					const provSel = document.createElement("select");
					const provOpts = [
						{ value: "auto", label: "自动（跟随当前会话模型）" },
						{ value: "deepseek", label: "DeepSeek" },
						{ value: "zhipu", label: "智谱 glm-coding-plan (bigmodel.cn)" },
						{ value: "kimi", label: "Kimi kimi-coding (api.kimi.com)" }
					];
					for (const o of provOpts) {
						const opt = document.createElement("option");
						opt.value = o.value;
						opt.textContent = o.label;
						if (cfg.provider === o.value) opt.selected = true;
						provSel.append(opt);
					}
					provField.append(provSel, el("div", "dsu-p-hint", "自动模式按当前会话所选模型切换：deepseek*→DeepSeek 余额计费，glm*/zai→智谱套餐额度，kimi*/k3 等→Kimi 套餐额度。密钥：DEEPSEEK_API_KEY / ZHIPU_API_KEY / KIMI_CODING_API_KEY（或 KIMI_API_KEY）。"));
					fields.push({ key: "provider", input: provSel, isString: true });
					panel.append(provField);

					// per-model pricing: one collapsible block per configured model
					const modelIds = Object.keys(cfg.models || {});
					if (modelIds.length === 0) {
						panel.append(el("div", "dsu-p-hint", "未配置任何模型单价。"));
					}
					for (const model of modelIds) {
						const m = cfg.models[model];
						const block = el("div", "dsu-p-field");
						const head = el("div", "dsu-p-row");
						head.append(el("label", null, "模型: " + model));
						const removeModelBtn = el("button", "dsu-p-reset", "移除");
						removeModelBtn.type = "button";
						removeModelBtn.addEventListener("click", () => {
							delete cfg.models[model];
							// rebuild the panel from scratch to drop its fields
							panel.remove();
							panel = null;
							openConfigPanel();
						});
						head.append(removeModelBtn);
						block.append(head);

						const peakRow = el("div", "dsu-p-row");
						peakRow.append(numField("高峰·未命中", "models." + model + ".peak.inputCacheMiss", m.peak.inputCacheMiss));
						peakRow.append(numField("高峰·命中", "models." + model + ".peak.inputCacheHit", m.peak.inputCacheHit));
						peakRow.append(numField("高峰·输出", "models." + model + ".peak.output", m.peak.output));
						block.append(peakRow);

						const offRow = el("div", "dsu-p-row");
						offRow.append(numField("闲时·未命中", "models." + model + ".offPeak.inputCacheMiss", m.offPeak.inputCacheMiss));
						offRow.append(numField("闲时·命中", "models." + model + ".offPeak.inputCacheHit", m.offPeak.inputCacheHit));
						offRow.append(numField("闲时·输出", "models." + model + ".offPeak.output", m.offPeak.output));
						block.append(offRow);
						panel.append(block);
					}

					// add-model control
					const addModelField = el("div", "dsu-p-field");
					const addModelRow = el("div", "dsu-p-row");
					const modelNameInput = document.createElement("input");
					modelNameInput.type = "text";
					modelNameInput.placeholder = "新模型 id（如 deepseek-v4-pro）";
					modelNameInput.value = "";
					addModelRow.append(modelNameInput);
					const addModelBtn = el("button", "dsu-p-reset", "添加模型");
					addModelBtn.type = "button";
					addModelBtn.addEventListener("click", () => {
						const id = modelNameInput.value.trim();
						if (id.length === 0) return;
						if (cfg.models[id]) {
							modelNameInput.value = "";
							return;
						}
						// clone the first model's rates as a starting point
						const proto = modelIds.length > 0 ? cfg.models[modelIds[0]] : { peak: { inputCacheMiss: 0.14, inputCacheHit: 0.0028, output: 0.28 }, offPeak: { inputCacheMiss: 0.14, inputCacheHit: 0.0028, output: 0.28 } };
						cfg.models[id] = {
							peak: { ...proto.peak },
							offPeak: { ...proto.offPeak }
						};
						modelNameInput.value = "";
						// rebuild panel to render the new model block
						panel.remove();
						panel = null;
						openConfigPanel();
					});
					addModelRow.append(addModelBtn);
					addModelField.append(addModelRow);
					panel.append(addModelField);

					const rateField = el("div", "dsu-p-field");
					rateField.append(el("label", null, "CNY→USD 参考汇率（仅显示换算）"));
					const rateInput = document.createElement("input");
					rateInput.type = "number";
					rateInput.min = "0";
					rateInput.step = "0.01";
					rateInput.value = String(cfg.usdCny);
					rateField.append(rateInput);
					fields.push({ key: "usdCny", input: rateInput });
					panel.append(rateField);

					// dynamic peak windows: any number, with add/remove
					const winField = el("div", "dsu-p-field");
					winField.append(el("label", null, "高峰时段（北京时间，24 小时制；可增删）"));
					const windows = cfg.peakWindows || [];
					for (let i = 0; i < windows.length; i += 1) {
						const w = windows[i];
						const row = el("div", "dsu-p-row");
						row.append(numField("窗口" + (i + 1) + " 开始", "peakWindows." + i + ".startHour", w.startHour, "1"));
						row.append(numField("窗口" + (i + 1) + " 结束", "peakWindows." + i + ".endHour", w.endHour, "1"));
						const delBtn = el("button", "dsu-p-reset", "删");
						delBtn.type = "button";
						delBtn.addEventListener("click", () => {
							cfg.peakWindows.splice(i, 1);
							panel.remove();
							panel = null;
							openConfigPanel();
						});
						row.append(delBtn);
						winField.append(row);
					}
					const addWinBtn = el("button", "dsu-p-reset", "添加窗口");
					addWinBtn.type = "button";
					addWinBtn.addEventListener("click", () => {
						cfg.peakWindows = cfg.peakWindows || [];
						cfg.peakWindows.push({ startHour: 0, endHour: 1 });
						panel.remove();
						panel = null;
						openConfigPanel();
					});
					winField.append(addWinBtn, el("div", "dsu-p-hint", "区间为 [开始, 结束)，结束需大于开始；可添加任意数量窗口，删到 0 个表示全天闲时。"));
					panel.append(winField);

					const refField = el("div", "dsu-p-field");
					refField.append(el("label", null, "自动刷新间隔"));
					const sel = document.createElement("select");
					const choices = [
						{ label: "1 分钟", value: 60_000 },
						{ label: "5 分钟", value: 300_000 },
						{ label: "10 分钟", value: 600_000 },
						{ label: "30 分钟", value: 1_800_000 },
						{ label: "1 小时", value: 3_600_000 }
					];
					let matched = false;
					for (const c of choices) {
						const opt = document.createElement("option");
						opt.value = String(c.value);
						opt.textContent = c.label;
						if (cfg.refreshIntervalMs === c.value) { opt.selected = true; matched = true; }
						sel.append(opt);
					}
					if (!matched) {
						const opt = document.createElement("option");
						opt.value = String(cfg.refreshIntervalMs);
						opt.textContent = cfg.refreshIntervalMs + " ms";
						opt.selected = true;
						sel.append(opt);
					}
					refField.append(sel);
					fields.push({ key: "refreshIntervalMs", input: sel });
					panel.append(refField);

					const actions = el("div", "dsu-p-actions");
					const resetBtn = el("button", "dsu-p-reset", "恢复默认");
					resetBtn.type = "button";
					const saveBtn = el("button", "dsu-p-save", "保存");
					saveBtn.type = "button";
					saveBtn.disabled = true;
					actions.append(resetBtn, saveBtn);
					panel.append(actions);

					const collect = () => {
						const out = { models: {}, peakWindows: [], usdCny: 0, refreshIntervalMs: 300_000 };
						for (const f of fields) {
							const v = f.isString ? f.input.value : Number(f.input.value);
							const parts = f.key.split(".");
							if (parts.length === 1) { out[parts[0]] = v; }
							else if (parts.length === 2) {
								out[parts[0]] = out[parts[0]] || {};
								out[parts[0]][parts[1]] = v;
							} else if (parts.length === 4) {
								// models.<id>.peak.inputCacheMiss -> out.models[id].peak[...]
								const [, id, tier, field] = parts;
								out.models[id] = out.models[id] || {};
								out.models[id][tier] = out.models[id][tier] || {};
								out.models[id][tier][field] = v;
							} else if (parts.length === 3) {
								// peakWindows.<i>.startHour
								const [a, idx, field] = parts;
								out[a][Number(idx)] = out[a][Number(idx)] || {};
								out[a][Number(idx)][field] = v;
							}
						}
						return out;
					};
					const markDirty = () => { saveBtn.disabled = false; };
					for (const f of fields) {
						f.input.addEventListener("input", markDirty);
						f.input.addEventListener("change", markDirty);
					}
					resetBtn.addEventListener("click", async () => {
						try {
							const res = await fetch("/api/deepseek-usage/config", {
								method: "POST",
								headers: { "Content-Type": "application/json" },
								body: JSON.stringify({ reset: true }),
							});
							const data = await res.json();
							if (data && data.ok === true && data.config) {
								current = data.config;
								panel.remove();
								panel = null;
								refresh();
							}
						} catch { /* ignore */ }
					});
					saveBtn.addEventListener("click", async () => {
						saveBtn.disabled = true;
						try {
							const res = await fetch("/api/deepseek-usage/config", {
								method: "POST",
								headers: { "Content-Type": "application/json" },
								body: JSON.stringify(collect()),
							});
							const data = await res.json();
							if (data && data.ok === true && data.config) {
								current = data.config;
								panel.remove();
								panel = null;
								refresh();
							} else {
								saveBtn.disabled = false;
							}
						} catch {
							saveBtn.disabled = false;
						}
					});
				}

				(async () => {
					try {
						const res = await fetch("/api/deepseek-usage/config", { headers: { Accept: "application/json" }, cache: "no-store" });
						const data = await res.json();
						if (!data || data.ok !== true || !data.config) throw new Error("bad config response");
						current = data.config;
						buildForm(current);
					} catch (error) {
						panel.append(el("div", "dsu-p-hint", "加载配置失败: " + String(error && error.message || error)));
					}
				})();

				closeBtn.addEventListener("click", () => {
					panel.remove();
					panel = null;
				});
			}

			configBtn.addEventListener("click", (event) => {
				event.stopPropagation();
				openConfigPanel();
			});
			statsBtn.addEventListener("click", (event) => {
				event.stopPropagation();
				openStatsPanel();
			});
			refreshBtn.addEventListener("click", (event) => {
				event.stopPropagation();
				refresh();
			});

			// auto-refresh: server-provided interval (default 5 min). Tab-visibility
			// auto-refresh is intentionally omitted — only initial load, manual
			// clicks, and the interval refresh hit the API.
			timer = setInterval(refresh, 300_000);
			timer._dsuInterval = 300_000;
			timer.unref?.();

			ctx.effect(() => () => {
				disposed = true;
				clearInterval(timer);
				if (modelRefreshTimer !== null) clearTimeout(modelRefreshTimer);
				window.removeEventListener("resize", onResize);
				if (panel) { panel.remove(); panel = null; }
				if (statsPanel) { statsPanel.remove(); statsPanel = null; }
				root.remove();
			}, "deepseek-usage: top bar");

			refresh();
		}

		exports.name = name;
		exports.inject = inject;
		exports.apply = apply;
		return module.exports;
	}
});