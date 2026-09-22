<p align="center">
  <img src="public/favicon.svg" alt="Spot Scout" width="88" height="88" />
</p>

<h1 align="center">币喵雷达 · Spot Scout</h1>

<p align="center">
  <strong>点击一次，只给你一个候选人。</strong>
</p>

<p align="center">
  <a href="#quick-start"><img alt="Tests" src="https://img.shields.io/badge/tests-249%20unit%20%2B%2028%20e2e-brightgreen" /></a>
  <img alt="Strategy version" src="https://img.shields.io/badge/strategy-1.0.0-blue" />
  <img alt="License" src="https://img.shields.io/badge/license-MIT-lightgrey" />
</p>

<p align="center">
  <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/279458179/binance-spot-scout">
    <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare" />
  </a>
</p>

---

Spot Scout 是一个面向 Binance USDT 现货的 1 日内中短线扫描器。它不会简单地从 24 小时涨幅榜里挑第一名，而是综合分析趋势、动量、成交量、流动性、入场结构和追高风险，从市场中筛选一个当前结构相对合理的候选。如果没有合格机会，它会告诉你：今天先不出手。

> **截图 / GIF 占位**：把首页运行截图放到 `docs/screenshot.png` 并替换这一行即可。

## Features

- **一次只给一个答案** — `ENTRY_NOW` / `WAIT_PULLBACK` / `NO_TRADE` 三选一，不丢给你一长串列表。
- **硬性风险闸门** — 九条否决规则独立于评分存在，`Risk Gate > Score`：闸门不过，分数再高也不会推荐。
- **可解释的 100 分模型** — 七个分项全部展示，能点开看到每一项拿了多少分、扣了多少分。
- **真实行情** — 只读 Binance 公开现货接口（`exchangeInfo` / `24hr ticker` / `bookTicker` / `klines`），无需 API Key，不接账户权限。
- **分阶段漏斗** — 全市场 → USDT 现货 → 流动性过滤 → Top 100~120 → 15m+1h → Top 15 → 深度分析 → Top 1，避免对每个币都请求四套 K 线。
- **实时追踪** — 对选出的标的用 WebSocket 最优买卖价盯住距离 `+5%` 目标还有多远。
- **历史留痕** — 每次扫描（含 `NO_TRADE`）都写进 D1，`/history` 可以看到这个算法到底准不准。
- **免费部署** — 一个 `wrangler.jsonc` 覆盖 Static Assets + Worker + KV + D1 + Cron，Fork 后几步就能跑起自己的实例。

## How it works

```
Binance 全市场
      ↓
USDT 现货（排除稳定币互换、杠杆代币、非 TRADING）
      ↓
基础过滤（SymbolInfo 状态 / quoteAsset）
      ↓
流动性过滤（24h 成交额 ≥ 5M USDT、盘口价差 ≤ 0.6%）
      ↓
Top 100~120
      ↓
15m + 1h 分析（EMA 结构、斜率、RSI 窗口、偏离 ATR）
      ↓
Top 15
      ↓
5m + 4h 深度分析 → 形态识别 → 支撑/压力 → 评分
      ↓
风险闸门（九条否决）
      ↓
Top 1
      ↓
ENTRY_NOW / WAIT_PULLBACK / NO_TRADE
```

## Strategy

### Scoring

| 分项 | 满分 | 主要判据 |
| --- | ---: | --- |
| Trend（趋势结构） | 25 | 1h 与 15m 的 EMA9 > EMA21 > EMA55、EMA21 斜率向上、抬高的高点与低点 |
| Momentum（动能） | 20 | 15m RSI 落在健康区间、MACD 柱状体为正且仍在放大 |
| Volume（量能） | 15 | 现量 / 20 周期均量、收盘价是否站上 VWAP |
| Entry Structure（入场位置） | 15 | 距离 EMA21 的 ATR 倍数、形态优先级（A > B > C） |
| Liquidity（流动性） | 10 | 24h 成交额档位、盘口价差是否处于优选区 |
| Risk / Reward（盈亏比） | 10 | 到压力位的空间是否够 5%、失效距离是否落在 0.8~2.5 ATR |
| BTC Regime（市场环境） | 5 | BTC 风险偏好回升 +5 / 中性 0 / 风险规避 −5 |

```
Trend             25
Momentum          20
Volume            15
Entry Structure   15
Liquidity         10
Risk / Reward     10
BTC Regime         5
----------------------
Total            100
```

**为什么是这个币**：每个分项都随结果一起返回（`score` 字段），首页可以展开「查看评分拆解」逐项核对，`/debug` 会展示内部 Top 20 候选与各自的扣分原因 —— 不是黑盒推荐。

### Penalty Engine

只减不加，独立于正向评分：RSI ≥ 82（−15）/ > 75（−8）、偏离 EMA21 超过 3 ATR（−12）/ 2 ATR（−6）、单根 15m 涨幅 ≥ 7%（−8）、24h 涨幅 ≥ 20%（−5）、上影线占比 ≥ 45%（−6）、ATR% 极端（−5）。

