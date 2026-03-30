import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChartPanel } from '../components/ChartPanel';
import { CollapsiblePanel } from '../components/CollapsiblePanel';
import { MetricCard } from '../components/MetricCard';
import { MetaPill } from '../components/MetaPill';
import { Panel } from '../components/Panel';
import { analysisConfig } from '../config/analysisConfig';
import { useDarkMode } from '../hooks/useDarkMode';
import { formatNumber, formatPercent, severityLabel } from '../lib/format';
import type { AnalyticsView, PageKey } from '../types';

interface AgentPageProps {
  view: AnalyticsView;
  onNavigate: (page: PageKey) => void;
}

type GeminiOutputSource = 'model' | 'fallback';

type GeminiReportBlock =
  | { kind: 'heading'; depth: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'divider' }
  | { kind: 'callout'; text: string };

function scopeLabel(scope: 'employee' | 'project' | 'dataset') {
  if (scope === 'employee') return '员工侧';
  if (scope === 'project') return '项目侧';
  return '数据侧';
}

function renderInlineText(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((segment, index) => {
    if (segment.startsWith('**') && segment.endsWith('**')) {
      return <strong key={`${segment}-${index}`}>{segment.slice(2, -2)}</strong>;
    }

    return <Fragment key={`${segment}-${index}`}>{segment}</Fragment>;
  });
}

