import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ChartPanel } from '../components/ChartPanel';
import { DataTable } from '../components/DataTable';
import { MetaPill } from '../components/MetaPill';
import { Panel } from '../components/Panel';
import { analysisConfig } from '../config/analysisConfig';
import { topicColor } from '../lib/chartColors';
import { formatNumber, formatPercent } from '../lib/format';
import { buildTopicExplanation } from '../lib/topicExplain';
import type { AnalyticsView, DetailSelection } from '../types';

interface TasksPageProps {
  view: AnalyticsView;
  onOpenDetail: (detail: DetailSelection) => void;
}

type TaskWorkspaceMode = 'explain' | 'all';

function TopicExplanationCell({
  task,
  compact = false,
}: {
  task: AnalyticsView['tasks'][number];
  compact?: boolean;
}) {
  const explanation = buildTopicExplanation(task);

  return (
    <div className={`topic-explain ${compact ? 'compact' : ''}`.trim()}>
      <div className="topic-explain-topline">
        <strong>{explanation.ruleLabel}</strong>
        <MetaPill tone={explanation.usedFallback ? 'warning' : 'derived'}>
          {explanation.usedFallback ? 'Fallback' : '规则命中'}
        </MetaPill>
      </div>
      <span>
        可信度 {formatPercent(explanation.confidence)}
        {explanation.matchedKeywords.length
          ? ` · 关键词 ${explanation.matchedKeywords.join(' / ')}`
          : ' · 当前无稳定关键词'}
      </span>
    </div>
  );
}

