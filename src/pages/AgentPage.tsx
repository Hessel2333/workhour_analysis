import { useEffect, useState } from 'react';
import { MetricCard } from '../components/MetricCard';
import { MetaPill } from '../components/MetaPill';
import { Panel } from '../components/Panel';
import { severityLabel } from '../lib/format';
import type { AnalyticsView, PageKey } from '../types';

interface AgentPageProps {
  view: AnalyticsView;
  onNavigate: (page: PageKey) => void;
}

export function AgentPage({ view, onNavigate }: AgentPageProps) {
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'error'>('idle');
  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const [geminiModel, setGeminiModel] = useState('未配置');
  const [geminiStatus, setGeminiStatus] = useState<'idle' | 'loading' | 'done' | 'error'>(
    'idle',
  );
  const [geminiResult, setGeminiResult] = useState('');
  const [geminiError, setGeminiError] = useState('');

  const issueSummary = view.agentReport.issues.reduce(
    (summary, issue) => {
      summary[issue.severity] += 1;
      return summary;
    },
    { high: 0, medium: 0, low: 0 },
  );

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(view.agentReport.llmPrompt);
      setCopyState('done');
      window.setTimeout(() => setCopyState('idle'), 1500);
    } catch {
      setCopyState('error');
      window.setTimeout(() => setCopyState('idle'), 1500);
    }
  };

  useEffect(() => {
    let cancelled = false;

    fetch('/api/gemini/health')
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled) return;
        setGeminiConfigured(Boolean(payload?.configured));
        setGeminiModel(typeof payload?.model === 'string' ? payload.model : '未配置');
      })
      .catch(() => {
        if (cancelled) return;
        setGeminiConfigured(false);
        setGeminiModel('代理未连接');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const runGeminiAnalysis = async () => {
    setGeminiStatus('loading');
    setGeminiError('');

    try {
      const response = await fetch('/api/gemini/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: view.agentReport.llmPrompt,
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Gemini 分析失败。');
      }

      setGeminiConfigured(true);
      setGeminiModel(typeof payload?.model === 'string' ? payload.model : geminiModel);
      setGeminiResult(typeof payload?.text === 'string' ? payload.text : '');
      setGeminiStatus('done');
    } catch (error) {
      setGeminiError(error instanceof Error ? error.message : 'Gemini 分析失败。');
      setGeminiStatus('error');
    }
  };

  return (
    <div className="page-grid">
      <div className="metrics-grid">
        <MetricCard
          label="识别问题"
          value={`${view.agentReport.issues.length}`}
          hint="当前筛选口径下的异常和风险项"
        />
        <MetricCard
          label="高优先级"
          value={`${issueSummary.high}`}
          hint="建议优先复盘和调整排班"
        />
        <MetricCard
          label="本地模式"
          value="Rules"
          hint="当前智能体为本地规则推理，不依赖外部模型"
        />
        <MetricCard
          label="Gemini 配置"
          value={geminiConfigured ? '已连接' : '未配置'}
          hint={geminiModel}
        />
        <MetricCard
          label="生成时间"
          value={new Date(view.agentReport.generatedAt).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
          })}
          hint="每次筛选变化后自动刷新分析"
        />
      </div>

      <Panel
        title="智能体摘要"
        subtitle="自动诊断当前工时结构中的异常与风险"
        note="这不是绩效评分，而是基于工时、碎片化、项目切换、主题复杂度和 mock 协同数据生成的管理诊断。"
        className="panel-wide"
        meta={
          <div className="chart-meta">
            <MetaPill tone="derived">规则推导</MetaPill>
            <span>方法：阈值规则 + 质量信号 + mock 协同数据</span>
            <span>可靠性：{view.dataHealth.sampleDays < 14 ? '中低' : '中'}</span>
            <span>注意：建议先结合质量页验证再下结论</span>
          </div>
        }
      >
        <div className="agent-summary">
          <p>{view.agentReport.summary}</p>
          <div className="agent-tags">
            <span>高风险 {issueSummary.high}</span>
            <span>中风险 {issueSummary.medium}</span>
            <span>低风险 {issueSummary.low}</span>
          </div>
        </div>
      </Panel>

      <Panel
        title="异常报告"
        subtitle="智能体判定的重点异常"
        note="每条异常都包含证据和对应动作，便于项目经理直接拿去复盘。"
        className="panel-wide"
      >
        <div className="agent-issues">
          {view.agentReport.issues.length ? (
            view.agentReport.issues.map((issue) => (
              <article key={issue.id} className={`agent-issue severity-${issue.severity}`}>
                <div className="agent-issue-header">
                  <div>
                    <p className="panel-kicker">{issue.title}</p>
                    <h4>{issue.subjectReal}</h4>
                  </div>
                  <div className="agent-issue-actions">
                    <span className="issue-badge">
                      {severityLabel(issue.severity)} / {issue.scope}
                    </span>
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() =>
                        onNavigate(
                          issue.scope === 'employee'
                            ? 'employees'
                            : issue.scope === 'project'
                              ? 'projects'
                              : 'quality',
                        )
                      }
                    >
                      查看证据页
                    </button>
                  </div>
                </div>
                <p className="agent-issue-summary">{issue.summary}</p>
                <div className="agent-columns">
                  <div>
                    <strong>证据</strong>
                    <ul className="report-list">
                      {issue.evidence.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <strong>建议动作</strong>
                    <ul className="report-list">
                      {issue.recommendations.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <p className="report-text">当前筛选范围内没有达到阈值的异常项。</p>
          )}
        </div>
      </Panel>

      <Panel
        title="优化建议"
        subtitle="智能体给出的优先级动作"
        note="建议按 P1 到 P3 排序执行，先动组织与排班，再补数据和工具。"
      >
        <div className="agent-recommendations">
          {view.agentReport.recommendations.map((recommendation) => (
            <div className="agent-recommendation" key={recommendation.title}>
              <div className="agent-recommendation-header">
                <strong>{recommendation.title}</strong>
                <span className="priority-badge">{recommendation.priority}</span>
              </div>
              <p>{recommendation.rationale}</p>
              <ul className="report-list">
                {recommendation.actions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="模型接口"
        subtitle="Gemini 本地代理调用与结构化提示词"
        note="Gemini 使用项目根目录 .env 中的 GEMINI_API_KEY 和 GEMINI_MODEL。前端不会直接暴露 key。"
        badge={geminiConfigured ? 'Gemini 已配置' : '待配置 .env'}
      >
        <div className="prompt-box">
          <pre>{view.agentReport.llmPrompt}</pre>
        </div>
        <div className="prompt-actions">
          <button className="primary-button" onClick={copyPrompt} type="button">
            {copyState === 'done'
              ? '已复制'
              : copyState === 'error'
                ? '复制失败'
              : '复制 Prompt'}
          </button>
          <button
            className="primary-button"
            onClick={runGeminiAnalysis}
            type="button"
            disabled={geminiStatus === 'loading'}
          >
            {geminiStatus === 'loading' ? 'Gemini 分析中...' : '运行 Gemini 分析'}
          </button>
          <span>默认只包含脱敏和结构化信息，不包含 AI 原文对话。</span>
        </div>
        {geminiError ? <p className="error-text">{geminiError}</p> : null}
      </Panel>

      <Panel
        title="Gemini 输出"
        subtitle="真实大模型返回的异常分析与优化建议"
        note="如果尚未配置 .env 或本地代理未启动，这里会保持为空。"
        className="panel-wide"
      >
        {geminiResult ? (
          <div className="prompt-box">
            <pre>{geminiResult}</pre>
          </div>
        ) : (
          <p className="report-text">
            还没有 Gemini 输出。先在项目根目录创建 `.env`，填入 `GEMINI_API_KEY` 和
            `GEMINI_MODEL`，再点击“运行 Gemini 分析”。
          </p>
        )}
      </Panel>
    </div>
  );
}
