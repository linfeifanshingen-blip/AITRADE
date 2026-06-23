import { useState, useEffect, useRef } from 'react';
import { marked } from 'marked';

const STATUS_LABEL = {
  pending: '等待',
  running: '运行中',
  done:    '完成',
  error:   '失败',
};

const STATUS_HINT = {
  pending: '待命中',
  running: '流式输出',
  done:    '已完成',
  error:   '异常',
};

/** Strip markdown to plain text and trim to 80 chars for collapsed summary */
function summarize(md) {
  if (!md) return '';
  const plain = md
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/[#>*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > 90 ? plain.slice(0, 90) + '…' : plain;
}

export default function AgentCard({
  title,
  subtitle,
  tag,
  tagColor,
  status = 'pending',
  report,
  progress,
  elapsed,
  maxHeight = 200,
  size = 'md',
  autoCollapse = true,
}) {
  // Auto-collapse when entering 'done'; running/pending always full
  const [collapsed, setCollapsed] = useState(false);
  const wasRunning = useRef(false);
  const contentRef = useRef(null);

  useEffect(() => {
    if (status === 'running') wasRunning.current = true;
    if (autoCollapse && status === 'done' && wasRunning.current) {
      setCollapsed(true);
      wasRunning.current = false;
    }
    if (!autoCollapse && status === 'done') {
      setCollapsed(false);
      wasRunning.current = false;
    }
  }, [autoCollapse, status]);

  useEffect(() => {
    if (status === 'running' && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [report, status]);

  const html = report ? marked.parse(report) : '';
  const padding = size === 'sm' ? '12px 14px' : '14px 16px';
  const showCollapseToggle = status === 'done' && !!report;

  return (
    <div className={`flow-node ${status}`} style={{ padding }}>
      <div className="agent-head">
        <div className="agent-title-row">
          {tag && (
            <span className="agent-tag" style={tagColor ? { background: tagColor } : undefined}>
              {tag}
            </span>
          )}
          <div className="min-w-0">
            <div className="fn-title">{title}</div>
            <div className="agent-route">{STATUS_HINT[status]} / 智能体节点</div>
          </div>
        </div>
        <div className="agent-meta">
          <span className={`fn-badge ${status}`}>
            {status === 'running' && <span className="fn-dot" />}
            {STATUS_LABEL[status]}
          </span>
          {elapsed != null && (
            <span className="fn-elapsed">{elapsed.toFixed(1)}s</span>
          )}
          {showCollapseToggle && (
            <button
              type="button"
              onClick={() => setCollapsed(c => !c)}
              className="drawer-toggle"
              aria-label={collapsed ? `展开${title}报告` : `收起${title}报告`}
            >
              {collapsed ? '展开' : '收起'}
            </button>
          )}
        </div>
      </div>
      {subtitle && <div className="fn-desc mb-2">{subtitle}</div>}
      {status === 'running' && progress && (
        <div className="agent-progress">
          {progress}
        </div>
      )}

      {collapsed ? (
        <div className="terminal-summary" onClick={() => setCollapsed(false)} style={{ cursor: 'pointer' }}>
          {summarize(report)}
        </div>
      ) : (
        <div
          ref={contentRef}
          className="markdown overflow-y-auto scroll-fade"
          style={{ maxHeight }}
        >
          {report
            ? <div dangerouslySetInnerHTML={{ __html: html }} />
            : <span className="text-slate-400 text-xs italic">{status === 'running' ? '正在生成…' : '等待中…'}</span>}
        </div>
      )}
    </div>
  );
}

/** Inline animated arrow connector (between cards in a row) */
export function VArrow({ active = false }) {
  return (
    <div className={`varrow ${active ? 'active' : ''}`}>
      <svg viewBox="0 0 20 30">
        <line className="seg" x1="10" y1="0" x2="10" y2="22" />
        <polygon className="head" points="10,30 5,22 15,22" />
      </svg>
    </div>
  );
}

/** Larger animated step connector (between phase cards) */
export function StepConnector() {
  return (
    <div className="step-conn">
      <svg viewBox="0 0 24 44">
        <line className="seg" x1="12" y1="0" x2="12" y2="36" />
        <polygon className="head" points="12,44 6,36 18,36" />
      </svg>
    </div>
  );
}