### Risk Gate

九条否决规则，任意一条命中即禁止 `ENTRY_NOW`：价差过宽、RSI 极端超买、BTC 快速下跌、上影线过大、距离 EMA21 太远、24h 极端拉升、流动性不足、数据过期、数据不完整。闸门永远优先于评分。

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

无需任何环境变量即可本地运行 —— 默认直连 Binance 公开行情。

```bash
npm test             # 249 个单元 / 集成用例
npm run test:e2e     # 28 个 Playwright 用例（决策流 + 375/390/430/768/1440 响应式）
npm run typecheck
npm run lint
npm run build
```

## Local Development

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | Vite + Cloudflare 插件，本地跑起 Worker 与前端 |
| `npm run build` | 类型检查 + 产出 `dist/client` 与 Worker bundle |
| `npm run backtest` | 用历史 K 线回放策略（无未来函数） |
| `npm run smoke-test` | 对真实接口跑一次最小链路自检 |

开发模式下 `/debug` 可访问，生产环境由 `ENABLE_DEBUG=false` 隐藏。

## Cloudflare Deployment

### 方式一：Deploy 按钮

点击顶部 **Deploy to Cloudflare**，Cloudflare 会引导你创建 KV 与 D1 资源并写入绑定。

### 方式二：手动

```bash
npx wrangler kv namespace create SCAN_CACHE
npx wrangler d1 create spot_scout_db
npx wrangler d1 migrations apply spot_scout_db --remote
```

把返回的两个 id 填进 `wrangler.jsonc`（`kv_namespaces[0].id`、`d1_databases[0].database_id`），然后：

```bash
npm run deploy
```

`wrangler.jsonc` 已包含 Static Assets、Worker、KV、D1 与 2 分钟一次的 Cron，Cloudflare Workers Builds 连接仓库后 push 即自动 Build & Deploy。

> **地域限制提示（重要）**：Binance 会按网段拒绝请求（HTTP 451 / 403），
> 官方公开镜像在部分数据中心出口上完全不可达。本项目内置
> `data-api.binance.vision` → `api.binance.com` → `api.binance.us` 的依次回退，
> 并把被拒的域名放进冷却名单以免拖慢扫描。
>
> 需要注意：回退到的 **US 场地流动性远低于全球主站**（其最深的 `BTCUSDT`
> 24h 成交额约 4–5M USDT），而策略的流动性下限是硬性的 **5M USDT**
> （见 [Strategy](#strategy) 与 `SCAN_CONFIG.minQuoteVolume24h`）。因此**部署在受限
> 网段时，扫描会如实返回 `NO_TRADE`，并说明“没有标的达到成交额下限”** ——
> 这是风控在正常工作，而不是接口故障。本项目**不会**为了产出信号而自动放宽这个
> 下限：低流动性带来的滑点正是策略要规避的风险。
>
> 想让扫描真正筛出候选，请让 Worker 能访问全球主站（把 `BINANCE_BASE_URLS`
> 指向一个可用的镜像或自建代理）：
>
> ```bash
> npx wrangler secret put BINANCE_BASE_URLS   # 或写进 wrangler.jsonc 的 vars
> # 例：https://data-api.binance.vision,https://api.binance.com
> ```

## Configuration

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `ENABLE_DEBUG` | `false` | 生产环境是否暴露 `/debug` 与 `diagnostics` |
| `STRATEGY_VERSION` | `1.0.0` | 写入每次扫描结果与 D1，便于跨版本比较 |
| `BINANCE_BASE_URLS` | 见上 | 可选，逗号分隔的行情站点列表 |

`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` 只用于 CLI 部署，不要提交到仓库（`.env.example` 仅有变量名）。

## Backtest

`npm run backtest` 按时间切片回放：扫描 10:00 的那一轮只使用 10:00 之前的数据，不含未来函数。回测结果写入 `scan_results` 表，记录信号之后 5m / 1h / 6h / 24h 的价格、最大涨幅与最大回撤，以及 `+5%` 目标是否命中。

## FAQ

**它会不会替我下单？**
不会。V1 只读公开行情，不接入任何账户权限，也不存在买卖 / 提现 / 划转接口。

**为什么经常显示「今天不出手」？**
因为闸门和分数都是有意收紧的。筛选器宁可空仓，也不把追高的标的塞给你。

**`ENTRY_NOW` 是可以买的意思吗？**
不是。它表示「当前结构值得关注」，是研究结论而非投资建议，请自行判断并控制风险。

**可以换成别的交易所吗？**
V1 只做 Binance USDT 现货。行情站点可通过 `BINANCE_BASE_URLS` 指向镜像，但数据结构必须与 Binance 现货一致。

## Disclaimer

本项目仅为行情研究工具，不构成任何投资建议，不接入下单权限。加密资产波动极大，请自行承担风险。

## Roadmap

- V1（当前）：只读行情、单候选、三态决策、历史留痕
- V2（规划）：可选的交易连接器，必须由 Feature Flag 显式开启，默认关闭

## License

[MIT](LICENSE)
