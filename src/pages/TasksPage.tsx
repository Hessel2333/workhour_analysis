import type { ColumnDef } from '@tanstack/react-table';
import { ChartPanel } from '../components/ChartPanel';
import { CollapsiblePanel } from '../components/CollapsiblePanel';
import { DataTable } from '../components/DataTable';
import { MetaPill } from '../components/MetaPill';
import { Panel } from '../components/Panel';
import { analysisConfig } from '../config/analysisConfig';
import { topicColor } from '../lib/chartColors';
import { formatNumber, formatPercent } from '../lib/format';
import { classifyTaskWorkstream, WORKSTREAM_ORDER } from '../lib/taskSignals';
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
  const workstreamHours = WORKSTREAM_ORDER.map((label) => ({
    label,
    totalHours: view.tasks
      .filter((task) => classifyTaskWorkstream(task) === label)
      .reduce((sum, task) => sum + task.reportHour, 0),
  })).filter((item) => item.totalHours > 0);
  const totalWorkstreamHours = workstreamHours.reduce((sum, item) => sum + item.totalHours, 0);
  const dominantWorkstream = [...workstreamHours].sort((left, right) => right.totalHours - left.totalHours)[0];
  const reworkLikeHours = workstreamHours.find((item) => item.label === '修补型')?.totalHours ?? 0;
  const buildLikeHours = workstreamHours.find((item) => item.label === '建设型')?.totalHours ?? 0;

  const topicOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 24, right: 20, top: 24, bottom: 40, containLabel: true },
    xAxis: { type: 'value', name: '总工时（h）' },
    yAxis: { type: 'category', data: view.topicStats.map((item) => item.topicLabel) },
    series: [
      {
        type: 'bar',
        data: view.topicStats.map((item) => item.totalHours),
        itemStyle: {
          borderRadius: 10,
          color: (params: { dataIndex: number }) =>
            topicColor(view.topicStats[params.dataIndex]?.topicLabel ?? '', params.dataIndex),
        },
      },
    ],
  };

  const portraitOption = {
    tooltip: {
      trigger: 'item',
      formatter: (params: { name?: string; value?: number }) => {
        const hours = Number(params.value ?? 0);
        return [
          `<strong>${String(params.name ?? '')}</strong>`,
          `工时：${formatNumber(hours)} h`,
          `占比：${formatPercent(totalWorkstreamHours ? hours / totalWorkstreamHours : 0)}`,
        ].join('<br/>');
      },
    },
    series: [
      {
        type: 'pie',
        radius: ['48%', '72%'],
        center: ['50%', '52%'],
        label: {
          formatter: '{b}\n{d}%',
          color: '#0f172a',
          fontWeight: 600,
        },
        labelLine: { length: 10, length2: 8 },
        data: workstreamHours.map((item) => ({
          name: item.label,
          value: Number(item.totalHours.toFixed(1)),
          itemStyle: {
            color:
              item.label === '建设型'
                ? '#2563eb'
                : item.label === '修补型'
                  ? '#ef4444'
                  : item.label === '支撑型'
                    ? '#f59e0b'
                    : item.label === '成长型'
                      ? '#8b5cf6'
                      : '#94a3b8',
          },
        })),
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
        subtitle="先看公司时间主要花在建设、修补还是支撑工作"
        note="长周期数据下，任务分类已经更稳定，但复杂语义任务仍建议人工复核。"
        className="panel-wide panel-strip"
      >
        <div className="callout">
          <strong>{dominantWorkstream ? `${dominantWorkstream.label} 是当前占比最高的任务类型。` : '当前没有可解释的任务画像。'}</strong>
          <span>
            {buildLikeHours > 0 || reworkLikeHours > 0
              ? `建设型工时 ${formatNumber(buildLikeHours)}h，修补型工时 ${formatNumber(reworkLikeHours)}h。先看整体画像，再回看复核清单。`
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
        title="公司整体任务类型画像"
        subtitle="整体时间更偏建设、修补还是支撑工作"
        note={
          dominantWorkstream
            ? `${dominantWorkstream.label} 当前占比最高，${reworkLikeHours > buildLikeHours ? '修补型工时已经高于建设型，建议重点关注返工压力。' : '整体仍以建设型工作为主。'}`
            : '当前没有足够任务样本用于画像。'
        }
        option={portraitOption}
        source="derived"
        method="按任务主题归并为建设型 / 修补型 / 支撑型 / 成长型 / 待确认"
        reliability="中"
        caution="整体画像适合看公司工作重心，不适合替代项目级或员工级复盘"
      />

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
