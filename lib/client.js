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
			".dsu-panel input[type=number],.dsu-panel select{width:100%;box-sizing:border-box;padding:4px 8px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.14));border-radius:6px;background:var(--dsw-alias-bg-field,#fff);color:inherit;font:inherit}",
			".dsu-panel .dsu-p-num{flex:1;min-width:0}",
			".dsu-panel .dsu-p-hint{color:var(--dsw-alias-label-tertiary,#9aa0a6);font-size:10px;margin-top:2px}",
			".dsu-panel .dsu-p-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}",
			".dsu-panel button.dsu-p-save{padding:5px 14px;border:none;border-radius:6px;background:var(--dsw-alias-state-business-primary,#2563eb);color:#fff;cursor:pointer;font:inherit}",
			".dsu-panel button.dsu-p-reset{padding:5px 10px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.14));border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#646a73);cursor:pointer;font:inherit}",
			".dsu-panel button.dsu-p-save:disabled{opacity:.5;cursor:not-allowed}"
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
			const vTokens = el("span", "dsu-value dsu-tokens", "…");
			const vCost = el("span", "dsu-value dsu-cost", "…");
			const vBalance = el("span", "dsu-value dsu-balance", "…");
			const vPeriod = el("span", "dsu-period dsu-offpeak", "闲时");
			segTokens.append(el("span", "dsu-label", "今日用量"), vTokens);
			segCost.append(el("span", "dsu-label", "今日费用"), vCost);
			segBalance.append(el("span", "dsu-label", "余额"), vBalance);

			const refreshBtn = el("button", "dsu-btn dsu-refresh");
			refreshBtn.type = "button";
			refreshBtn.title = "刷新";
			refreshBtn.innerHTML =
				'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>';

			const configBtn = el("button", "dsu-btn dsu-config-btn");
			configBtn.type = "button";
			configBtn.title = "设置";
			configBtn.innerHTML =
				'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

			root.append(segTokens, el("span", "dsu-div"), segCost, el("span", "dsu-div"), segBalance, vPeriod, configBtn, refreshBtn);
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

			/** @param {{ ok: boolean, error?: { code?: string, message?: string }, day?: string, balance?: any, usage?: any, cost?: any, fetchedAt?: number, currency?: string }} data */
			function render(data) {
				if (disposed) return;
				root.classList.remove("dsu-loading");
				if (data && data.ok === true) {
					last = data;
					const u = data.usage || {};
					const bp = u.byPeriod || {};
					const peakU = bp.peak || {};
					const offU = bp.offPeak || {};
					const bucketTotal = (b) => (b.inputTokens || 0) + (b.outputTokens || 0) + (b.cacheReadTokens || 0) + (b.cacheWriteTokens || 0);
					vTokens.textContent = fmtTokens(u.totalTokens || 0);
					vTokens.classList.add("dsu-ok");
					vTokens.title = [
						`今日token使用量 (${data.day ?? ""})`,
						`输入: ${fmtTokens(u.inputTokens || 0)}`,
						`输出: ${fmtTokens(u.outputTokens || 0)}`,
						`缓存命中: ${fmtTokens(u.cacheReadTokens || 0)}`,
						`请求数: ${u.requests || 0}`,
						`高峰: ${fmtTokens(bucketTotal(peakU))} tokens / ${peakU.requests || 0} 请求`,
						`闲时: ${fmtTokens(bucketTotal(offU))} tokens / ${offU.requests || 0} 请求`,
						`统计: ${data.fromLedger ? "实时增量" : "会话扫描"}`
					].join("\n");
					const isZhipu = data.provider === "zhipu";
					const b = data.balance || {};
					const quotas = Array.isArray(data.quotas) ? data.quotas : [];
					if (isZhipu) {
						// plan segment: plan name + version badge
						const planLabel = b.plan ? (b.plan + (b.planVersion ? "·" + b.planVersion : "")) : "智谱";
						vCost.textContent = planLabel;
						vCost.classList.add("dsu-ok");
						vCost.title = [
							`套餐: ${b.plan ?? "—"}${b.planVersion ? "（" + b.planVersion + " 版本）" : ""}`,
							...(b.renewsAt ? [`续费: ${b.renewsAt}`] : []),
							...(quotas.length > 0 ? [`额度窗口: ${quotas.length} 个`] : ["额度: 无数据"])
						].join("\n");
						// balance segment: show 5h quota percentage, hover for details
						const sessionQuota = quotas.find((q) => q.kind === "session");
						if (sessionQuota) {
							const pct = Math.round(sessionQuota.used);
							vBalance.textContent = pct + "%";
							vBalance.classList.toggle("dsu-low", pct >= 90);
						} else {
							vBalance.textContent = b.availableBalance ? fmtMoney(Number(b.availableBalance), "CNY") : "—";
							vBalance.classList.toggle("dsu-low", b.isAvailable === false);
						}
						vBalance.classList.add("dsu-ok");
						const quotaLines = quotas.map((q) => {
							const pct = q.limit > 0 ? Math.round((q.used / q.limit) * 100) : q.used;
							return `${q.label}: ${q.used}${q.unit}${q.limit > 0 ? " / " + q.limit + q.unit : ""}（${pct}%）${q.resetsAt ? " · 重置 " + new Date(q.resetsAt).toLocaleString() : ""}`;
						});
						vBalance.title = [
							...(quotaLines.length > 0 ? quotaLines : ["额度: 无数据"]),
							...(b.resourcePackages && b.resourcePackages.length > 0 ? b.resourcePackages.map((p) => `资源包 ${p.name}: ${p.balance}`) : []),
							`现金余额: ${b.availableBalance ?? "0"} CNY`,
							`充值: ${b.toppedUpBalance ?? "0"} / 赠送: ${b.grantedBalance ?? "0"}`
						].join("\n");
					} else {
						// DeepSeek: cost + balance as before
						const costCny = (data.cost && data.cost.cny) || 0;
						const costUsd = (data.cost && data.cost.usd) || 0;
						vCost.textContent = fmtMoney(costCny, "CNY");
						vCost.classList.add("dsu-ok");
						vCost.title = [
							`费用 (CNY)`,
							`高峰: ${fmtMoney((data.cost && data.cost.peakCny) || 0, "CNY")}`,
							`闲时: ${fmtMoney((data.cost && data.cost.offPeakCny) || 0, "CNY")}`,
							`USD: $${costUsd.toFixed(6)}`
						].join("\n");
						const total = Number(b.totalBalance || 0);
						vBalance.textContent = fmtMoney(total, data.currency || "CNY");
						vBalance.classList.toggle("dsu-low", b.isAvailable === false || total <= 0);
						vBalance.classList.add("dsu-ok");
						vBalance.title = [
							`余额 (${data.currency ?? "CNY"})`,
							`总额: ${b.totalBalance ?? "0"}`,
							`充值: ${b.toppedUpBalance ?? "0"}`,
							`赠送: ${b.grantedBalance ?? "0"}`,
							`可用: ${b.isAvailable === false ? "否" : "是"}`
						].join("\n");
					}
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
					root.title = `更新于 ${new Date(data.fetchedAt ?? Date.now()).toLocaleTimeString()}`;
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
					root.title = "DeepSeek 用量监控: " + msg;
				}
			}

			/** @returns {Promise<void>} */
			async function refresh() {
				if (inFlight || disposed) return;
				inFlight = true;
				root.classList.add("dsu-loading");
				refreshBtn.classList.add("dsu-spin");
				try {
					const res = await fetch("/api/deepseek-usage", { headers: { Accept: "application/json" }, cache: "no-store" });
					let data = null;
					try {
						data = await res.json();
					} catch {
						data = { ok: false, error: { code: "BAD_RESPONSE", message: `HTTP ${res.status}` } };
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

			// ── config panel ─────────────────────────────────────────────────────
			let panel = null;

			/** Toggle the config panel; builds its form from the server config. */
			function openConfigPanel() {
				if (panel) { panel.remove(); panel = null; return; }
				panel = el("div", "dsu-panel");
				const r = root.getBoundingClientRect();
				panel.style.left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - 370)) + "px";
				panel.style.top = Math.max(8, r.bottom + 8) + "px";

				const title = el("h3", null, "DeepSeek 用量 · 设置");
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
					provField.append(el("label", null, "厂商（用量/余额来源）"));
					const provSel = document.createElement("select");
					const provOpts = [
						{ value: "deepseek", label: "DeepSeek" },
						{ value: "zhipu", label: "智谱 (bigmodel.cn)" }
					];
					for (const o of provOpts) {
						const opt = document.createElement("option");
						opt.value = o.value;
						opt.textContent = o.label;
						if (cfg.provider === o.value) opt.selected = true;
						provSel.append(opt);
					}
					provField.append(provSel, el("div", "dsu-p-hint", "智谱需配置 ZHIPU_API_KEY（bigmodel.cn 原生 key）；DeepSeek 用 DEEPSEEK_API_KEY。"));
					fields.push({ key: "provider", input: provSel, isSelect: true });
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
					fields.push({ key: "refreshIntervalMs", input: sel, isSelect: true });
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
							const v = f.isSelect ? Number(f.input.value) : Number(f.input.value);
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
				window.removeEventListener("resize", onResize);
				if (panel) { panel.remove(); panel = null; }
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