function parseGeminiReport(text: string): GeminiReportBlock[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: GeminiReportBlock[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
    paragraph = [];
  };

  const flushList = () => {
    if (!listItems.length) return;
    blocks.push({ kind: 'list', items: listItems });
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      blocks.push({
        kind: 'heading',
        depth: headingMatch[1].length,
        text: headingMatch[2].trim(),
      });
      continue;
    }

    if (/^---+$/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push({ kind: 'divider' });
      continue;
    }

    if (/^(提示|说明)[:：]/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push({ kind: 'callout', text: line });
      continue;
    }

    const listMatch = line.match(/^(?:[-*]|\d+\.)\s+(.+)$/);
    if (listMatch) {
      flushParagraph();
      listItems.push(listMatch[1].trim());
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  flushList();

  return blocks;
}

function buildFallbackGeminiReport(view: AnalyticsView) {
  const { agentReport, dataHealth, globalMetrics, uniqueDates } = view;
  const employeeIssues = agentReport.issues.filter((issue) => issue.scope === 'employee');
  const projectIssues = agentReport.issues.filter((issue) => issue.scope === 'project');
  const datasetIssues = agentReport.issues.filter((issue) => issue.scope === 'dataset');
  const topIssues = agentReport.issues.slice(0, 3);
  const topActions = agentReport.recommendations.slice(0, 3);
  const startDate = uniqueDates[0] ?? '--';
  const endDate = uniqueDates[uniqueDates.length - 1] ?? '--';

  return [
    '说明：当前为演示模式。由于环境未接入 Gemini API Key，以下内容基于页面已有的规则诊断自动整理，适合演示界面与阅读方式，不替代真实模型输出。',
    '',
    '## 一句话判断',
    agentReport.summary,
    '',
    '## 样本快照',
    `- 时间范围：${startDate} 至 ${endDate}`,
    `- 总工时：${formatNumber(globalMetrics.totalHours)} h`,
    `- 活跃员工：${globalMetrics.activeEmployees}`,
    `- 异常负载日占比：${formatPercent(globalMetrics.anomalyDayRate)}`,
    `- 数据健康：${dataHealth.status === 'healthy' ? '可读性较高' : dataHealth.status === 'watch' ? '需谨慎阅读' : '限制较多'}`,
    '',
    '## 优先关注对象',
    ...(topIssues.length
      ? topIssues.map(
          (issue) =>
            `- **${issue.subjectReal}**：${issue.summary}（${severityLabel(issue.severity)}风险 / ${scopeLabel(issue.scope)}）`,
        )
      : ['- 当前筛选范围内没有达到阈值的重点异常。']),
    '',
    '## 员工侧风险',
    ...(employeeIssues.length
      ? employeeIssues.slice(0, 3).map(
          (issue) =>
            `- **${issue.subjectReal}**：${issue.evidence.slice(0, 2).join('；')}。建议：${issue.recommendations.slice(0, 2).join('；')}`,
        )
      : ['- 当前没有显著的员工侧高风险项，更多是结构性提醒。']),
    '',
    '## 项目侧风险',
    ...(projectIssues.length
      ? projectIssues.slice(0, 3).map(
          (issue) =>
            `- **${issue.subjectReal}**：${issue.evidence.slice(0, 2).join('；')}。建议：${issue.recommendations.slice(0, 2).join('；')}`,
        )
      : ['- 当前没有显著的项目侧高风险项。']),
    '',
    '## 下周动作建议',
    ...topActions.map(
      (item, index) =>
        `${index + 1}. **${item.title}（${item.priority}）**：${item.rationale}。动作：${item.actions.slice(0, 2).join('；')}`,
    ),
    '',
    '## 需要补采或补核的数据',
    ...(datasetIssues.length
      ? datasetIssues.flatMap((issue) =>
          issue.recommendations.slice(0, 2).map((item) => `- ${item}`),
        )
      : [
          '- 补齐核验字段与跨系统映射，减少样本偏差。',
          '- 累计更长时间窗后再做稳定趋势判断。',
        ]),
  ].join('\n');
}

function formatGeneratedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '刚刚生成';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  const [geminiSource, setGeminiSource] = useState<GeminiOutputSource | null>(null);
  const [geminiGeneratedAt, setGeminiGeneratedAt] = useState('');

  const issueSummary = view.agentReport.issues.reduce(
    (summary, issue) => {
      summary[issue.severity] += 1;
      return summary;
    },
    { high: 0, medium: 0, low: 0 },
  );
  const scopeSummary = view.agentReport.issues.reduce(
    (summary, issue) => {
      summary[issue.scope] += 1;
      return summary;
    },
    { employee: 0, project: 0, dataset: 0 },
  );
  const recommendationSummary = view.agentReport.recommendations.reduce(
    (summary, item) => {
      summary[item.priority] += 1;
      return summary;
    },
    { P1: 0, P2: 0, P3: 0 },
  );

  const topIssue = view.agentReport.issues[0];
  const dominantScope = useMemo(() => {
    return (
      Object.entries(scopeSummary).sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'dataset'
    );
  }, [scopeSummary]);
  const geminiReportBlocks = useMemo(() => parseGeminiReport(geminiResult), [geminiResult]);

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

    const applyFallback = () => {
      setGeminiResult(buildFallbackGeminiReport(view));
      setGeminiSource('fallback');
      setGeminiGeneratedAt(new Date().toISOString());
      setGeminiStatus('done');
      setGeminiError('');
      setGeminiModel('演示模式');
    };

    if (!geminiConfigured) {
      applyFallback();
      return;
    }

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

      setGeminiModel(typeof payload?.model === 'string' ? payload.model : geminiModel);
      setGeminiResult(typeof payload?.text === 'string' ? payload.text : '');
      setGeminiSource('model');
      setGeminiGeneratedAt(new Date().toISOString());
      setGeminiStatus('done');
    } catch (error) {
      if (error instanceof Error && /GEMINI_API_KEY|代理未连接|Failed to fetch|fetch/i.test(error.message)) {
        applyFallback();
        return;
      }

      setGeminiError(error instanceof Error ? error.message : 'Gemini 分析失败。');
      setGeminiStatus('error');
    }
  };

  const isDark = useDarkMode();

  const severityOption = {
    tooltip: { trigger: 'item' },
    series: [
      {
        type: 'pie',
        radius: ['56%', '76%'],
        label: { 
          formatter: '{b}\n{d}%', 
          color: isDark ? '#f5f5f7' : '#1d1d1f', 
          fontWeight: 600 
        },
        data: [
          { name: '高风险', value: issueSummary.high, itemStyle: { color: '#ff3b30' } },
          { name: '中风险', value: issueSummary.medium, itemStyle: { color: '#ff9500' } },
          { name: '低风险', value: issueSummary.low, itemStyle: { color: '#8e8e93' } },
        ],
      },
    ],
  };

  const scopeOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 24, right: 20, top: 24, bottom: 40, containLabel: true },
    xAxis: { type: 'value', name: '问题数量' },
    yAxis: {
      type: 'category',
      data: ['员工侧', '项目侧', '数据侧'],
    },
    series: [
      {
        type: 'bar',
        data: [scopeSummary.employee, scopeSummary.project, scopeSummary.dataset],
        itemStyle: { color: isDark ? '#0a84ff' : '#0071e3', borderRadius: 10 },
      },
    ],
  };

  const recommendationOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 24, right: 20, top: 24, bottom: 40, containLabel: true },
    xAxis: { type: 'category', data: ['P1', 'P2', 'P3'] },
    yAxis: { type: 'value', name: '问题数量' },
    series: [
      {
        type: 'bar',
        data: [
          recommendationSummary.P1,
          recommendationSummary.P2,
          recommendationSummary.P3,
        ],
        itemStyle: {
          color: (params: { dataIndex: number }) =>
            [isDark ? '#ff3b30' : '#ff3b30', isDark ? '#ff9500' : '#ff9500', isDark ? '#8e8e93' : '#94a3b8'][params.dataIndex] ?? '#8e8e93',
          borderRadius: 10,
        },
      },
    ],
  };

  return (
    <div className="page-grid">
      <div className="metrics-grid">
        <MetricCard
          label="规则诊断"
          value={`${view.agentReport.issues.length}`}
          hint="当前筛选口径下的风险项"
          tone="derived"
        />
        <MetricCard
          label="高风险"
          value={`${issueSummary.high}`}
          hint={topIssue ? `当前最严重：${topIssue.subjectReal}` : '当前没有高风险项'}
          tone={issueSummary.high > 0 ? 'warning' : 'healthy'}
        />
        <MetricCard
          label="风险集中"
          value={dominantScope === 'employee' ? '员工侧' : dominantScope === 'project' ? '项目侧' : '数据侧'}
          hint="这决定了先看员工页、项目页还是质量页"
          tone="real"
        />
        <MetricCard
          label="Gemini"
          value={geminiConfigured ? '已连接' : '未连接'}
          hint={geminiModel}
          tone={geminiConfigured ? 'model' : 'mock'}
        />
      </div>

      <Panel
        title="智能分析"
        subtitle="先看规则诊断，再决定是否调用 Gemini 深化解释"
        className="panel-wide panel-strip"
        meta={
          <div className="summary-ribbon">
            <strong>{view.agentReport.summary}</strong>
            <span>规则诊断先输出可复核线索</span>
            <span>Gemini 负责补充自然语言解释</span>
            <span>不要把本页结果直接当绩效结论</span>
          </div>
        }
      >
        <div className="agent-topline">
          <MetaPill tone="derived">规则诊断</MetaPill>
          <MetaPill tone={geminiConfigured ? 'model' : 'mock'}>
            {geminiConfigured ? 'Gemini 已就绪' : 'Gemini 未连接'}
          </MetaPill>
          <MetaPill tone={view.dataHealth.status === 'healthy' ? 'healthy' : 'warning'}>
            {view.dataHealth.status === 'healthy' ? '可读性较高' : '需结合数据限制阅读'}
          </MetaPill>
        </div>
      </Panel>

      <ChartPanel
        title="风险等级分布"
        subtitle="高、中、低风险各有多少项"
        note={issueSummary.high > 0 ? '当前仍有高风险项，优先复盘这些对象。' : '当前没有高风险项，更多是结构性提醒。'}
        option={severityOption}
        source="derived"
        method="按规则诊断结果聚合严重程度"
        reliability="中"
        caution="这是复盘优先级，不是结果评价"
      />

      <ChartPanel
        title="风险落点"
        subtitle="问题更集中在员工、项目还是数据"
        note={`当前风险更集中在${dominantScope === 'employee' ? '员工侧' : dominantScope === 'project' ? '项目侧' : '数据侧'}。`}
        option={scopeOption}
        source="derived"
        method="按问题作用域聚合"
        reliability="中"
        caution="建议据此决定先去哪个页面下钻"
      />

      <ChartPanel
        title="动作优先级"
        subtitle="先做 P1，再做 P2 / P3"
        note={recommendationSummary.P1 > 0 ? `当前有 ${recommendationSummary.P1} 条 P1 动作建议优先处理。` : '当前没有必须立刻执行的 P1 动作。'}
        option={recommendationOption}
        source="derived"
        method="按建议优先级聚合"
        reliability="中"
        caution="建议先改排班、切换和返工，再补工具或数据"
      />

      <Panel
        title="重点异常"
        subtitle="把最值得看的问题收成紧凑卡片"
        className="panel-wide"
      >
          <div className="analysis-card-grid">
          {view.agentReport.issues.length ? (
            view.agentReport.issues
              .slice(0, analysisConfig.displayLimits.agentIssueCards)
              .map((issue) => (
              <article key={issue.id} className={`analysis-card severity-${issue.severity}`}>
                <div className="analysis-card-header">
                  <div>
                    <strong>{issue.subjectReal}</strong>
                    <p>{issue.title}</p>
                  </div>
                  <span className="issue-badge">
                    {severityLabel(issue.severity)} / {issue.scope === 'employee' ? '员工侧' : issue.scope === 'project' ? '项目侧' : '数据侧'}
                  </span>
                </div>
                <p className="analysis-card-summary">{issue.summary}</p>
                <div className="analysis-chip-row">
                  {issue.evidence.slice(0, 2).map((item) => (
                    <span key={item} className="analysis-chip">
                      {item}
                    </span>
                  ))}
                </div>
                <div className="analysis-card-actions">
                  {issue.recommendations.slice(0, 2).map((item) => (
                    <span key={item} className="analysis-chip analysis-chip-strong">
                      {item}
                    </span>
                  ))}
                </div>
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
                  去对应页面
                </button>
              </article>
            ))
          ) : (
            <p className="report-text">当前筛选范围内没有达到阈值的异常项。</p>
          )}
        </div>
      </Panel>

      <Panel title="动作建议" subtitle="不看长文，直接看要做什么">
        <div className="analysis-list">
          {view.agentReport.recommendations.map((recommendation) => (
            <div key={recommendation.title} className="analysis-list-row">
              <div>
                <div className="analysis-list-title">
                  <strong>{recommendation.title}</strong>
                  <span className="priority-badge">{recommendation.priority}</span>
                </div>
                <p>{recommendation.rationale}</p>
              </div>
              <div className="analysis-chip-row">
                {recommendation.actions.slice(0, 3).map((action) => (
                  <span key={action} className="analysis-chip">
                    {action}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="Gemini 分析"
        subtitle="把模型结果整理成适合演示和复盘的分析报告"
        className="panel-wide"
        meta={
          <div className="chart-meta">
            <MetaPill tone={geminiSource === 'fallback' ? 'mock' : geminiConfigured ? 'model' : 'mock'}>
              {geminiSource === 'fallback' ? '演示模式' : geminiConfigured ? '已连接' : '待配置'}
            </MetaPill>
            <span>前面的内容来自规则诊断</span>
            <span>这里输出更适合阅读的自然语言报告</span>
          </div>
        }
      >
        <div className="gemini-toolbar">
          <div className="gemini-toolbar-main">
            <button
              className="primary-button"
              onClick={runGeminiAnalysis}
              type="button"
              disabled={geminiStatus === 'loading'}
            >
              {geminiStatus === 'loading'
                ? 'Gemini 分析中...'
                : geminiConfigured
                  ? '运行 Gemini 分析'
                  : '生成演示报告'}
            </button>
            <button className="ghost-button" onClick={copyPrompt} type="button">
              {copyState === 'done'
                ? '已复制'
                : copyState === 'error'
                  ? '复制失败'
                : '复制 Prompt'}
            </button>
          </div>
          {geminiResult ? (
            <div className="analysis-chip-row">
              <span className="analysis-chip">
                {geminiSource === 'fallback' ? '来源：演示模式' : '来源：Gemini 实时输出'}
              </span>
              <span className="analysis-chip">
                模型：{geminiSource === 'fallback' ? '演示模式' : geminiModel}
              </span>
              <span className="analysis-chip">
                更新时间：{formatGeneratedAt(geminiGeneratedAt || view.agentReport.generatedAt)}
              </span>
            </div>
          ) : null}
        </div>

        {geminiError ? <p className="error-text">{geminiError}</p> : null}

        {geminiResult ? (
          <div className="gemini-report">
            <div className="gemini-report-header">
              <div>
                <span className="panel-kicker">
                  {geminiSource === 'fallback' ? '演示模式报告' : 'Gemini 报告'}
                </span>
                <h3>
                  {geminiSource === 'fallback'
                    ? '未接入 API key 时的可读演示版本'
                    : '已整理为更适合阅读和汇报的分析版本'}
                </h3>
              </div>
            </div>
            <div className="gemini-report-body">
              {geminiReportBlocks.map((block, index) => {
                if (block.kind === 'heading') {
                  return (
                    <div key={`heading-${index}`} className="gemini-report-section">
                      <h4>{renderInlineText(block.text)}</h4>
                    </div>
                  );
                }

                if (block.kind === 'paragraph') {
                  return (
                    <p key={`paragraph-${index}`} className="gemini-report-paragraph">
                      {renderInlineText(block.text)}
                    </p>
                  );
                }

                if (block.kind === 'list') {
                  return (
                    <ul key={`list-${index}`} className="gemini-report-list">
                      {block.items.map((item, itemIndex) => (
                        <li key={`${item}-${itemIndex}`}>{renderInlineText(item)}</li>
                      ))}
                    </ul>
                  );
                }

                if (block.kind === 'callout') {
                  return (
                    <div key={`callout-${index}`} className="gemini-report-callout">
                      {renderInlineText(block.text)}
                    </div>
                  );
                }

                return <div key={`divider-${index}`} className="gemini-report-divider" />;
              })}
            </div>
          </div>
        ) : (
          <div className="gemini-empty">
            <strong>还没有 Gemini 输出</strong>
            <p>
              前面的内容已经可以作为规则诊断使用；如果你需要更自然、更像汇报稿的异常综述和管理建议，再运行分析。
            </p>
          </div>
        )}

        <CollapsiblePanel
          title="结构化 Prompt"
          subtitle="按需展开查看"
          note="只保留结构化指标和摘要，不包含原始聊天文本。"
          defaultOpen={false}
          className="panel-strip"
        >
          <div className="prompt-box prompt-box-light">
            <pre>{view.agentReport.llmPrompt}</pre>
          </div>
        </CollapsiblePanel>
      </Panel>
    </div>
  );
}
