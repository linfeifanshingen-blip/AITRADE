import Head from 'next/head';
import Link from 'next/link';

const PHASE_COLORS = {
  analyst:  '#22D3EE',
  research: '#3B82F6',
  trader:   '#10B981',
  risk:     '#F59E0B',
  pm:       '#22D3EE',
};

function NodeBox({ title, sub, color, terminal = false }) {
  return (
    <div
      className="arch-node rounded-lg border px-3 py-2 text-center"
      style={{
        borderColor: color,
        background: `color-mix(in srgb, ${color} 10%, #111827)`,
        boxShadow: terminal
          ? `0 0 0 1px color-mix(in srgb, ${color} 38%, transparent), 0 0 24px color-mix(in srgb, ${color} 18%, transparent)`
          : 'none',
      }}
    >
      <div className="text-xs font-semibold" style={{ color }}>{title}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function FlowArrow({ color = '#94A3B8', label }) {
  return (
    <div className="flex flex-col items-center my-1">
      {label && <div className="text-[10px] text-slate-400 mb-0.5">{label}</div>}
      <svg width="20" height="36" viewBox="0 0 20 36" style={{ overflow: 'visible' }}>
        <line x1="10" y1="0" x2="10" y2="28" stroke={color} strokeWidth="2.2" strokeDasharray="5 3"
              style={{ animation: 'seg-flow 1.4s linear infinite' }} />
        <polygon points="10,36 5,28 15,28" fill={color} />
      </svg>
    </div>
  );
}

export default function Architecture() {
  return (
    <>
      <Head>
        <title>林非凡交易研究中心 · 产品介绍</title>
      </Head>

      {/* Header */}
      <div className="terminal-header sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3 flex-wrap">
          <Link href="/" className="terminal-link">← 工作台</Link>
          <div className="text-base font-bold text-slate-100 ml-0 sm:ml-2">林非凡交易研究中心 · 产品介绍</div>
          <span className="terminal-watermark">11智能体架构</span>
        </div>
      </div>

      <main className="terminal-main arch-page max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* 1. Overview */}
        <section className="step-card" style={{ '--step-accent': '#22D3EE' }}>
          <div className="step-hdr">
            <div className="step-num">1</div>
            <h2>系统概览</h2>
          </div>
          <div className="step-sub">11 个 agent 串/并行编排，模拟真实买方投研团队的决策流程</div>

          <p className="text-sm text-slate-700 leading-relaxed">
            <strong>林非凡交易研究中心</strong> 是 <Link href="https://github.com/TauricResearch/TradingAgents" target="_blank"
              className="terminal-link">TradingAgents (Tauric Research)</Link> 论文的
            TypeScript Vercel-native 复刻版。一次“分析”会启动 11 个 specialized agent，
            分 4 个阶段把宏观环境、市场数据、公司情报、基本面、研究辩论、交易方案和风险审查汇总为最终评级。
          </p>
          <p className="text-sm text-slate-700 leading-relaxed mt-2">
            前端 React + Tailwind 通过 <span className="terminal-code">SSE</span> 实时订阅每个 agent 的 token 流;
            后端 Vercel Function 内联跑整条 workflow,每步都 emit 给前端。
            当前数据以公开源和少量无 key fallback 为主，系统会把覆盖范围和来源类型暴露给分析师，而不是假设拥有全量机构数据。
          </p>
        </section>

        {/* 2. Full workflow flow */}
        <section className="step-card" style={{ '--step-accent': '#3B82F6' }}>
          <div className="step-hdr">
            <div className="step-num" style={{ background: '#3B82F6' }}>2</div>
            <h2>11-Agent 产品工作流</h2>
          </div>
          <div className="step-sub">从输入 ticker 到输出(五档评级 + 投资论文)的完整调用图; 分析日期由请求时间自动生成</div>

          {/* Input */}
          <div className="flex justify-center">
            <NodeBox title="输入" sub="ticker + 持仓状态 + 请求时间" color="#64748B" />
          </div>
          <FlowArrow color="#64748B" />

          {/* Step 1: 4 Analysts in parallel */}
          <div className="text-center mb-2">
            <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: PHASE_COLORS.analyst }}>
              Step 1 · 分析师团队 · 并行
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <NodeBox title="宏观趋势分析师" sub="经济周期 + 细分赛道" color={PHASE_COLORS.analyst} />
            <NodeBox title="技术分析师" sub="Yahoo + 22 indicators" color={PHASE_COLORS.analyst} />
            <NodeBox title="情报分析师" sub="官方事实 + 新闻 + 舆情地图" color={PHASE_COLORS.analyst} />
            <NodeBox title="基本面分析师" sub="Futu/Nasdaq + 财务估值" color={PHASE_COLORS.analyst} />
          </div>
          <FlowArrow color={PHASE_COLORS.analyst} label="4 份独立报告 → 共享上下文" />

          {/* Step 2: Bull/Bear debate × 2 rounds */}
          <div className="text-center mb-2">
            <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: PHASE_COLORS.research }}>
              Step 2 · 研究辩论 · 串行 2 轮
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 max-w-md mx-auto">
            <NodeBox title="多头研究员" sub="Bull case · 增长 + 优势" color="#10B981" />
            <NodeBox title="空头研究员" sub="Bear case · 风险 + 弱点" color="#EF4444" />
          </div>
          <FlowArrow color={PHASE_COLORS.research} label="第 1 轮 ↔ 第 2 轮" />
          <div className="max-w-md mx-auto">
            <NodeBox title="研究主管 (裁决)" sub="Buy / Overweight / Hold / Underweight / Sell" color={PHASE_COLORS.research} />
          </div>
          <FlowArrow color={PHASE_COLORS.research} label="结构化建议(JSON + 本地校验)" />

          {/* Step 3: Trader */}
          <div className="text-center mb-2">
            <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: PHASE_COLORS.trader }}>
              Step 3 · 交易员
            </span>
          </div>
          <div className="max-w-md mx-auto">
            <NodeBox title="交易员" sub="Buy / Hold / Sell + 入场/止损/仓位" color={PHASE_COLORS.trader} />
          </div>
          <FlowArrow color={PHASE_COLORS.trader} label="交易方案" />

          {/* Step 4: Risk Committee */}
          <div className="text-center mb-2">
            <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: PHASE_COLORS.risk }}>
              Step 4 · 风险委员会 · 三方串行辩论
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <NodeBox title="激进派" sub="高风险高收益" color={PHASE_COLORS.risk} />
            <NodeBox title="中性派" sub="平衡可持续" color="#3B82F6" />
            <NodeBox title="保守派" sub="稳健低波动" color="#10B981" />
          </div>
          <FlowArrow color={PHASE_COLORS.risk} label="三方意见汇总" />
          <div className="max-w-md mx-auto">
            <NodeBox title="投资经理 (终审)" sub="五档评级 + 投资论文 + 价格目标" color={PHASE_COLORS.pm} terminal />
          </div>
          <FlowArrow color={PHASE_COLORS.pm} />
          <div className="flex justify-center">
            <NodeBox title="最终决策" sub="Buy / Overweight / Hold / Underweight / Sell" color="#0F172A" terminal />
          </div>
        </section>

        {/* 3. Agent roles */}
        <section className="step-card" style={{ '--step-accent': '#10B981' }}>
          <div className="step-hdr">
            <div className="step-num" style={{ background: '#10B981' }}>3</div>
            <h2>Agent 功能简介</h2>
          </div>
          <div className="step-sub">当前为 11 个 agent：新闻/舆情已合并为情报分析师，宏观趋势分析师作为第一阶段并行节点；研究主管作为辩论裁决节点展示在产品工作流中</div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
              <div className="font-bold text-slate-900 mb-1">宏观趋势分析师</div>
              <p className="text-slate-600 text-[12px] leading-relaxed">判断美国经济、美联储、流动性、地缘政策和技术周期，再落到该标的所在细分赛道的顺风/逆风。</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
              <div className="font-bold text-slate-900 mb-1">技术分析师</div>
              <p className="text-slate-600 text-[12px] leading-relaxed">读取价格、成交量和技术指标，判断趋势、动量、波动、支撑阻力和短线交易结构。</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
              <div className="font-bold text-slate-900 mb-1">情报分析师</div>
              <p className="text-slate-600 text-[12px] leading-relaxed">融合公司官网、公告、SEC、新闻、行业信息和社区代理信号，输出该标的的完整情报地图。</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
              <div className="font-bold text-slate-900 mb-1">基本面分析师</div>
              <p className="text-slate-600 text-[12px] leading-relaxed">分析收入增长、盈利能力、估值、资产负债表、现金流和市场预期，判断公司内在质量。</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
              <div className="font-bold text-slate-900 mb-1">多头研究员</div>
              <p className="text-slate-600 text-[12px] leading-relaxed">基于四份分析师报告提出最强 bull case，说明上涨路径、催化剂和可以更积极的条件。</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
              <div className="font-bold text-slate-900 mb-1">空头研究员</div>
              <p className="text-slate-600 text-[12px] leading-relaxed">提出最强 bear case，识别估值、基本面、宏观、情绪和技术结构中的主要风险。</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
              <div className="font-bold text-slate-900 mb-1">交易员</div>
              <p className="text-slate-600 text-[12px] leading-relaxed">把研究结论转成可执行方案：买/持有/卖、入场、止损、仓位和交易节奏。</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
              <div className="font-bold text-slate-900 mb-1">激进派风险委员</div>
              <p className="text-slate-600 text-[12px] leading-relaxed">评估收益弹性和进攻性仓位是否值得承担，寻找非对称上行机会。</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
              <div className="font-bold text-slate-900 mb-1">中性派风险委员</div>
              <p className="text-slate-600 text-[12px] leading-relaxed">平衡上行和下行概率，检查交易方案是否和基本面、宏观与价格结构相匹配。</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
              <div className="font-bold text-slate-900 mb-1">保守派风险委员</div>
              <p className="text-slate-600 text-[12px] leading-relaxed">优先识别本金风险、止损失效、宏观逆风和高估值回撤风险。</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 bg-slate-50 md:col-span-2">
              <div className="font-bold text-slate-900 mb-1">投资经理</div>
              <p className="text-slate-600 text-[12px] leading-relaxed">终审所有证据和风险辩论，并结合用户是否持仓、持仓成本，给出最终评级、短中长期建议和建仓/持仓策略。</p>
            </div>
          </div>
        </section>

        {/* 4. Timing profile */}
        <section className="step-card" style={{ '--step-accent': '#22D3EE' }}>
          <div className="step-hdr">
            <div className="step-num" style={{ background: '#22D3EE' }}>4</div>
            <h2>性能 / 成本档案</h2>
          </div>
          <div className="step-sub">单次完整 11-agent 分析的估算区间，实际耗时受 LLM 响应和数据源速度影响</div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">总耗时</div>
              <div className="font-mono text-2xl font-bold text-slate-900 mt-1">~2-5 min</div>
              <div className="text-[10px] text-slate-500 mt-0.5">取决于 LLM + 数据源</div>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Token 用量</div>
              <div className="font-mono text-2xl font-bold text-slate-900 mt-1">~50-100k</div>
              <div className="text-[10px] text-slate-500 mt-0.5">input + output</div>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">单次成本</div>
              <div className="font-mono text-2xl font-bold text-slate-900 mt-1">¥0.1-0.3</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Kimi + DeepSeek 组合</div>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">LLM 调用数</div>
              <div className="font-mono text-2xl font-bold text-slate-900 mt-1">~11 次</div>
              <div className="text-[10px] text-slate-500 mt-0.5">4 analysts + 研究/交易/风险/终审</div>
            </div>
          </div>

          <div className="mt-4 text-xs text-slate-600 leading-relaxed">
            <strong>分阶段耗时</strong>(典型 NVDA):Step 1 (4 analyst 并行) ~30-75s,
            Step 2 (2 轮辩论 + 裁决) ~60-90s,Step 3 (交易员) ~10-15s,
            Step 4 (3 风险 + 投资经理) ~50-80s。Backtest 同 ticker 第 2 次起 KV cache 命中,Step 1 缩到 ~5s。
          </div>
        </section>

        {/* 5. Next direction */}
        <section className="step-card" style={{ '--step-accent': '#3B82F6' }}>
          <div className="step-hdr">
            <div className="step-num" style={{ background: '#3B82F6' }}>5</div>
            <h2>开发迭代的下一个方向</h2>
          </div>
          <div className="step-sub">当前最主要的瓶颈是高质量信息源 API 的稳定接入，其次是历史回测与记忆系统</div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-slate-200 p-4 bg-slate-50">
              <div className="font-bold text-slate-900 mb-2">信息源 API 获取</div>
              <ul className="text-slate-600 space-y-1 text-[12px] leading-relaxed">
                <li><strong>X / Twitter API / xAI 搜索</strong>：补足海外实时舆情、管理层/产业链人物动态和市场叙事变化。</li>
                <li><strong>Reddit API</strong>：补足英文社区讨论，特别是散户情绪、产品反馈和争议主题。</li>
                <li><strong>Bloomberg / Reuters / FactSet / Refinitiv</strong>：补足机构级新闻、宏观数据、分析师修正和事件日历。</li>
                <li><strong>Benzinga / Polygon / Finnhub / Alpha Vantage</strong>：提高公司新闻覆盖、新闻情绪和美股事件数据稳定性。</li>
                <li><strong>SEC / 公司 IR 深化</strong>：加强 8-K、10-Q、10-K、财报电话会和投资者日材料解析。</li>
              </ul>
            </div>
            <div className="rounded-lg border border-slate-200 p-4 bg-slate-50">
              <div className="font-bold text-slate-900 mb-2">产品与策略能力</div>
              <ul className="text-slate-600 space-y-1 text-[12px] leading-relaxed">
                <li><strong>信息源置信度评分</strong>：区分官方事实、权威新闻、社区代理信号和模型推断。</li>
                <li><strong>适配更多市场</strong>：扩展港股、A股和虚拟货币，补齐交易日历、代码识别、行情源、公告源和市场特有指标。</li>
                <li><strong>历史回测</strong>：按历史日期复盘 agent 决策，验证短中长期建议是否有效。</li>
                <li><strong>记忆系统</strong>：记录每个标的的历史判断、错误归因和下次分析需要避免的问题。</li>
                <li><strong>用户画像增强</strong>：把持仓状态、成本、风险偏好、投资周期纳入最终建议。</li>
                <li><strong>可视化升级</strong>：加入价格图、事件时间线、情绪来源分布和短中长期建议卡片。</li>
              </ul>
            </div>
          </div>
        </section>

        <div className="text-center text-[11px] text-slate-400 mt-6 font-mono">
          林非凡交易研究中心 · 11智能体LLM交易框架 · 由 DeepSeek 与 Gemini 驱动
        </div>
      </main>
    </>
  );
}
