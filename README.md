# dsh-plugin-deepseek-usage

在 dsh Web 界面顶端显示 DeepSeek API 的**当日 token 使用量｜计费｜余额** 的插件。

## 功能

页面顶部固定显示一条紧凑的悬浮胶囊条（top bar）：

| 分段 | 内容 | 数据来源 |
|---|---|---|
| 今日用量 | 当日总 token（输入/输出/缓存命中，悬停查看明细） | 会话存储中 `assistant/message` 事件携带的 provider 上报 usage |
| 今日费用 | 当日预估费用（人民币，按峰谷时段拆分计价，悬停查看高峰/闲时明细与 USD） | 用量 × 可配置峰谷单价 |
| 余额 | DeepSeek 账户当前余额（悬停查看充值/赠送明细） | 官方公开接口 `GET https://api.deepseek.com/user/balance` |

- 每 5 分钟自动刷新；点击胶囊右侧 ↻ 手动刷新（页面重新可见时**不会**自动刷新，避免后台扫描拖慢服务器）。
- 可**自由拖拽**改变位置（拖到任意位置，位置记忆在 localStorage；刷新/重启后保持，不会拖出屏幕）。
- 接口密钥复用 dsh 的凭据服务（`DEEPSEEK_API_KEY`，即 Web「模型设置」页写入的 key），不会暴露到浏览器。

## 安装

```sh
# 1) 把本包安装进 web profile（在仓库根目录执行）
dsh plugin --profile web add file:/absolute/path/to/dsh-plugin-deepseek-usage

# 2) 在 ~/.dsh/profiles/web/cordis.patch.yml 末尾追加：
# - insert:
#     - id: deepseek-usage
#       name: 'dsh-plugin-deepseek-usage'

# 3) 重启 web 服务
dsh web
```

> 说明：本包不声明 `dsh.bundle`，因此不会加入 profile 的 bundle 层；它通过
> `cordis.patch.yml` 作为普通插件行挂载，服务端行 + `dsh.client` 声明让浏览器端
> 一并加载。

## 工作原理

- **服务端**（`lib/index.js`）：在 dsh web server 上注册 `GET /api/deepseek-usage`；用凭据 seam 解析 `DEEPSEEK_API_KEY`，调用官方余额接口（60s 缓存）；当日用量由**增量记账**提供（见下），按请求发生时刻的峰谷单价分别估算费用。
- **浏览器端**（`lib/client.js`）：零依赖 bundle，`window.__ModuleLoader__.load` 注册，直接向同源 `/api/deepseek-usage` 拉取并渲染固定顶部胶囊。

## 增量记账（核心设计）

插件**不再每次请求都扫描会话日志**，而是实时记账：

1. **事件订阅**：通过 `ctx.on("session/event")` 订阅每个会话的实时事件；`assistant/message` 携带的 provider usage 直接累加进内存账本（O(1) 算术，无解析/无重放）。
2. **按天分桶**：账本按本地日期分桶，同时按高峰/闲时窗口拆分，与计费口径一致。
3. **持久化**：账本节流落盘到 dsh home 下的 `deepseek-usage-ledger.json`（默认每 30 秒，原子写）；重启后从文件恢复，**当日数据存在则完全免扫描**。
4. **查询 O(1)**：API 直接读内存账本，毫秒级返回。

**全量扫描仅作为兜底**，且只发生一次：

- 首次启动（无账本文件），或
- 跨天后当日无记录，或
- 修改了高峰窗口（账本分桶不再匹配，清空重建）

兜底扫描仍保持之前的防护：单飞（并发复用一次）、每个会话 15 秒读取超时（`SESSION_READ_TIMEOUT_MS`）、被其它实例持续写入的会话跳过（`sessionsSkipped`）。

> 提示：接口返回 `fromLedger: true` 表示本次数据来自实时账本（零扫描），胶囊条悬停也会标注「实时增量」/「会话扫描」。

## 计费策略（2026-08-17 起，DeepSeek 峰谷分级计价）

DeepSeek 自 2026-08-17 起对 V4 系列 API 采用**峰谷分级计价**（人民币，元 / 每百万 token），并取消统一计费。本插件已按此策略重写：

- **高峰时段**（北京时间 09:00–12:00、14:00–18:00）：价格为空闲时段的 2 倍；
- **空闲时段**：其余时间，价格为高峰的一半；
- 每个请求按**发生时刻**落入对应时段计费，费用=高峰部分 + 空闲部分分别累加；
- 顶部胶囊会显示当前时段徽标（高峰红色 / 闲时绿色），悬停费用可查看峰谷拆分。

## 配置界面（Web 设置页）

插件注册了 `deepseek-usage` 设置项，在 dsh Web **设置（Settings）页**自动渲染为表单，无需改代码即可调整计费策略：