export function TasksPage({ view, onOpenDetail }: TasksPageProps) {
  const [workspaceMode, setWorkspaceMode] = useState<TaskWorkspaceMode>('explain');
  const topicRank = [...view.topicStats].sort((left, right) => right.totalHours - left.totalHours);
  const uncategorizedCount = view.tasks.filter((task) => task.topicLabel === '未分类').length;
  const pendingCount = view.tasks.filter((task) => task.topicLabel === '待确认').length;
  const lowConfidenceCount = view.tasks.filter(
    (task) =>
      task.topicLabel !== '未分类' &&
      task.topicLabel !== '待确认' &&
      task.topicConfidence < analysisConfig.thresholds.lowTopicConfidence,
  ).length;
  const topTopic = topicRank[0];

  const topicOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 24, right: 20, top: 24, bottom: 40, containLabel: true },
    xAxis: { type: 'value', name: '总工时（h）' },
    yAxis: { type: 'category', inverse: true, data: topicRank.map((item) => item.topicLabel) },
    series: [
      {
        type: 'bar',
        data: topicRank.map((item) => item.totalHours),
        itemStyle: {
          borderRadius: 10,
          color: (params: { dataIndex: number }) =>
            topicColor(topicRank[params.dataIndex]?.topicLabel ?? '', params.dataIndex),
        },
      },
    ],
  };

  const treeOption = {
    tooltip: { trigger: 'item' },
    series: [
      {
        type: 'treemap',
        roam: false,
        breadcrumb: { show: false },
        color: view.topicStats.map((item, index) => topicColor(item.topicLabel, index)),
        data: view.topicStats.map((item) => ({
          name: item.topicLabel,
          value: item.taskCount,
        })),
      },
    ],
  };

  const keywordEntries = Array.from(
    view.tasks.reduce((map, task) => {
      task.keywordHits.forEach((keyword) => {
        map.set(keyword, (map.get(keyword) ?? 0) + task.reportHour);
      });
      return map;
    }, new Map<string, number>()),
  )
    .sort((left, right) => right[1] - left[1])
    .slice(0, analysisConfig.displayLimits.taskKeywordCount);

  const keywordOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 24, right: 20, top: 24, bottom: 40, containLabel: true },
    xAxis: { type: 'category', data: keywordEntries.map(([keyword]) => keyword) },
    yAxis: { type: 'value', name: '工时' },
    series: [
      {
        type: 'bar',
        data: keywordEntries.map(([, hours]) => hours),
        itemStyle: { color: '#ff9f0a', borderRadius: 10 },
      },
    ],
  };

  const columns: Array<ColumnDef<(typeof view.tasks)[number]>> = [
    { header: '日期', accessorKey: 'date' },
    { header: '项目', accessorKey: 'projectName' },
    { header: '任务名称', accessorKey: 'taskName' },
    {
      header: '工时',
      cell: ({ row }) => `${formatNumber(row.original.reportHour)} h`,
    },
    { header: '主题', accessorKey: 'topicLabel' },
    {
      header: '分类可信度',
      cell: ({ row }) => formatPercent(row.original.topicConfidence),
    },
  ];

  const explanationColumns: Array<ColumnDef<(typeof view.tasks)[number]>> = [
    { header: '日期', accessorKey: 'date' },
    { header: '项目', accessorKey: 'projectName' },
    { header: '任务名称', accessorKey: 'taskName' },
    { header: '当前分类', accessorKey: 'topicLabel' },
    {
      header: '分类命中详情',
      cell: ({ row }) => <TopicExplanationCell task={row.original} />,
    },
  ];
  const currentWorkspace =
    workspaceMode === 'explain'
        ? {
            title: '分类命中详情',
            subtitle: '逐条查看任务到底命中了哪条规则',
            note:
              '这里专门保留内容和分类解释，不再承担待确认、未分类、低可信这类质量治理清单。',
            emptyMessage: '当前没有可显示的分类命中数据。',
          }
        : {
            title: '全部任务',
            subtitle: '需要时再展开完整明细，不把首屏拉成长报表',
            note:
              '这里保留最基础的任务明细，用来回查日期、项目、工时和主题映射。默认只在工作台里查看。',
            emptyMessage: '当前没有任务明细。',
          };

  return (
    <div className="page-grid">
      <Panel
        title="任务画像"
        subtitle="先看当前样本里的主要任务主题"
        note="这里直接使用任务主题本身，不再额外映射成建设、修补或支撑等二级分类。"
        className="panel-wide panel-strip"
      >
        <div className="callout">
          <strong>{topTopic ? `${topTopic.topicLabel} 是当前工时占比最高的任务主题。` : '当前没有足够任务样本用于画像。'}</strong>
          <span>
            {topTopic
              ? `${topTopic.topicLabel} 累计 ${formatNumber(topTopic.totalHours)}h，共 ${topTopic.taskCount} 条任务。建议先看主题分布，再回到复核清单补规则。`
              : `当前共 ${view.tasks.length} 条任务，未分类 ${uncategorizedCount} 条，待确认 ${pendingCount} 条，低可信度 ${lowConfidenceCount} 条。`}
          </span>
        </div>
      </Panel>

      <Panel
        title="分类解释"
        subtitle="现在可以直接看到任务是怎么被归类的"
        note="分类命中详情会展示命中规则名、关键词、可信度，以及是否走了 fallback 兜底。"
        className="panel-wide panel-strip"
        meta={
          <div className="chart-meta">
            <MetaPill tone="derived">规则词典</MetaPill>
            <span>可复核字段：规则名 / 关键词 / 可信度 / fallback</span>
            <span>待确认、未分类和低可信治理清单已迁到数据质量页</span>
          </div>
        }
      >
        <div className="callout">
          <strong>点击任一任务后，可以继续在任务聚焦页查看完整分类说明和关联上下文。</strong>
          <span>这轮改动的目标不是让分类“看起来更聪明”，而是让它能被复核、能被修正。</span>
        </div>
      </Panel>

      <ChartPanel
        title="主题分类"
        subtitle="工时主要集中在哪类工作"
        note="这张图回答：开发、测试、部署、维护等主题在当前样本中的占比。"
        option={topicOption}
      />

      <ChartPanel
        title="主题树图"
        subtitle="任务主题的任务量分布"
        note="这张图回答：哪些主题更碎、更频繁。"
        option={treeOption}
      />

      <ChartPanel
        title="关键词画像"
        subtitle="高频任务关键词反映了什么工作性质"
        note="这张图回答：任务标题中的高频词更偏开发、维护还是沟通。"
        option={keywordOption}
      />

      <Panel
        title="任务复核工作台"
        subtitle={currentWorkspace.subtitle}
        note={currentWorkspace.note}
        className="panel-wide"
        actions={
          <div className="focus-tabs task-workspace-tabs" role="tablist" aria-label="任务工作台切换">
            {[
              ['explain', '分类命中'],
              ['all', `全部任务 ${view.tasks.length}`],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={workspaceMode === value}
                className={`focus-tab ${workspaceMode === value ? 'active' : ''}`.trim()}
                onClick={() => setWorkspaceMode(value as TaskWorkspaceMode)}
              >
                {label}
              </button>
            ))}
          </div>
        }
        meta={
          <div className="chart-meta">
            <MetaPill tone="derived">{currentWorkspace.title}</MetaPill>
            <span>{`待确认 ${pendingCount} 条`}</span>
            <span>{`未分类 ${uncategorizedCount} 条`}</span>
            <span>{`低可信 ${lowConfidenceCount} 条`}</span>
            <span>{`当前表格 ${view.tasks.length} 条`}</span>
          </div>
        }
      >
        {workspaceMode === 'explain' ? (
          <DataTable
            columns={explanationColumns}
            data={view.tasks}
            maxHeight={460}
            className="task-workspace-table"
            emptyMessage={currentWorkspace.emptyMessage}
            onRowClick={(task) =>
              onOpenDetail({
                kind: 'task',
                title: '任务聚焦分析',
                subtitle: task.taskName,
                taskId: task.taskId,
                rows: [],
              })
            }
          />
        ) : (
          <DataTable
            columns={columns}
            data={view.tasks}
            maxHeight={460}
            className="task-workspace-table"
            emptyMessage={currentWorkspace.emptyMessage}
            onRowClick={(task) =>
              onOpenDetail({
                kind: 'task',
                title: '任务聚焦分析',
                subtitle: task.taskName,
                taskId: task.taskId,
                rows: [],
              })
            }
          />
        )}
      </Panel>
    </div>
  );
}
