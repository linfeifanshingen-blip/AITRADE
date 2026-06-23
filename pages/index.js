import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import Link from 'next/link';
import AgentCard, { StepConnector } from '@/components/AgentCard';

const TAG_COLORS = {
  analyst:    '#22D3EE',
  bull:       '#10B981',
  bear:       '#EF4444',
  judge:      '#3B82F6',
  trader:     '#10B981',
  risk:       '#F59E0B',
  pm:         '#22D3EE',
};

const RATING_LABELS = {
  Buy: '买入',
  Overweight: '增持',
  Hold: '持有',
  Underweight: '减持',
  Sell: '卖出',
};

const NO_POSITION_RATING_LABELS = {
  Buy: '适合建仓',
  Overweight: '可分批建仓',
  Hold: '等待建仓',
  Underweight: '暂不建仓',
  Sell: '不建议建仓',
};

const MODEL_DISPLAY = {
  'google:quick': { label: 'Gemini Flash', shortLabel: 'Flash', color: '#4285F4', key: 'google:quick' },
  'google:deep':  { label: 'Gemini Pro',   shortLabel: 'Pro',   color: '#34A853', key: 'google:deep' },
  'zhipu':        { label: '智谱GLM-4-Flash', shortLabel: 'GLM-4', color: '#6366F1', key: 'zhipu' },
};

function resolvedModelDisplay(modelProvider, modelTier) {
  const key = modelProvider + (modelTier ? ':' + modelTier : '');
  return MODEL_DISPLAY[key] || MODEL_DISPLAY['google:quick'];
}

const ANALYSTS = [
  { key: 'Macro Analyst',        tag: '宏', subtitle: '宏观趋势 + 细分赛道',       zh: '宏观趋势分析师'  },
  { key: 'Market Analyst',       tag: '技', subtitle: '价格 + 22 项技术指标',     zh: '技术分析师'      },
  { key: 'Intelligence Analyst', tag: '情', subtitle: '官方事实 + 新闻 + 舆情地图', zh: '情报分析师'      },
  { key: 'Fundamentals Analyst', tag: '财', subtitle: '财报 + 估值 + 分析师评级',   zh: '基本面分析师'    },
];

const initialAgents = () =>
  Object.fromEntries([
    ...ANALYSTS.map(a => [a.key, { status: 'pending', report: '', progress: '', elapsed: null }]),
    ['Research Manager',  { status: 'pending', report: '', progress: '', elapsed: null }],
    ['Trader',            { status: 'pending', report: '', progress: '', elapsed: null }],
    ['Portfolio Manager', { status: 'pending', report: '', progress: '', elapsed: null }],
  ]);

const blankDebate = () => ({
  bull: { status: 'pending', history: '' },
  bear: { status: 'pending', history: '' },
});
const blankRisk = () => ({
  aggressive:   { status: 'pending', history: '' },
  neutral:      { status: 'pending', history: '' },
  conservative: { status: 'pending', history: '' },
});