| 字段 | 说明 | 默认值 |
|---|---|---|
| peak 输入/输出单价 | 高峰时段（默认北京时间 09:00–12:00、14:00–18:00）单价，元 / 百万 token | 0.10 / 3.00 / 9.00 |
| offPeak 输入/输出单价 | 空闲时段单价，元 / 百万 token | 0.05 / 1.50 / 4.50 |
| peakWindows | 高峰时段窗口（startHour / endHour，北京时间，可增删） | 09–12、14–18 |
| usdCny | CNY→USD 参考汇率（仅费用换算显示用） | 7.15 |
| model / currency | 计费模型标识与币种（展示用） | deepseek-v4-flash / CNY |

- 修改后**立即生效**（live）：下次请求即按新单价/新窗口重新计费，无需重启；
- 部分修改（如只改 offPeak.output）时其余字段自动保持官方默认价，不会误置为 0；
- 未在设置页配置时使用内置默认价（即上表）。

> 价格为估算值，非官方账单；官方实时价格见 <https://api-docs.deepseek.com/quick_start/pricing>。代码级默认值在 `lib/usage.js` 的 `DEFAULT_PRICING` / `PEAK_WINDOWS`，设置页覆盖它们。

## 接口返回示例

```json
{
  "ok": true,
  "fetchedAt": 1755240000000,
  "day": "2026-08-17",
  "currency": "CNY",
  "balance": { "isAvailable": true, "totalBalance": "51.40", "grantedBalance": "0.00", "toppedUpBalance": "51.40" },
  "usage": { "inputTokens": 12345, "outputTokens": 6789, "cacheReadTokens": 3210, "cacheWriteTokens": 0, "reasoningTokens": 111, "totalTokens": 22344, "requests": 42, "byPeriod": { "peak": { "inputTokens": 5000, "outputTokens": 3000, "cacheReadTokens": 1000, "cacheWriteTokens": 0, "reasoningTokens": 50, "requests": 20 }, "offPeak": { "inputTokens": 7345, "outputTokens": 3789, "cacheReadTokens": 2210, "cacheWriteTokens": 0, "reasoningTokens": 61, "requests": 22 } } },
  "cost": { "cny": 0.120415, "usd": 0.016841, "peakCny": 0.067510, "offPeakCny": 0.052905 },
  "pricing": { "currency": "CNY", "model": "deepseek-v4-flash", "peak": { "inputCacheMiss": 3.0, "inputCacheHit": 0.1, "output": 9.0 }, "offPeak": { "inputCacheMiss": 1.5, "inputCacheHit": 0.05, "output": 4.5 }, "usdCny": 7.15 },
  "period": { "now": "offPeak", "windows": [ { "startHour": 9, "endHour": 12 }, { "startHour": 14, "endHour": 18 } ], "timezone": "Asia/Shanghai (UTC+8)" },
  "fromLedger": true,
  "sessionsScanned": 0,
  "sessionsFailed": 0,
  "sessionsSkipped": 0
}
```

## 说明与限制

- 官方公开 API 仅提供余额接口；「今日用量/计费」来自本机 dsh 会话记录的真实 provider 上报 usage（经同一 API key 产生），是最接近平台账单的本地口径。
- 平台站点的详细用量/费用接口（`platform.deepseek.com/api/v0/usage/*`）需要浏览器登录态 token，API key 无法访问，故不采用。
- 请求数 `requests` 为当日带 usage 上报的 assistant 消息条数。
- 峰谷时段按**北京时间（UTC+8）**判定（DeepSeek 官方口径），不随服务器时区变化；单日内跨时段的请求各自计入对应档位。
- 高峰/闲时单价与高峰窗口为估算值，实际账单以官方计费为准；官方调整价格时，在 Web 设置页的 `deepseek-usage` 表单中修改即可（代码默认值在 `lib/usage.js` 的 `DEFAULT_PRICING` / `PEAK_WINDOWS`）。

---

## 快速体验（无需改动 ~/.dsh 的独立实例）

本仓库自带一个可独立启动的 web 实例（`dsh-home/` 工作区 DSH home，端口 3081），插件已装好并正在运行：

```sh
# 启动（已在后台运行中：http://127.0.0.1:3081）
bash dev/start.sh
```

打开 <http://127.0.0.1:3081> 即可看到页面顶端的用量/费用/余额胶囊条。该实例复用主实例的凭据与今日会话快照（`dsh-home/sessions`），因此今日用量与主实例一致。

## 安装到主 profile（~/.dsh）

```sh
# 1) 安装依赖（在仓库目录执行，dsh 会把相对路径锚定到当前目录）
dsh plugin --profile web add file:/absolute/path/to/dsh-plugin-deepseek-usage

# 2) 在 ~/.dsh/profiles/web/cordis.patch.yml 追加：
- insert:
    - id: deepseek-usage
      name: 'dsh-plugin-deepseek-usage'

# 3) 重启 web 服务后生效（插件集合变更需重启）
```
