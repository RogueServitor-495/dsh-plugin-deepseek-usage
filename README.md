# dsh-plugin-deepseek-usage

在 dsh Web 界面顶端显示 LLM **当日 token 使用量｜计费/套餐额度｜余额** 的插件。**自动跟随当前会话所选模型**切换计费面：DeepSeek 模型显示 token 数/估算费用/余额，glm-coding-plan（智谱）与 kimi-coding（Kimi For Coding）套餐显示 5 小时额度、周额度（老套餐无此窗口）、重置时间与已用 token 数。

## 功能

页面顶部固定显示一条紧凑的悬浮胶囊条（top bar）：

| 分段 | 内容 | 数据来源 |
|---|---|---|
| 今日用量 | 当日总 token（输入/输出/缓存命中，悬停查看明细） | 会话存储中 `assistant/message` 事件携带的 provider 上报 usage |
| 今日费用 / 套餐 | DeepSeek：当日预估费用（人民币，峰谷拆分）；智谱：套餐名 + 版本徽标 | 用量 × 可配置峰谷单价 / 智谱 subscription 接口 |
| 余额 / 额度 | DeepSeek：账户余额；智谱：5 小时额度百分比（悬停查看周/月额度 + 现金/资源包） | 各厂商余额/配额接口 |

- **自动切换计费显示**（`provider: "auto"`，默认）：浏览器端通过 dsh 的 sessions / modelDirectories 服务跟踪当前会话与所选模型，服务端按模型映射计费厂商（deepseek*→DeepSeek、glm*/zai→智谱、kimi*/k3→Kimi）；切换会话或模型后胶囊自动换面，未识别的模型只统计 token（余额显示 —）。
- **可展开统计面板**：点击胶囊上的 📊 图标展开「今日用量统计」——套餐额度进度条（已用/剩余/重置时间）+ 当日**各模型** token 明细表（输入/输出/缓存/请求数/估算费用，当前模型高亮），合计行与数据来源标注。
- 自动刷新间隔可配置（默认 5 分钟，面板可选 1 分钟~1 小时）；点击胶囊右侧 ↻ 手动刷新（页面重新可见时**不会**自动刷新）。
- 可**自由拖拽**改变位置（按视口比例记忆，刷新/重启/窗口缩放后保持相对位置，不会拖出屏幕）。
- 点击胶囊上的 ⚙ 打开**配置面板**：厂商、峰谷单价、高峰窗口、汇率、刷新间隔均可调，保存后立即生效。
- 接口密钥复用 dsh 的凭据服务（`DEEPSEEK_API_KEY` / `ZHIPU_API_KEY` / `KIMI_CODING_API_KEY` 或 `KIMI_API_KEY`），不会暴露到浏览器。

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

DeepSeek 自 2026-08-17 起对 V4 系列 API 采用**峰谷分级计价**（人民币，元 / 每百万 token），并取消统一计费。**内置默认价取自官方文档** <https://api-docs.deepseek.com/zh-cn/quick_start/pricing/>：

- **高峰时段**（北京时间 09:00–12:00、14:00–18:00）：价格为空闲时段的 2 倍；
- **空闲时段**：其余时间，价格为高峰的一半；
- 每个请求按**发生时刻**落入对应时段计费，费用=高峰部分 + 空闲部分分别累加；
- 顶部胶囊会显示当前时段徽标（高峰红色 / 闲时绿色），悬停费用可查看峰谷拆分。

**官方默认单价（元 / 每百万 token）**：

| 模型 | 项目 | 空闲时段 | 高峰时段 |
|---|---|---|---|
| deepseek-v4-flash | 输入（缓存命中） | ¥0.05 | ¥0.10 |
| deepseek-v4-flash | 输入（缓存未命中） | ¥1.50 | ¥3.00 |
| deepseek-v4-flash | 输出 | ¥4.50 | ¥9.00 |
| deepseek-v4-pro | 输入（缓存命中） | ¥0.15 | ¥0.30 |
| deepseek-v4-pro | 输入（缓存未命中） | ¥4.50 | ¥9.00 |
| deepseek-v4-pro | 输出 | ¥13.50 | ¥27.00 |