export default function Home() {
  const [ticker, setTicker] = useState('NVDA');
  const [market, setMarket] = useState('US');
  const [date, setDate] = useState('');
  const [hasPosition, setHasPosition] = useState(false);
  const [averageCost, setAverageCost] = useState('');
  const [submittedUserContext, setSubmittedUserContext] = useState(null);
  const [error, setError] = useState(null);
  const [modelInfo, setModelInfo] = useState(null);
  const [selectedModelProviders, setSelectedModelProviders] = useState(['google:quick']);
  const [modelRunStates, setModelRunStates] = useState({});
  const esRefs = useRef({});
  const esErrorCounts = useRef({});
  const modelRunStatesRef = useRef(modelRunStates);
  modelRunStatesRef.current = modelRunStates;
  const anyRunning = Object.values(modelRunStates).some(s => s?.running);

  // ─── helpers ───────────────────────────────────────────────────────────

  function reset() {
    setError(null);
    setDate('');
    setSubmittedUserContext(null);
    Object.values(esRefs.current).forEach(es => { try { es.close(); } catch {} });
    esRefs.current = {};
    setModelRunStates(prev => {
      Object.values(prev).forEach(s => {
        if (s?.timerRef) clearInterval(s.timerRef);
      });
      return {};
    });
  }

  function cleanupModelTimers(displayKey) {
    setModelRunStates(prev => {
      const s = prev[displayKey];
      if (!s) return prev;
      if (s.timerRef) clearInterval(s.timerRef);
      const es = esRefs.current[displayKey];
      if (es) { try { es.close(); } catch {}; delete esRefs.current[displayKey]; }
      return { ...prev, [displayKey]: { ...s, running: false, timerRef: null } };
    });
  }

  /** Build initial per-model state objects and start elapsed timers. */
  function buildInitStates() {
    const initStates = {};
    for (const mp of selectedModelProviders) {
      const agentState = initialAgents();
      ANALYSTS.forEach(a => { agentState[a.key].status = 'running'; });
      const timerRef = setInterval(() => {
        setModelRunStates(prev => {
          const s = prev[mp];
          if (!s || !s.running) return prev;
          return { ...prev, [mp]: { ...s, elapsed: s.elapsed + 1 } };
        });
      }, 1000);
      initStates[mp] = {
        runId: null, modelProvider: '', modelTier: null,
        running: true, elapsed: 0, agents: agentState,
        debate: blankDebate(), risk: blankRisk(),
        decision: null, finalDecisionDetail: null, error: null, timerRef,
      };
    }
    return initStates;
  }

  /** POST /api/run and return parsed JSON. */
  async function postRunApi(userContext) {
    const r = await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker, market, userContext, modelProviders: selectedModelProviders }),
    });
    if (!r.ok) throw new Error(`run ${r.status}: ${await r.text()}`);
    return r.json();
  }

  /** Map API response runs back to display keys and merge into initStates. */
  function mapRunsToDisplayKeys(runsData, initStates) {
    const runsUpdated = { ...initStates };
    for (const run of runsData.runs) {
      const dKey = run.model_provider + (run.model_tier ? ':' + run.model_tier : '');
      const matchKey = selectedModelProviders.includes(dKey) ? dKey
        : selectedModelProviders.includes(run.model_provider) ? run.model_provider
        : null;
      if (!matchKey) continue;
      runsUpdated[matchKey] = {
        ...runsUpdated[matchKey],
        runId: run.run_id,
        modelProvider: run.model_provider,
        modelTier: run.model_tier,
      };
    }
    return runsUpdated;
  }

  /** Open SSE connection for one run and attach all event listeners. */
  function startSSEForRun(runId, displayKey) {
    const es = new EventSource(`/api/stream/${runId}`);
    esRefs.current[displayKey] = es;
    esErrorCounts.current[displayKey] = 0;

    es.onopen = () => { esErrorCounts.current[displayKey] = 0; };

    es.addEventListener('agent', ev => {
      try {
        const d = JSON.parse(ev.data);
        setModelRunStates(prev => {
          const s = prev[displayKey];
          if (!s) return prev;
          return { ...prev, [displayKey]: {
            ...s,
            agents: { ...s.agents, [d.node]: {
              status: d.status,
              report: d.report ?? s.agents[d.node]?.report ?? '',
              progress: d.status === 'done' ? '' : s.agents[d.node]?.progress ?? '',
              elapsed: d.elapsed,
            }},
          }};
        });
      } catch (err) { console.error('[SSE:agent] parse error:', ev.data, err); }
    });

    es.addEventListener('agent-progress', ev => {
      try {
        const d = JSON.parse(ev.data);
        setModelRunStates(prev => {
          const s = prev[displayKey];
          if (!s) return prev;
          return { ...prev, [displayKey]: {
            ...s,
            agents: { ...s.agents, [d.node]: {
              ...s.agents[d.node],
              status: s.agents[d.node]?.status === 'done' ? 'done' : 'running',
              progress: d.message || '',
            }},
          }};
        });
      } catch (err) { console.error('[SSE:agent-progress] parse error:', ev.data, err); }
    });

    es.addEventListener('stream', ev => {
      try {
        const d = JSON.parse(ev.data);
        setModelRunStates(prev => {
          const s = prev[displayKey];
          if (!s) return prev;
          return { ...prev, [displayKey]: {
            ...s,
            agents: { ...s.agents, [d.node]: {
              ...s.agents[d.node],
              status: 'running',
              progress: '',
              report: (s.agents[d.node]?.report || '') + (d.delta || ''),
            }},
          }};
        });
      } catch (err) { console.error('[SSE:stream] parse error:', ev.data, err); }
    });

    es.addEventListener('debate-stream', ev => {
      try {
        const d = JSON.parse(ev.data);
        setModelRunStates(prev => {
          const s = prev[displayKey];
          if (!s) return prev;
          const field = d.phase === 'research' ? 'debate' : 'risk';
          return { ...prev, [displayKey]: {
            ...s,
            [field]: { ...s[field], [d.side]: {
              status: 'running',
              history: (s[field][d.side]?.history || '') + (d.delta || ''),
            }},
          }};
        });
      } catch (err) { console.error('[SSE:debate-stream] parse error:', ev.data, err); }
    });

    es.addEventListener('debate', ev => {
      try {
        const d = JSON.parse(ev.data);
        setModelRunStates(prev => {
          const s = prev[displayKey];
          if (!s) return prev;
          const field = d.phase === 'research' ? 'debate' : 'risk';
          const status = d.status || 'running';
          return { ...prev, [displayKey]: {
            ...s,
            [field]: { ...s[field], [d.side]: {
              status,
              history: d.history ?? s[field][d.side]?.history ?? '',
            }},
          }};
        });
      } catch (err) { console.error('[SSE:debate] parse error:', ev.data, err); }
    });

    es.addEventListener('complete', ev => {
      try {
        const d = JSON.parse(ev.data);
        setModelRunStates(prev => {
          const s = prev[displayKey];
          if (!s) return prev;
          if (s.timerRef) clearInterval(s.timerRef);
          const esRef = esRefs.current[displayKey];
          if (esRef) { try { esRef.close(); } catch {}; delete esRefs.current[displayKey]; }
          return { ...prev, [displayKey]: {
            ...s,
            running: false,
            timerRef: null,
            decision: d.decision,
            finalDecisionDetail: d.final_decision || null,
          }};
        });
      } catch (err) { console.error('[SSE:complete] parse error:', ev.data, err); }
    });

    es.addEventListener('error', ev => {
      try {
        if (!ev.data) {
          // Merged: cleanup timer + close SSE + set error in single state update
          setModelRunStates(prev => {
            const s = prev[displayKey];
            if (!s) return prev;
            if (s.timerRef) clearInterval(s.timerRef);
            const esRef = esRefs.current[displayKey];
            if (esRef) { try { esRef.close(); } catch {}; delete esRefs.current[displayKey]; }
            return { ...prev, [displayKey]: { ...s, running: false, timerRef: null, error: '分析连接中断' } };
          });
          return;
        }
        const d = JSON.parse(ev.data);
        if (!d.node) {
          setModelRunStates(prev => {
            const s = prev[displayKey];
            if (!s) return prev;
            if (s.timerRef) clearInterval(s.timerRef);
            const esRef = esRefs.current[displayKey];
            if (esRef) { try { esRef.close(); } catch {}; delete esRefs.current[displayKey]; }
            return { ...prev, [displayKey]: { ...s, running: false, timerRef: null, error: `Stream: ${d.message}` } };
          });
          return;
        }
        setModelRunStates(prev => {
          const s = prev[displayKey];
          if (!s) return prev;
          const updatedAgents = { ...s.agents };
          if (updatedAgents[d.node] !== undefined) {
            updatedAgents[d.node] = {
              ...updatedAgents[d.node],
              status: 'error',
              report: s.agents[d.node]?.report || `**[失败]** ${d.message}`,
            };
          }
          return { ...prev, [displayKey]: { ...s, agents: updatedAgents } };
        });
      } catch (err) { console.error('[SSE:error] parse error:', ev.data, err); }
    });

    es.onerror = () => {
      const cnt = (esErrorCounts.current[displayKey] || 0) + 1;
      esErrorCounts.current[displayKey] = cnt;
      if (cnt >= 5) { cleanupModelTimers(displayKey); return; }
      if (es.readyState === EventSource.CLOSED) cleanupModelTimers(displayKey);
    };
  }

  // ─── fetch model info on mount ────────────────────────
  
  async function fetchModelInfo() {
    try {
      const res = await fetch("/api/model");
      if (!res.ok) throw new Error("info " + res.status);
      const data = await res.json();
      setModelInfo(data);
    } catch (err) {
      console.error("[fetchModelInfo]", err);
    }
  }

  // ─── main handler ─────────────────────────────────────────────
  
  async function handleRun(e) {
    e?.preventDefault();
    if (anyRunning) return;

    // — validation —
    const averageCostText = String(averageCost || '').trim();
    const averageCostValue = Number(averageCostText);
    if (hasPosition && (!averageCostText || !Number.isFinite(averageCostValue) || averageCostValue <= 0)) {
      setError('已持仓时请填写大于 0 的持仓均价。');
      return;
    }
    if (selectedModelProviders.length === 0) {
      setError('请至少选择一个模型。');
      return;
    }
    const userContext = { hasPosition, averageCost: hasPosition ? averageCostValue : null };

    // — reset + init model states —
    reset();
    setSubmittedUserContext(userContext);
    const initStates = buildInitStates();
    setModelRunStates(initStates);

    // — POST /api/run —
    let runsData;
    try {
      runsData = await postRunApi(userContext);
    } catch (err) {
      setError(err.message);
      setModelRunStates(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(k => {
          if (next[k]?.timerRef) clearInterval(next[k].timerRef);
          next[k] = { ...next[k], running: false, error: err.message };
        });
        return next;
      });
      return;
    }

    // — update runIds + start SSE —
    const runsUpdated = mapRunsToDisplayKeys(runsData, initStates);
    setModelRunStates(runsUpdated);
    for (const [key, state] of Object.entries(runsUpdated)) {
      if (state.runId) startSSEForRun(state.runId, key);
    }
  }

  // ─── cleanup on unmount ───────────────────────────────────────────────
  useEffect(() => () => {
    Object.values(esRefs.current).forEach(es => { try { es.close(); } catch {} });
    Object.values(modelRunStatesRef.current).forEach(s => {
      if (s?.timerRef) clearInterval(s.timerRef);
    });
  }, []);

  // ─── fetch model info on mount ────────────────────────
  
  useEffect(() => { fetchModelInfo(); }, []);

  // ─── remainder of component (unchanged) ─────────────────────

  const primaryKey = selectedModelProviders[0] || 'google:quick';
  const primaryState = modelRunStates[primaryKey];
  const primaryRunning = primaryState?.running || false;
  const primaryAgents = primaryState?.agents || initialAgents();
  const primaryDebate = primaryState?.debate || blankDebate();
  const primaryRisk = primaryState?.risk || blankRisk();

  // Multi-model aggregated step status: any model running → active,
  // all models completed → completed, all models error → error.
  const getStepStatus = (agentKeys, debateSides, riskSides) => {
    const modelStates = Object.values(modelRunStates).filter(s => s?.agents);
    if (modelStates.length === 0) return '';
    const anyRunning = modelStates.some(s => {
      const agentsRunning = agentKeys.some(k => s.agents[k]?.status === 'running');
      const debateRunning = (debateSides || []).some(side => s.debate?.[side]?.status === 'running');
      const riskRunning = (riskSides || []).some(side => s.risk?.[side]?.status === 'running');
      return agentsRunning || debateRunning || riskRunning;
    });
    if (anyRunning) return 'active';
    const allCompleted = modelStates.every(s => {
      const agentsDone = agentKeys.every(k => ['done', 'error'].includes(s.agents[k]?.status));
      const debateDone = (debateSides || []).every(side => ['done', 'error'].includes(s.debate?.[side]?.status));
      const riskDone = (riskSides || []).every(side => ['done', 'error'].includes(s.risk?.[side]?.status));
      return agentsDone && debateDone && riskDone;
    });
    if (allCompleted) {
      const allError = modelStates.every(s => {
        const agentsError = agentKeys.every(k => s.agents[k]?.status === 'error');
        const debateError = (debateSides || []).every(side => s.debate?.[side]?.status === 'error');
        const riskError = (riskSides || []).every(side => s.risk?.[side]?.status === 'error');
        return agentsError && debateError && riskError;
      });
      return allError ? 'error' : 'completed';
    }
    return '';
  };

  const step1Status = getStepStatus(ANALYSTS.map(a => a.key), [], []);
  const step2Status = getStepStatus(['Research Manager'], ['bull', 'bear'], []);
  const step3Status = getStepStatus(['Trader'], [], []);
  const step4Status = getStepStatus(['Portfolio Manager'], [], ['aggressive', 'neutral', 'conservative']);

  const STEP_INFO = [
    { num: 1, status: step1Status, color: '#22D3EE', name: '分析师团队' },
    { num: 2, status: step2Status, color: '#3B82F6', name: '研究辩论' },
    { num: 3, status: step3Status, color: '#10B981', name: '交易员' },
    { num: 4, status: step4Status, color: '#F59E0B', name: '风险委员会' },
  ];
  const activeStep = STEP_INFO.find(s => s.status === 'active');

  const lastActiveRef = useRef(null);
  useEffect(() => {
    if (activeStep && activeStep.num !== lastActiveRef.current) {
      lastActiveRef.current = activeStep.num;
      const el = document.getElementById(`step-${activeStep.num}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [activeStep?.num]);

  const cleanSummaryText = text => String(text || '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/[�|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  function modelDecisionDisplay(decision, hasPos) {
    if (!decision) return null;
    const labels = hasPos === false ? NO_POSITION_RATING_LABELS : RATING_LABELS;
    const label = labels[decision];
    return label ? `${label}（${decision}）` : decision;
  }

  function modelDecisionClass(decision) {
    if (['Buy', 'Overweight'].includes(decision)) return 'buy';
    if (['Sell', 'Underweight'].includes(decision)) return 'sell';
    return decision ? 'hold' : '';
  }

  const completedModels = Object.entries(modelRunStates)
    .filter(([, s]) => s?.finalDecisionDetail && !s?.running)
    .map(([key, s]) => ({
      key,
      display: MODEL_DISPLAY[key] || { label: key, shortLabel: key, color: '#8B5CF6' },
      decision: s.decision,
      decisionDisplay: modelDecisionDisplay(s.decision, submittedUserContext?.hasPosition),
      decisionClass: modelDecisionClass(s.decision),
      finalDecisionDetail: s.finalDecisionDetail,
      summary: s.finalDecisionDetail?.executive_summary
        ? (cleanSummaryText(s.finalDecisionDetail.executive_summary).match(/[^。！？.!?]+[。！？.!?]/g) || [cleanSummaryText(s.finalDecisionDetail.executive_summary)]).slice(0, 3).join('')
        : '',
      shortGuidance: cleanSummaryText(s.finalDecisionDetail?.short_term_guidance),
      mediumGuidance: cleanSummaryText(s.finalDecisionDetail?.medium_term_guidance),
      longGuidance: cleanSummaryText(s.finalDecisionDetail?.long_term_guidance),
      elapsed: s.elapsed,
      pmReport: s.agents?.['Portfolio Manager']?.report || '',
    }));
  const allCompleted = Object.values(modelRunStates).length > 0 &&
    Object.values(modelRunStates).every(s => !s?.running && s?.finalDecisionDetail);
  const tickerPlaceholder = market === 'HK'
    ? '腾讯 / 700 / 00700.HK'
    : market === 'CN'
      ? '茅台 / 宁德时代 / 600519'
      : market === 'CRYPTO'
        ? 'ETH / $ETH / 以太坊'
        : 'NVDA / 英伟达';
  const marketLabel = market === 'HK' ? '港股' : market === 'CN' ? 'A股' : market === 'CRYPTO' ? '加密货币' : '美股';

  return (
    <>
      <Head>
        <title>林非凡交易研究中心 · 实时投研</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </Head>

      {/* Header */}
      <div className="terminal-header sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="terminal-logo">S</div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base font-bold text-slate-100 leading-tight">林非凡交易研究中心</h1>
              </div>
              <div className="text-[11px] text-cyan-200/70 leading-tight mt-0.5">AI 投研终端 · 11智能体买方驾驶舱</div>
            </div>
          </div>

          <div className="terminal-status">
            <span className={`status-dot ${anyRunning ? '' : 'idle'}`} />
            <span className="font-mono">{anyRunning ? 'LIVE' : 'READY'}</span>
            {primaryState?.runId && <span className="font-mono text-slate-400">RUN:{primaryState.runId.slice(0, 8)}</span>}
            <span className="font-mono text-slate-400">T+{primaryState?.elapsed || 0}s</span>
            {activeStep && (
              <span className="now-playing" style={{ '--step-accent': activeStep.color }}>
                Step {activeStep.num} · {activeStep.name}
              </span>
            )}
          </div>

          <Link href="/architecture" className="terminal-link">产品介绍 →</Link>

          <form onSubmit={handleRun} className="command-bar ml-auto" aria-label="Market research command bar">
            <div className="model-select-group" title="选择分析模型（可多选）" aria-label="选择模型">
              {(() => {
                const options = [];
                if (modelInfo?.providers) {
                  const provs = modelInfo.providers;
                  if (provs.google?.configured) {
                    const qm = provs.google.quick_model || 'gemini-2.5-flash';
                    const dm = provs.google.deep_model || 'gemini-2.5-pro';
                    if (qm === dm) {
                      options.push({ key: 'google', label: 'Gemini 2.5 Pro', short: 'Gemini' });
                    } else {
                      options.push(
                        { key: 'google:quick', label: `Gemini Flash`, short: 'Flash' },
                        { key: 'google:deep', label: `Gemini Pro`, short: 'Pro' }
                      );
                    }
                  }
                  if (provs.zhipu?.configured) {
                    options.push({ key: 'zhipu', label: '智谱GLM-4-Flash', short: 'GLM-4' });
                  }
                }
                if (options.length === 0) {
                  options.push({ key: 'google:quick', label: 'Gemini Flash', short: 'Flash' });
                }
                return options.map(opt => {
                  const checked = selectedModelProviders.includes(opt.key);
                  return (
                    <label key={opt.key} className={`model-checkbox ${checked ? 'checked' : ''}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={anyRunning}
                        onChange={() => {
                          setSelectedModelProviders(prev => {
                            if (prev.includes(opt.key)) {
                              const next = prev.filter(k => k !== opt.key);
                              return next.length > 0 ? next : prev;
                            }
                            return [...prev, opt.key];
                          });
                        }}
                      />
                      <span>{opt.label}</span>
                    </label>
                  );
                });
              })()}
            </div>
            <select value={market} onChange={e => setMarket(e.target.value)} className="terminal-select" aria-label="选择市场" title="选择标的市场">
              <option value="US">美股</option>
              <option value="HK">港股</option>
              <option value="CN">A股</option>
              <option value="CRYPTO">加密货币</option>
            </select>
            <input
              value={ticker} onChange={e => setTicker(e.target.value)}
              placeholder={tickerPlaceholder} maxLength={40} required
              className="terminal-input w-36 uppercase font-mono"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
              aria-label="输入标的代码"
            />
            <select value={hasPosition ? 'yes' : 'no'} onChange={e => { const v = e.target.value === 'yes'; setHasPosition(v); if (!v) setAverageCost(''); }} className="terminal-select" aria-label="选择持仓状态">
              <option value="no">未持仓</option>
              <option value="yes">已持仓</option>
            </select>
            {hasPosition && (
              <input
                value={averageCost} onChange={e => setAverageCost(e.target.value)}
                type="number" inputMode="decimal" min="0" step="0.01"
                placeholder="持仓均价" required
                className="terminal-input w-28" aria-label="输入持仓均价"
              />
            )}
            {/* 取消按钮已注释：后端暂未接入取消能力，禁用状态无实际功能会让用户困惑 */}
            <button type="submit" disabled={anyRunning} className={`terminal-primary ${anyRunning ? 'is-running' : ''}`} aria-label={anyRunning ? '正在分析' : '开始分析'}>
              {anyRunning ? '分析中…' : '开始分析'}
            </button>
          </form>
        </div>
      </div>

      <main className="terminal-main max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <section className="market-ribbon mb-5" aria-label="实时投研状态栏">
          <div><span>标的</span><strong>{ticker || '----'}</strong></div>
          <div><span>市场</span><strong>{marketLabel}</strong></div>
          <div><span>模型</span><strong>{selectedModelProviders.map(mp => { const i = MODEL_DISPLAY[mp]; return i ? i.shortLabel : mp; }).join(' + ') || '--'}</strong></div>
          <div><span>持仓</span><strong>{hasPosition ? `做多 @ ${averageCost || '--'}` : '未持仓'}</strong></div>
          <div><span>流程</span><strong>{activeStep ? `STEP ${activeStep.num}` : anyRunning ? '初始化中' : '待命'}</strong></div>
          <div><span>节点</span><strong>11节点</strong></div>
        </section>

        {Object.entries(modelRunStates).filter(([, s]) => s?.running).length > 0 && (
          <div className="model-progress-bar mb-4">
            {Object.entries(modelRunStates).map(([key, s]) => {
              const display = MODEL_DISPLAY[key] || { label: key, shortLabel: key, color: '#8B5CF6' };
              const done = !s?.running;
              return (
                <div key={key} className={`model-progress-chip ${done ? 'done' : 'running'}`} style={{ '--chip-color': display.color }}>
                  <span className="chip-dot" />
                  <span className="chip-label">{display.shortLabel}</span>
                  <span className="chip-time">{done ? `完成 ${s.elapsed}s` : `${s.elapsed}s`}</span>
                </div>
              );
            })}
          </div>
        )}

        {completedModels.length > 0 && (
          <div className="model-compare-section mb-5">
            <div className="compare-header">
              <h2>多模型对比 · 最终评级</h2>
              {allCompleted && <span className="compare-done-badge">全部完成</span>}
            </div>
            <div className={`compare-grid cols-${Math.min(completedModels.length, 3)}`}>
              {completedModels.map(m => (
                <div key={m.key} className={`compare-card ${m.decisionClass}`} style={{ '--card-color': m.display.color }}>
                  <div className="compare-card-header">
                    <div className="compare-model-badge" style={{ background: m.display.color }}>{m.display.shortLabel}</div>
                    <div className="compare-model-name">{m.display.label}</div>
                    <div className="compare-elapsed">{m.elapsed}s</div>
                  </div>
                  <div className="compare-rating">{m.decisionDisplay || '--'}</div>
                  {m.summary && <div className="compare-summary">{m.summary}</div>}
                  {m.finalDecisionDetail && (
                    <div className="compare-horizons">
                      {m.shortGuidance && <div className="compare-horizon short"><span>短期 0-4周</span><p>{m.shortGuidance}</p></div>}
                      {m.mediumGuidance && <div className="compare-horizon medium"><span>中期 1-3个月</span><p>{m.mediumGuidance}</p></div>}
                      {m.longGuidance && <div className="compare-horizon long"><span>长期 6-12个月</span><p>{m.longGuidance}</p></div>}
                    </div>
                  )}
                  {m.pmReport && (
                    <div className="compare-report markdown text-xs overflow-y-auto scroll-fade pt-2 mt-2 border-t border-slate-700/30" style={{ maxHeight: 200 }} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(m.pmReport)) }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {completedModels.length === 0 && anyRunning && (
          <div className="terminal-info mb-4">
            <strong>分析进行中：</strong>
            {Object.entries(modelRunStates).filter(([, s]) => s?.running).map(([key]) => {
              const display = MODEL_DISPLAY[key] || { label: key };
              return <span key={key} className="ml-2 font-mono">{display.label}</span>;
            })} 正在独立并行分析 {ticker}，完成后将在此并排展示对比结果。
          </div>
        )}

        {error && (
          <div className="terminal-error mb-4">
            <strong>错误:</strong> {error}
          </div>
        )}

        {/* Step 1 */}
        <div id="step-1" className={`step-card ${step1Status}`} style={{ '--step-accent': '#22D3EE' }}>
          <div className="step-hdr"><div className="step-num">1</div><h2>分析师团队</h2></div>
          <div className="step-sub">4 位独立分析师并行收集信息 — 宏观 / 技术 / 情报地图 / 基本面</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {ANALYSTS.map(a => (
              <AgentCard key={a.key} title={a.zh} tag={a.tag} tagColor={TAG_COLORS.analyst} subtitle={a.subtitle}
                status={primaryAgents[a.key]?.status} report={primaryAgents[a.key]?.report}
                progress={primaryAgents[a.key]?.progress} elapsed={primaryAgents[a.key]?.elapsed}
                maxHeight={a.key === 'Fundamentals Analyst' ? 520 : 380} size="sm" autoCollapse={false} />
            ))}
          </div>
        </div>

        <StepConnector />

        {/* Step 2 */}
        <div id="step-2" className={`step-card ${step2Status}`} style={{ '--step-accent': '#3B82F6' }}>
          <div className="step-hdr"><div className="step-num" style={{ background: '#3B82F6' }}>2</div><h2>研究辩论 · 多空对决</h2></div>
          <div className="step-sub">2 轮多空辩论 → 研究主管裁决投资倾向 (买入 / 持有 / 卖出)</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <AgentCard title="多头研究员" tag="多" tagColor={TAG_COLORS.bull} subtitle="看多逻辑 · 增长 + 优势"
              status={primaryDebate.bull.status} report={primaryDebate.bull.history} maxHeight={220} />
            <AgentCard title="空头研究员" tag="空" tagColor={TAG_COLORS.bear} subtitle="看空逻辑 · 风险 + 弱点"
              status={primaryDebate.bear.status} report={primaryDebate.bear.history} maxHeight={220} />
          </div>
          <AgentCard title="研究主管 (裁决)" tag="裁" tagColor={TAG_COLORS.judge}
            subtitle="综合多空辩论 → 五档投资建议 + 战略行动"
            status={primaryAgents['Research Manager']?.status} report={primaryAgents['Research Manager']?.report}
            elapsed={primaryAgents['Research Manager']?.elapsed} maxHeight={200} />
        </div>

        <StepConnector />

        {/* Step 3 */}
        <div id="step-3" className={`step-card ${step3Status}`} style={{ '--step-accent': '#10B981' }}>
          <div className="step-hdr"><div className="step-num" style={{ background: '#10B981' }}>3</div><h2>交易员</h2></div>
          <div className="step-sub">把研究主管的建议转换成具体交易方案 (买入 / 持有 / 卖出 + 入场/止损/仓位)</div>
          <AgentCard title="交易员" tag="交" tagColor={TAG_COLORS.trader} subtitle="结构化交易方案"
            status={primaryAgents['Trader']?.status} report={primaryAgents['Trader']?.report}
            elapsed={primaryAgents['Trader']?.elapsed} maxHeight={200} />
        </div>

        <StepConnector />

        {/* Step 4 */}
        <div id="step-4" className={`step-card ${step4Status}`} style={{ '--step-accent': '#F59E0B' }}>
          <div className="step-hdr"><div className="step-num" style={{ background: '#F59E0B' }}>4</div><h2>风险委员会</h2></div>
          <div className="step-sub">激进 / 中性 / 保守 三方辩论 → 投资经理终决</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <AgentCard title="激进派" tag="激" tagColor={TAG_COLORS.risk} subtitle="高风险高收益"
              status={primaryRisk.aggressive.status} report={primaryRisk.aggressive.history} maxHeight={200} />
            <AgentCard title="中性派" tag="衡" tagColor={TAG_COLORS.judge} subtitle="平衡可持续"
              status={primaryRisk.neutral.status} report={primaryRisk.neutral.history} maxHeight={200} />
            <AgentCard title="保守派" tag="保" tagColor={TAG_COLORS.bull} subtitle="稳健低波动"
              status={primaryRisk.conservative.status} report={primaryRisk.conservative.history} maxHeight={200} />
          </div>
          <AgentCard title="投资经理 (终审)" tag="经" tagColor={TAG_COLORS.pm}
            subtitle="综合所有信号 → 最终评级 + 投资论文 + 价格目标"
            status={primaryAgents['Portfolio Manager']?.status} report={primaryAgents['Portfolio Manager']?.report}
            elapsed={primaryAgents['Portfolio Manager']?.elapsed} maxHeight={260} />
        </div>

        {(primaryAgents['Portfolio Manager']?.report || completedModels.length > 0) && (
          <>
            <StepConnector />
            <div className={`result-box ${completedModels[0]?.decisionClass || ''}`}>
              <div className="flex items-baseline gap-3 mb-2">
                <span className="rb-label">林非凡交易研究中心 · 最终评级{completedModels.length > 1 ? `（${completedModels.length}模型共识）` : ''}</span>
                {primaryState?.runId && <span className="ml-auto font-mono text-[10px] text-slate-400">run {primaryState.runId.slice(0, 8)}</span>}
              </div>
              {completedModels.length > 0 && (
                <div className="rb-compare-strip">
                  {completedModels.map(m => (
                    <div key={m.key} className={`compare-strip-chip ${m.decisionClass}`}>
                      <span className="chip-model" style={{ color: m.display.color }}>{m.display.shortLabel}</span>
                      <span className="chip-rating">{m.decisionDisplay || '--'}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="text-xs text-slate-500 mb-3">
                <span className="inline-flex items-center gap-1"><span>标的:</span><span className="font-mono font-semibold text-slate-700">{ticker}</span></span>
                {date && <><span className="mx-2 text-slate-300">·</span><span className="inline-flex items-center gap-1"><span>日期:</span><span className="font-mono text-slate-700">{date}</span></span></>}
                {submittedUserContext && <><span className="mx-2 text-slate-300">·</span><span className="inline-flex items-center gap-1"><span>持仓:</span><span className="text-slate-700">{submittedUserContext.hasPosition ? `是 · 均价 ${submittedUserContext.averageCost ?? '未提供'}` : '否'}</span></span></>}
                {primaryState?.elapsed > 0 && <><span className="mx-2 text-slate-300">·</span><span className="inline-flex items-center gap-1"><span>耗时:</span><span className="font-mono text-slate-700">{primaryState.elapsed}s</span></span></>}
              </div>
              {primaryAgents['Portfolio Manager']?.report && (
                <div className="markdown text-sm overflow-y-auto scroll-fade pt-3 border-t border-slate-300/30" style={{ maxHeight: 320 }} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(primaryAgents['Portfolio Manager'].report)) }} />
              )}
            </div>
          </>
        )}

        <div className="text-center text-[11px] text-slate-400 mt-8 font-mono">
          林非凡交易研究中心 · 11智能体LLM交易框架 · 由 Gemini 与智谱驱动
        </div>
      </main>
    </>
  );
}
