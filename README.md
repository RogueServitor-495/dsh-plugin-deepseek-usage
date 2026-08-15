# dsh-plugin-deepseek-usage

在 dsh Web 界面顶端显示 DeepSeek API 的**当日 token 使用量｜计费｜余额** 的插件。

## 功能

页面顶部固定显示一条紧凑的悬浮胶囊条（top bar）：

| 分段 | 内容 | 数据来源 |
|---|---|---|
| 今日用量 | 当日总 token（输入/输出/缓存命中，悬停查看明细） | 会话存储中 `assistant/message` 事件携带的 provider 上报 usage |
| 今日费用 | 当日预估费用（人民币，悬停查看 USD） | 用量 × 可配置单价 |
| 余额 | DeepSeek 账户当前余额（悬停查看充值/赠送明细） | 官方公开接口 `GET https://api.deepseek.com/user/balance` |

- 每 60 秒自动刷新；页面重新可见时立即刷新；点击胶囊右侧 ↻ 手动刷新。
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

- **服务端**（`lib/index.js`）：在 dsh web server 上注册 `GET /api/deepseek-usage`；用凭据 seam 解析 `DEEPSEEK_API_KEY`，调用官方余额接口（60s 缓存）；通过 `ctx.sessionQuery` 枚举所有会话（含已持久化的 zstd 日志），汇总当日 `assistant/message` 的 provider 上报 usage，并按单价估算费用。
- **浏览器端**（`lib/client.js`）：零依赖 bundle，`window.__ModuleLoader__.load` 注册，直接向同源 `/api/deepseek-usage` 拉取并渲染固定顶部胶囊。

## 计费单价（可调）

默认按 deepseek-v4-flash 现行刊例价（美元 / 每百万 token）：

| 项目 | 单价 |
|---|---|
| 输入（缓存未命中） | $0.14 / 1M |
| 输入（缓存命中） | $0.0028 / 1M |
| 输出 | $0.28 / 1M |
| USD→CNY 估算汇率 | 7.15 |

> 单价与汇率为估算值，非官方账单。官方实时价格见 <https://api-docs.deepseek.com/quick_start/pricing>。修改 `lib/usage.js` 中的 `DEFAULT_PRICING` 即可调整。

## 接口返回示例

```json
{
  "ok": true,
  "fetchedAt": 1755240000000,
  "day": "2026-08-15",
  "currency": "CNY",
  "balance": { "isAvailable": true, "totalBalance": "51.40", "grantedBalance": "0.00", "toppedUpBalance": "51.40" },
  "usage": { "inputTokens": 12345, "outputTokens": 6789, "cacheReadTokens": 3210, "cacheWriteTokens": 0, "reasoningTokens": 111, "totalTokens": 22344, "requests": 42 },
  "cost": { "usd": 0.003654, "cny": 0.026126 },
  "pricing": { "inputCacheMiss": 0.14, "inputCacheHit": 0.0028, "output": 0.28, "usdCny": 7.15 },
  "sessionsScanned": 12,
  "sessionsFailed": 0
}
```

## 说明与限制

- 官方公开 API 仅提供余额接口；「今日用量/计费」来自本机 dsh 会话记录的真实 provider 上报 usage（经同一 API key 产生），是最接近平台账单的本地口径。
- 平台站点的详细用量/费用接口（`platform.deepseek.com/api/v0/usage/*`）需要浏览器登录态 token，API key 无法访问，故不采用。
- 请求数 `requests` 为当日带 usage 上报的 assistant 消息条数。

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
