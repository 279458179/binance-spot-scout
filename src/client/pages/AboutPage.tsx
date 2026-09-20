import type { ReactNode } from "react";
import { motion } from "motion/react";
import { fadeInUp } from "@/client/animations/variants";
import { SCAN_CONFIG, STRATEGY_VERSION } from "@/config/strategy";
import { PATTERN_LABELS, SCORE_ITEMS } from "@/client/lib/labels";

const RULES = [
  {
    title: "趋势结构",
    body: "要求 EMA21 在 EMA55 之上，且两者都在向上，避免在下跌趋势里抄底。",
  },
  {
    title: "动能确认",
    body: "RSI 处在健康区间且不超买，MACD 柱状体不为负，确保价格是在被推动的。",
  },
  {
    title: "量能配合",
    body: "最近成交额相对基准放大，说明有真实资金参与，而不是无量空涨。",
  },
  {
    title: "入场位置",
    body: "价格贴近 EMA21 或刚完成回踩收回，避免在远离均线的高位追单。",
  },
  {
    title: "风险闸门",
    body: "BTC 处于风险规避状态时，总分再高也会被降级为观望，宁可不做。",
  },
] as const;

export function AboutPage(): ReactNode {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6">
      <motion.header variants={fadeInUp} initial="hidden" animate="show">
        <h1 className="text-xl font-semibold text-ink-100">策略说明</h1>
        <p className="mt-2 text-sm leading-6 text-ink-300">
          币喵雷达只做一件事：在 Binance 现货市场里，用一个可解释的七项打分模型，
          帮你把当天值得盯的形态找出来。它不预测涨跌，也不替你做决定。
        </p>
      </motion.header>

      <motion.div
        variants={fadeInUp}
        initial="hidden"
        animate="show"
        className="panel mt-5 px-4 py-4"
      >
        <p className="field-label">评分构成</p>
        <table className="mt-2 w-full text-sm">
          <tbody>
            {SCORE_ITEMS.map((item) => (
              <tr key={item.key} className="border-b border-night-700/60 last:border-0">
                <th
                  scope="row"
                  className="py-2 text-left text-xs font-medium text-ink-300"
                >
                  {item.label}
                </th>
                <td className="tabular py-2 text-right text-xs text-ink-100">
                  {item.max} 分
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-ink-400">
          七项相加为 100 分。结果里显示的「综合评分 X / 100」就是它的得分，
          与上涨概率无关 —— 分数高只说明结构干净，不代表一定会涨。
        </p>
      </motion.div>

      <motion.div
        variants={fadeInUp}
        initial="hidden"
        animate="show"
        className="mt-5 flex flex-col gap-2"
      >
        {RULES.map((rule) => (
          <div key={rule.title} className="panel px-4 py-3">
            <p className="text-sm font-semibold text-ink-100">{rule.title}</p>
            <p className="mt-1 text-xs leading-5 text-ink-400">{rule.body}</p>
          </div>
        ))}
      </motion.div>

      <motion.div
        variants={fadeInUp}
        initial="hidden"
        animate="show"
        className="panel mt-5 px-4 py-4"
      >
        <p className="field-label">识别到的结构</p>
        <ul className="mt-2 flex flex-col gap-1 text-xs text-ink-300">
          {Object.values(PATTERN_LABELS).map((label) => (
            <li key={label}>· {label}</li>
          ))}
        </ul>
      </motion.div>

      <motion.div
        variants={fadeInUp}
        initial="hidden"
        animate="show"
        className="panel mt-5 grid grid-cols-2 gap-3 px-4 py-4 sm:grid-cols-4"
      >
        <div>
          <p className="field-label">目标收益</p>
          <p className="field-value mt-1 text-sm">+{SCAN_CONFIG.targetPct}%</p>
        </div>
        <div>
          <p className="field-label">风险模式</p>
          <p className="field-value mt-1 text-sm">Balanced</p>
        </div>
        <div>
          <p className="field-label">最少成交额</p>
          <p className="field-value mt-1 text-sm">
            {SCAN_CONFIG.minQuoteVolume24h / 1_000_000}M USDT
          </p>
        </div>
        <div>
          <p className="field-label">策略版本</p>
          <p className="field-value mt-1 text-sm">{STRATEGY_VERSION}</p>
        </div>
      </motion.div>

      <motion.div
        variants={fadeInUp}
        initial="hidden"
        animate="show"
        className="panel mt-5 border-coral-950 px-4 py-4"
      >
        <p className="field-label">免责声明</p>
        <p className="mt-2 text-xs leading-5 text-ink-400">
          本项目是技术演示，所有内容仅供学习与研究使用，不构成任何投资建议或买卖要约。
          加密货币市场波动剧烈，任何决策及其后果都由你自己承担。请勿投入你无法承受损失的资金。
        </p>
      </motion.div>
    </section>
  );
}