> 以上价格直接来自官方定价页（2026-08-17 生效，模型版本 Flash-0731 / Pro-0813）。官方调整价格后，在 ⚙ 配置面板按模型修改即可；代码级默认值在 `lib/config.js` 的 `defaultModels()`。

## 多厂商支持（DeepSeek / 智谱 / Kimi）

插件支持**自动跟随当前会话模型**（默认 `auto`）或手动固定厂商，顶部胶囊按厂商展示不同的账户信息：

| 厂商 | 余额/账户 | 用量/额度 | 凭据 |
|---|---|---|---|
| **DeepSeek** | 现金余额（官方 `/user/balance`） | 无官方配额 API，用量来自会话事件统计 | `DEEPSEEK_API_KEY` |
| **智谱 (bigmodel.cn)** | 现金余额 + token 资源包 | **Coding Plan 套餐**：5 小时/周/月额度窗口（百分比 + 重置时间）、套餐名与版本 | `ZHIPU_API_KEY`（bigmodel.cn 原生 key） |
| **Kimi For Coding (api.kimi.com)** | 订阅制（无现金余额，显示会员档位） | **kimi-coding 套餐**：5 小时额度、周额度（老套餐没有该窗口）、重置时间 | `KIMI_CODING_API_KEY` 或 `KIMI_API_KEY` |

**auto 模式的模型→厂商映射**：provider id 含 kimi/moonshot 或模型名 k3/kimi* 等 → Kimi；provider id 含 zai/zhipu/glm 或模型名 glm* → 智谱；deepseek* → DeepSeek；其余（如自建网关）→ 仅统计 token。当前会话无模型上下文时回退 DeepSeek（保持旧行为）。

智谱套餐支持识别**套餐版本**：`subscription` 接口的 `productName` 带「历史版本 V1 / 历史版本 V2」字样时，胶囊会显示版本徽标（V1 / 老套餐无周额度窗口）；Kimi 侧通过 `GET /coding/v1/usages` 的 `usage`（周额度）与 `limits[]`（5 小时滑动窗口）归一化，`user.membership.level` 映射会员档位。

在 ⚙ 配置面板选择「计费厂商」并保存即可固定；选择「自动（跟随当前会话模型）」恢复自动切换。

> 智谱接口说明：Coding Plan 配额 `GET /api/monitor/usage/quota/limit`、套餐 `GET /api/biz/subscription/list`、现金账户 `GET /api/biz/account/query-customer-account-report`、资源包 `GET /api/biz/tokenAccounts/list/my`，认证用**原始 API key**（无 Bearer 前缀）。

## 为延时执行插件提供配额数据

本分支（`feat/quota-data-service`）只做一件事：把本插件掌握的**配额数据**以 cordis 服务的形式暴露给延时执行插件（`dsh-plugin-quota-resume`），后者据此实现「额度打满 → 等重置 → 自动续跑」。

### 提供的服务：`deepseekUsageQuota`

插件加载后在 host 作用域 `ctx.provide("deepseekUsageQuota", ...)` 注册，消费方用 `ctx.get("deepseekUsageQuota")` 可选读取（**无硬依赖**：未安装本插件时延时插件回退到固定延迟）。服务包含三个方法：

| 方法 | 说明 |
|---|---|
| `mapProvider(providerHint)` | 把失败请求的路由 provider id（如 `kimi-coding`、`litellm`）映射为计费 provider（`kimi`/`zhipu`/`deepseek`），无法识别返回 `null` |
| `resolveApiKey(providerId)` | 通过 dsh 凭据 seam 解析该 provider 的 API key（60s 缓存），未配置返回 `null` |
| `fetchQuotaWindows(providerId, key)` | 调 provider 配额接口，返回归一化的额度窗口数组，每项含 `used`/`limit`/`resetsAt`（重置时间戳）；失败返回 `null` |

