window.__ModuleLoader__.load({
	id: "dsh-plugin-deepseek-usage",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		/** Cordis plugin name. */
		const name = "deepseek-usage";
		/** No injected services: the bar only talks to the same-origin API route. */
		const inject = [];

		const STYLE_ID = "dsh-plugin-deepseek-usage/client.css";
		const CSS = [
			".dsu-root{position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:2147483000;display:flex;align-items:center;gap:0;box-sizing:border-box;max-width:min(92vw,720px);height:28px;padding:0 6px 0 12px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08));background:var(--dsw-alias-bg-overlay,rgba(255,255,255,.94));color:var(--dsw-alias-label-primary,#1f2329);box-shadow:0 4px 16px rgba(0,0,0,.12);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);font:12px/1.4 -apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,\"PingFang SC\",\"Microsoft YaHei\",sans-serif;user-select:none;cursor:grab;touch-action:none;transition:opacity .2s ease;animation:dsu-in .25s ease}",
			".dsu-root.dsu-dragging{cursor:grabbing;opacity:.95}",
			".dsu-root.dsu-hidden{opacity:0;pointer-events:none}",
			"@keyframes dsu-in{from{opacity:0;transform:translate(-50%,-6px)}to{opacity:1;transform:translate(-50%,0)}}",
			".dsu-seg{display:flex;align-items:baseline;gap:5px;white-space:nowrap}",
			".dsu-label{color:var(--dsw-alias-label-secondary,#646a73);font-size:11px}",
			".dsu-value{font-weight:600;font-variant-numeric:tabular-nums}",
			".dsu-value.dsu-tokens{color:var(--dsw-alias-label-primary,#1f2329)}",
			".dsu-value.dsu-cost{color:var(--dsw-alias-state-business-primary,#2563eb)}",
			".dsu-value.dsu-balance{color:var(--dsw-alias-state-success-primary,#1f883d)}",
			".dsu-value.dsu-balance.dsu-low{color:var(--dsw-alias-state-error-primary,#d1242f)}",
			".dsu-value.dsu-error{color:var(--dsw-alias-state-error-primary,#d1242f)}",
			".dsu-div{width:1px;height:14px;margin:0 9px;background:var(--dsw-alias-border-l1,rgba(0,0,0,.12))}",
			".dsu-refresh{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;margin-left:6px;padding:0;border:none;border-radius:999px;background:transparent;color:var(--dsw-alias-label-tertiary,#9aa0a6);cursor:pointer;font-size:13px;line-height:1}",
			".dsu-refresh:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,#1f2329)}",
			".dsu-refresh.dsu-spin svg{animation:dsu-spin .6s linear infinite}",
			"@keyframes dsu-spin{to{transform:rotate(360deg)}}",
			".dsu-root.dsu-loading .dsu-value:not(.dsu-ok){color:var(--dsw-alias-label-tertiary,#9aa0a6)}"
		].join("");

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
			segTokens.append(el("span", "dsu-label", "今日用量"), vTokens);
			segCost.append(el("span", "dsu-label", "今日费用"), vCost);
			segBalance.append(el("span", "dsu-label", "余额"), vBalance);

			const refreshBtn = el("button", "dsu-refresh");
			refreshBtn.type = "button";
			refreshBtn.title = "刷新";
			refreshBtn.innerHTML =
				'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>';

			root.append(segTokens, el("span", "dsu-div"), segCost, el("span", "dsu-div"), segBalance, refreshBtn);
			document.body.appendChild(root);

			// ── free drag repositioning ─────────────────────────────────────────
			const POS_KEY = "dsh-plugin-deepseek-usage/pos";
			const DRAG_MARGIN = 4;
			let dragging = false;

			/** Clamp a top-left position so the bar stays fully on screen. */
			function clampPos(x, y) {
				const rect = root.getBoundingClientRect();
				const maxX = Math.max(DRAG_MARGIN, window.innerWidth - rect.width - DRAG_MARGIN);
				const maxY = Math.max(DRAG_MARGIN, window.innerHeight - rect.height - DRAG_MARGIN);
				return {
					x: Math.min(Math.max(DRAG_MARGIN, x), maxX),
					y: Math.min(Math.max(DRAG_MARGIN, y), maxY)
				};
			}

			/** Apply an explicit top-left position (switches off the centered default). */
			function applyPos(x, y) {
				root.style.left = Math.round(x) + "px";
				root.style.top = Math.round(y) + "px";
				root.style.transform = "none";
			}

			// restore a previously dragged position
			try {
				const saved = JSON.parse(localStorage.getItem(POS_KEY) || "null");
				if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
					const p = clampPos(saved.x, saved.y);
					applyPos(p.x, p.y);
					root.style.animation = "none"; // no entrance animation when restoring
				}
			} catch { /* ignore corrupt saved state */ }

			root.addEventListener("pointerdown", (event) => {
				if (disposed) return;
				// the refresh button keeps its own click; never start a drag on it
				const target = event.target;
				if (target && typeof target.closest === "function" && target.closest(".dsu-refresh")) return;
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
					const p = clampPos(originX + (moveEvent.clientX - startX), originY + (moveEvent.clientY - startY));
					applyPos(p.x, p.y);
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
					try {
						localStorage.setItem(POS_KEY, JSON.stringify({ x: rect.left, y: rect.top }));
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
					vTokens.textContent = fmtTokens(u.totalTokens || 0);
					vTokens.classList.add("dsu-ok");
					vTokens.title = [
						`今日token使用量 (${data.day ?? ""})`,
						`输入: ${fmtTokens(u.inputTokens || 0)}`,
						`输出: ${fmtTokens(u.outputTokens || 0)}`,
						`缓存命中: ${fmtTokens(u.cacheReadTokens || 0)}`,
						`请求数: ${u.requests || 0}`
					].join("\n");
					vCost.textContent = fmtMoney((data.cost && data.cost.cny) || 0, "CNY");
					vCost.classList.add("dsu-ok");
					vCost.title = `USD: $${((data.cost && data.cost.usd) || 0).toFixed(6)}`;
					const b = data.balance || {};
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
				} catch (error) {
					render({ ok: false, error: { code: "NETWORK", message: String(error && error.message || error) } });
				} finally {
					inFlight = false;
					root.classList.remove("dsu-loading");
					refreshBtn.classList.remove("dsu-spin");
				}
			}

			refreshBtn.addEventListener("click", (event) => {
				event.stopPropagation();
				refresh();
			});
			const onVisibility = () => {
				if (document.visibilityState === "visible") refresh();
			};
			document.addEventListener("visibilitychange", onVisibility);
			timer = setInterval(refresh, 60_000);

			ctx.effect(() => () => {
				disposed = true;
				clearInterval(timer);
				document.removeEventListener("visibilitychange", onVisibility);
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
