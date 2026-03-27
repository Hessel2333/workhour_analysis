import type { ColumnDef } from '@tanstack/react-table';
import { ChartPanel } from '../components/ChartPanel';
import { CollapsiblePanel } from '../components/CollapsiblePanel';
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
  const topicRank = [...view.topicStats].sort((left, right) => right.totalHours - left.totalHours);
  const reviewTasks = view.tasks.filter(
    (task) =>
      task.topicLabel === '未分类' ||
      task.topicLabel === '待确认' ||
      task.topicConfidence < analysisConfig.thresholds.lowTopicConfidence,
  );
  const uncategorizedCount = view.tasks.filter((task) => task.topicLabel === '未分类').length;
  const pendingCount = view.tasks.filter((task) => task.topicLabel === '待确认').length;
  const lowConfidenceCount = view.tasks.filter(
    (task) =>
      task.topicLabel !== '未分类' &&
      task.topicLabel !== '待确认' &&
      task.topicConfidence < analysisConfig.thresholds.lowTopicConfidence,
  ).length;
  const pendingTasks = view.tasks.filter((task) => task.topicLabel === '待确认');
  const reviewTasksWithoutPending = reviewTasks.filter((task) => task.topicLabel !== '待确认');
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

  const reviewColumns: Array<ColumnDef<(typeof reviewTasks)[number]>> = [
    { header: '日期', accessorKey: 'date' },
    { header: '项目', accessorKey: 'projectName' },
    { header: '任务名称', accessorKey: 'taskName' },
    { header: '当前分类', accessorKey: 'topicLabel' },
    {
      header: '可信度',
      cell: ({ row }) => formatPercent(row.original.topicConfidence),
    },
    {
      header: '分类命中详情',
      cell: ({ row }) => <TopicExplanationCell task={row.original} compact />,
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
            <span>建议优先处理待确认、未分类和低可信度任务</span>
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

      <CollapsiblePanel
        title="待确认清单"
        subtitle="这些任务有明显主题，但语义仍需要人工拍板"
        note="常见于日期占位任务、版本名、泛化项目名或内部缩写。点击行可直接打开任务详情。"
        defaultOpen={pendingTasks.length <= 18}
      >
        <DataTable
          columns={reviewColumns}
          data={pendingTasks}
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
      </CollapsiblePanel>

      <CollapsiblePanel
        title="分类复核清单"
        subtitle="人工复核剩余未分类与低可信度任务"
        note="建议优先补充高频任务关键词，再回看主题分布图。点击行可直接打开任务详情。"
        defaultOpen={reviewTasksWithoutPending.length <= 24}
      >
        <DataTable
          columns={reviewColumns}
          data={reviewTasksWithoutPending}
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
      </CollapsiblePanel>

      <CollapsiblePanel
        title="分类命中详情"
        subtitle="逐条查看任务到底命中了哪条规则"
        note="这里会同时显示规则名、关键词和 fallback 状态，适合给规则词典做增补。点击行可直接打开任务详情。"
        defaultOpen={view.tasks.length <= 16}
      >
        <DataTable
          columns={explanationColumns}
          data={view.tasks}
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
      </CollapsiblePanel>

      <CollapsiblePanel
        title="任务明细"
        subtitle="逐条核查主题映射与任务名"
        note="分类结果来自规则词典，未分类项会在数据质量页集中提示。"
        defaultOpen
      >
        <DataTable
          columns={columns}
          data={view.tasks}
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
      </CollapsiblePanel>
    </div>
  );
}