### 为什么这样拆

- 延时执行的**触发与唤醒逻辑**（`agent/request-error` 监听、持久化记录、定时器、`Agent.followup()` 续跑）与 provider 无关，独立成插件便于单独开发/测试/开关；
- 配额数据的**获取与归一化**（各厂商接口、凭据、窗口换算）已经在本插件的 provider adapter 里实现，作为服务复用，避免两处维护同一套接口逻辑；
- 双方通过公开 cordis 服务解耦：usage 插件只负责“数据”，延时插件只负责“行为”。

### 加载顺序

`cordis.patch.yml` 中 `dsh-plugin-quota-resume` 的行必须排在 `dsh-plugin-deepseek-usage` 之后（消费方晚于提供方注册）。

## 配置面板（插件自带）

> 说明：dsh 当前的设置（Settings）页只暴露内置 namespace，第三方插件暂无法注册配置页（dsh 待办功能）。因此本插件**自带配置面板**：点击悬浮胶囊条上的 ⚙ 图标打开。

| 字段 | 说明 | 默认值 |
|---|---|---|
| provider | 计费厂商：`auto`（跟随当前会话模型）/ deepseek / zhipu / kimi | auto |
| models | **按模型分别计价**：每个模型独立的 peak / offPeak 单价（元 / 百万 token）；可添加/移除模型 | deepseek-v4-flash、deepseek-v4-pro 两档 |
| peakWindows | 高峰时段窗口（startHour / endHour，北京时间）——**任意数量，可增删**，删到 0 表示全天闲时 | 09–12、14–18 |
| usdCny | CNY→USD 参考汇率（仅费用换算显示用） | 7.15 |
| refreshIntervalMs | 悬浮胶囊自动刷新间隔 | 5 分钟 |

- **按模型计费**：request/header 事件携带模型 ID（如 deepseek-v4-flash / deepseek-v4-pro），插件按会话跟踪模型，assistant/message 用量落入对应模型桶，费用按各自单价计算；未配置的模型回退到第一个已配置模型。
- **保存后立即生效**（live）：下次请求即按新单价/新窗口重新计费；修改窗口会清空当日账本并自动重建基线；
- **恢复默认**：一键重置为内置默认价；
- 配置持久化到 dsh home 下的 deepseek-usage-config.json；部分修改（如只改某模型的 offPeak.output）时其余字段自动保持默认价。

## 悬浮窗位置（相对定位）

胶囊条位置以**视口比例**存储（localStorage），而非绝对像素：

- 拖拽到任意位置后，位置按「距视口左上角的百分比」记忆；
- **窗口缩放 / 调整大小时，胶囊条按比例自动适配**，始终保持在视口内的相对位置；
- 默认位置：顶部居中（水平 50%，垂直 2%）。

> 默认单价直接采用官方定价页（见上表）；费用为按单价的本地估算，实际扣费以 DeepSeek 账单为准。官方实时价格见 <https://api-docs.deepseek.com/zh-cn/quick_start/pricing/>；价格变动时在 ⚙ 配置面板按模型更新即可。

## 接口返回示例

> v0.6 起响应新增：`provider` / `providerName` / `providerAuto`（计费面与是否自动跟随）、`model` / `sessionId`（当前会话上下文）、`quotas`（套餐额度窗口，含 `resetsAt` 重置时间）、`usageByModel`（当日各模型 token 明细）、`cost.byModel`（各模型估算费用，`estimated: true` 表示该模型未配置单价、按回退费率估算）、`accountError`（余额/额度查询失败时的降级信息，用量数据仍正常返回）。请求可带 `?sessionId=&model=&providerHint=` 供 auto 模式解析当前会话模型。

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
