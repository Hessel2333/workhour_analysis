import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ChartPanel } from '../components/ChartPanel';
import { DataTable } from '../components/DataTable';
import { MetaPill } from '../components/MetaPill';
import { Panel } from '../components/Panel';
import { analysisConfig } from '../config/analysisConfig';
import {
  formatNumber,
  formatPercent,
  qualityEntityTypeLabel,
  qualityFlagTypeLabel,
  severityLabel,
} from '../lib/format';
import {
  buildKeywordNetwork,
  buildReviewKeywordFrequency,
  buildReviewTopicMap,
  buildVerifyGapDistribution,
} from '../lib/qualityExploration';
import { isReworkTask } from '../lib/taskSignals';
import type { AnalyticsView, BaseDataset, DetailSelection } from '../types';

interface QualityPageProps {
  dataset: BaseDataset;
  view: AnalyticsView;
  onOpenDetail: (detail: DetailSelection) => void;
}

type QualityWorkspaceMode = 'high' | 'task' | 'all';
type ReviewReason = '待确认' | '未分类' | '低可信度';

export function QualityPage({ dataset, view, onOpenDetail }: QualityPageProps) {
  const [workspaceMode, setWorkspaceMode] = useState<QualityWorkspaceMode>('high');
  const verifyGapDistribution = buildVerifyGapDistribution(view.employeeStats, view.employeeDays);
  const reviewKeywordFrequency = buildReviewKeywordFrequency(view.tasks);
  const reviewTopicMap = buildReviewTopicMap(view.tasks);
  const keywordNetwork = buildKeywordNetwork(view.tasks);
  const unverifiedTaskCount = view.tasks.filter(
    (task) => task.verifyState !== '已核验' && task.reportHour > 0,
  ).length;
  const classifiedTaskCount = view.tasks.filter(
    (task) => task.topicLabel !== '未分类' && task.topicLabel !== '待确认',
  ).length;
  const uncategorizedTaskCount = view.tasks.filter((task) => task.topicLabel === '未分类').length;
  const pendingTopicTaskCount = view.tasks.filter((task) => task.topicLabel === '待确认').length;
  const lowConfidenceTaskCount = view.tasks.filter(
    (task) =>
      task.topicLabel !== '未分类' &&
      task.topicLabel !== '待确认' &&
      task.topicConfidence < analysisConfig.thresholds.lowTopicConfidence,
  ).length;
  const verifiedTaskCount = view.tasks.filter(
    (task) =>
      task.topicLabel !== '未分类' &&
      task.topicLabel !== '待确认' &&
      task.verifyState === '已核验',
  ).length;
  const highConfidenceTaskCount = view.tasks.filter(
    (task) =>
      task.topicLabel !== '未分类' &&
      task.topicLabel !== '待确认' &&
      task.verifyState === '已核验' &&
      task.topicConfidence >= analysisConfig.thresholds.lowTopicConfidence,
  ).length;
  const emptyTaskNameCount = view.tasks.filter((task) => !task.taskName.trim()).length;
  const highIntensityDayCount = view.employeeDays.filter(
    (day) => day.reportHour >= analysisConfig.thresholds.highIntensityOvertimeHours,
  ).length;
  const reworkTaskCount = view.tasks.filter((task) => isReworkTask(task)).length;
  const funnelSteps = [
    {
      name: '原始任务数',
      value: dataset.ingestionSummary.rawTaskCount,
      detail: `包含原始文件中全部任务记录，其中有 ${dataset.ingestionSummary.excludedImpossibleTaskCount} 条任务位于不合法员工日内。`,
    },
    {
      name: '合法任务数',
      value: dataset.ingestionSummary.validTaskCount,
      detail: `已剔除 ${dataset.ingestionSummary.excludedImpossibleTaskCount} 条不可能工时任务。`,
    },
    {
      name: '已分类任务数',
      value: classifiedTaskCount,
      detail: `已排除“未分类 / 待确认”任务，剩余任务具备稳定主题标签。`,
    },
    {
      name: '已核验任务数',
      value: verifiedTaskCount,
      detail: '只统计已完成分类且 verifyState 为“已核验”的任务。',
    },
    {
      name: '高置信度任务数',
      value: highConfidenceTaskCount,
      detail: `在已核验任务中继续要求分类可信度 >= ${formatNumber(
        analysisConfig.thresholds.lowTopicConfidence * 100,
        0,
      )}%。`,
    },
  ];
  const largestDrop = funnelSteps
    .slice(1)
    .map((step, index) => ({
      from: funnelSteps[index].name,
      to: step.name,
      loss: funnelSteps[index].value - step.value,
    }))
    .sort((left, right) => right.loss - left.loss)[0];
  const severityOption = {
    tooltip: { trigger: 'item' },
    legend: { bottom: 0 },
    series: [
      {
        type: 'pie',
        radius: ['48%', '72%'],
        data: [
          { name: '高', value: view.qualitySummary.high },
          { name: '中', value: view.qualitySummary.medium },
          { name: '低', value: view.qualitySummary.low },
        ],
      },
    ],
  };

  const anomalyOption = {
    tooltip: { trigger: 'item' },
    xAxis: { type: 'value', name: '工时' },
    yAxis: { type: 'value', name: '任务数' },
    series: [
      {
        type: 'scatter',
        symbolSize: (value: number[]) => 16 + value[2] * 6,
        data: view.employeeDays.map((day) => [
          day.reportHour,
          day.taskCount,
          day.projectCount,
          `${day.employeeName} ${day.date}`,
        ]),
        itemStyle: {
          color: '#ff375f',
        },
      },
    ],
  };

  const flagCountEntries = Array.from(
    view.qualityFlags.reduce((map, flag) => {
      const label = qualityFlagTypeLabel(flag.flagType);
      map.set(label, (map.get(label) ?? 0) + 1);
      return map;
    }, new Map<string, number>()),
  ).sort((left, right) => right[1] - left[1]);
  const qualityFlagCounts = view.qualityFlags.reduce((map, flag) => {
    map.set(flag.flagType, (map.get(flag.flagType) ?? 0) + 1);
    return map;
  }, new Map<string, number>());
  const paretoEntries = [
    {
      label: '未核验任务',
      count: unverifiedTaskCount,
      detail: '任务级治理项，按当前筛选范围内 verifyState 不为“已核验”的任务统计。',
    },
    {
      label: '低置信度分类',
      count: lowConfidenceTaskCount,
      detail: `任务级治理项，按分类置信度低于 ${formatNumber(
        analysisConfig.thresholds.lowTopicConfidence * 100,
        0,
      )}% 统计。`,
    },
    {
      label: '任务未分类',
      count: uncategorizedTaskCount,
      detail: '任务级治理项，表示当前规则词典尚未覆盖这些任务名称。',
    },
    {
      label: '任务待确认',
      count: pendingTopicTaskCount,
      detail: '任务级治理项，表示命中了待确认规则，建议人工复核。',
    },
    {
      label: '高返工倾向任务',
      count: reworkTaskCount,
      detail: '任务级治理项，按维护/现场支持/返工关键词命中统计。',
    },
    {
      label: '高强度工时日',
      count: highIntensityDayCount,
      detail: `员工日级治理项，按日报工时 >= ${formatNumber(
        analysisConfig.thresholds.highIntensityOvertimeHours,
        0,
      )}h 统计。`,
    },
    {
      label: '多项目切换过高',
      count: qualityFlagCounts.get('high_project_switch') ?? 0,
      detail: '员工日级治理项，表示单日涉及项目数过多，存在较强切换成本。',
    },
    {
      label: '核验缺失',
      count: qualityFlagCounts.get('verify_missing') ?? 0,
      detail: '员工日级治理项，表示当天有工时但核验小时为 0。',
    },
    {
      label: '不可能工时',
      count: qualityFlagCounts.get('impossible_daily_hours') ?? 0,
      detail: '员工日级治理项，表示原始数据存在超出常识范围的工时记录，已被剔除。',
    },
    {
      label: '缺少工时明细',
      count: qualityFlagCounts.get('missing_detail_list') ?? 0,
      detail: '员工级治理项，表示该员工没有明细，无法进入任务与趋势分析。',
    },
    {
      label: '空任务描述',
      count: emptyTaskNameCount,
      detail: '任务级治理项，表示任务标题为空或仅包含空白字符。',
    },
    {
      label: '样本时间限制',
      count: qualityFlagCounts.get('limited_window') ?? 0,
      detail: '数据集级提醒，表示当前样本窗口偏短，更适合观察分布和异常。',
    },
  ]
    .filter((entry) => entry.count > 0)
    .sort((left, right) => right.count - left.count)
    .map((entry, index, entries) => {
      const total = entries.reduce((sum, item) => sum + item.count, 0);
      const cumulative = entries
        .slice(0, index + 1)
        .reduce((sum, item) => sum + item.count, 0);
      return {
        ...entry,
        cumulativeRatio: total ? cumulative / total : 0,
      };
    });
  const paretoHighlightCount = paretoEntries.length ? Math.max(1, Math.ceil(paretoEntries.length * 0.2)) : 0;
  const paretoHighlightCoverage =
    paretoEntries[paretoHighlightCount - 1]?.cumulativeRatio ?? 0;
  const paretoTopLabels = paretoEntries
    .slice(0, Math.min(3, paretoEntries.length))
    .map((entry) => entry.label)
    .join('、');
  const highSeverityFlags = view.qualityFlags.filter((flag) => flag.severity === 'high');
  const taskFlags = view.qualityFlags.filter((flag) => flag.entityType === 'task');
  const reviewQueue = view.tasks
    .filter(
      (task) =>
        task.topicLabel === '未分类' ||
        task.topicLabel === '待确认' ||
        task.topicConfidence < analysisConfig.thresholds.lowTopicConfidence,
    )
    .map((task) => ({
      ...task,
      reviewReason:
        task.topicLabel === '待确认'
          ? '待确认'
          : task.topicLabel === '未分类'
            ? '未分类'
            : '低可信度' as ReviewReason,
    }))
    .sort((left, right) => {
      const priority: Record<ReviewReason, number> = { 待确认: 0, 未分类: 1, 低可信度: 2 };
      return (
        priority[left.reviewReason] - priority[right.reviewReason] ||
        left.topicConfidence - right.topicConfidence
      );
    });

  const flagOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 24, right: 20, top: 24, bottom: 40, containLabel: true },
    xAxis: { type: 'value', name: '异常次数' },
    yAxis: { type: 'category', inverse: true, data: flagCountEntries.map(([flagType]) => flagType) },
    series: [
      {
        type: 'bar',
        data: flagCountEntries.map(([, count]) => count),
        itemStyle: { color: '#ff453a', borderRadius: 10 },
      },
    ],
  };
  const verifyGapDistributionOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: Array<{ axisValue?: string; value?: number }>) =>
        [
          `<strong>${params[0]?.axisValue ?? ''}</strong>`,
          `员工数：${params[0]?.value ?? 0}`,
          `平均核验缺口率：${formatNumber(verifyGapDistribution.averageRate, 1)}%`,
          `中位数：${formatNumber(verifyGapDistribution.medianRate, 1)}%`,
        ].join('<br/>'),
    },
    grid: { left: 36, right: 20, top: 24, bottom: 42 },
    xAxis: {
      type: 'category',
      name: '核验缺口率区间',
      data: verifyGapDistribution.bins.map((item) => item.label),
    },
    yAxis: {
      type: 'value',
      name: '员工数',
    },
    series: [
      {
        type: 'bar',
        barWidth: '64%',
        data: verifyGapDistribution.bins.map((item) => item.count),
        itemStyle: {
          color: '#f97316',
          borderRadius: [10, 10, 0, 0],
        },
      },
    ],
  };
  const keywordFrequencyOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: Array<{ name?: string; value?: number }>) => {
        const current = reviewKeywordFrequency.items.find((item) => item.keyword === params[0]?.name);
        return [
          `<strong>${params[0]?.name ?? ''}</strong>`,
          `命中任务数：${params[0]?.value ?? 0}`,
          `复核池任务总数：${reviewKeywordFrequency.totalReviewTasks}`,
          current ? `关键词热度：${formatNumber(current.count)} 次` : '',
        ]
          .filter(Boolean)
          .join('<br/>');
      },
    },
    grid: { left: 96, right: 20, top: 24, bottom: 42, containLabel: true },
    xAxis: {
      type: 'value',
      name: '命中任务数',
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: reviewKeywordFrequency.items.map((item) => item.keyword),
    },
    series: [
      {
        type: 'bar',
        data: reviewKeywordFrequency.items.map((item) => item.count),
        itemStyle: {
          color: '#8b5cf6',
          borderRadius: 10,
        },
        label: {
          show: true,
          position: 'right',
          color: '#475569',
        },
      },
    ],
  };
  const reviewTopicMapOption = {
    tooltip: {
      trigger: 'item',
      formatter: (params: {
        seriesName?: string;
        data?: { name?: string; value?: [number, number, number] };
      }) =>
        [
          `<strong>${params.data?.name ?? ''}</strong>`,
          `主题簇：${params.seriesName ?? ''}`,
          `命中任务数：${formatNumber(params.data?.value?.[2] ?? 0)}`,
        ].join('<br/>'),
    },
    legend: { top: 0 },
    grid: { left: 36, right: 20, top: 48, bottom: 36 },
    xAxis: {
      type: 'value',
      name: '语义主轴 1',
      scale: true,
    },
    yAxis: {
      type: 'value',
      name: '语义主轴 2',
      scale: true,
    },
    series: Array.from(new Set(reviewTopicMap.points.map((item) => item.clusterLabel))).map((label) => ({
      name: label,
      type: 'scatter',
      data: reviewTopicMap.points
        .filter((item) => item.clusterLabel === label)
        .map((item) => ({
          name: item.name,
          value: [item.x, item.y, item.value],
          symbolSize: 16 + item.value * 2,
        })),
    })),
  };
  const keywordNetworkOption = {
    tooltip: {
      formatter: (params: {
        dataType?: string;
        data?: { name?: string; value?: number; source?: string; target?: string };
      }) =>
        params.dataType === 'edge'
          ? [
              `<strong>${params.data?.source ?? ''} × ${params.data?.target ?? ''}</strong>`,
              `共同出现：${formatNumber(params.data?.value ?? 0)} 次`,
            ].join('<br/>')
          : [
              `<strong>${params.data?.name ?? ''}</strong>`,
              `热度：${formatNumber(params.data?.value ?? 0)} 次`,
            ].join('<br/>'),
    },
    legend: { top: 0 },
    series: [
      {
        type: 'graph',
        layout: 'force',
        roam: true,
        data: keywordNetwork.nodes,
        links: keywordNetwork.links,
        categories: [
          { name: '中文关键词' },
          { name: '英文/术语' },
        ],
        label: { show: true },
        force: {
          repulsion: 180,
          edgeLength: [50, 120],
        },
        lineStyle: {
          color: 'source',
          curveness: 0.08,
          opacity: 0.45,
        },
      },
    ],
  };
  const paretoOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (
        params: Array<{
          seriesName: string;
          value: number;
          dataIndex: number;
          marker: string;
        }>,
      ) => {
        const index = params[0]?.dataIndex ?? 0;
        const current = paretoEntries[index];
        if (!current) return '';
        return [
          `<strong>${current.label}</strong>`,
          `${params[0]?.marker ?? ''}数量：${formatNumber(current.count, 0)}`,
          `${params[1]?.marker ?? ''}累计覆盖：${formatPercent(current.cumulativeRatio)}`,
          current.detail,
        ].join('<br/>');
      },
    },
    grid: { left: 24, right: 36, top: 28, bottom: 48, containLabel: true },
    xAxis: {
      type: 'category',
      name: '问题类型',
      data: paretoEntries.map((entry) => entry.label),
      axisLabel: { interval: 0 },
    },
    yAxis: [
      { type: 'value', name: '问题数量' },
      {
        type: 'value',
        name: '累计覆盖率（%）',
        min: 0,
        max: 1,
        axisLabel: {
          formatter: (value: number) => formatPercent(value),
        },
      },
    ],
    series: [
      {
        name: '问题数量',
        type: 'bar',
        barMaxWidth: 48,
        data: paretoEntries.map((entry) => entry.count),
        itemStyle: {
          color: '#ff7a45',
          borderRadius: [12, 12, 0, 0],
        },
      },
      {
        name: '累计覆盖率',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbol: 'circle',
        symbolSize: 10,
        data: paretoEntries.map((entry) => Number(entry.cumulativeRatio.toFixed(4))),
        lineStyle: {
          color: '#2563eb',
          width: 3,
        },
        itemStyle: {
          color: '#2563eb',
        },
        markLine: {
          symbol: 'none',
          lineStyle: {
            type: 'dashed',
            color: '#94a3b8',
          },
          label: {
            formatter: '80%',
            color: '#475569',
          },
          data: [{ yAxis: 0.8 }],
        },
      },
    ],
  };
  const funnelOption = {
    tooltip: {
      trigger: 'item',
      formatter: (params: { name: string; value: number; dataIndex: number }) => {
        const current = funnelSteps[params.dataIndex];
        const previous = funnelSteps[params.dataIndex - 1];
        const conversion = previous?.value
          ? `${((current.value / previous.value) * 100).toFixed(1)}%`
          : '100.0%';
        return [
          `<strong>${current.name}</strong>`,
          `数量：${formatNumber(current.value, 0)}`,
          `相邻转化：${conversion}`,
          current.detail,
        ].join('<br/>');
      },
    },
    series: [
      {
        type: 'funnel',
        left: '10%',
        top: 16,
        bottom: 16,
        width: '80%',
        min: 0,
        max: Math.max(...funnelSteps.map((step) => step.value), 1),
        minSize: '28%',
        maxSize: '100%',
        sort: 'none',
        gap: 4,
        label: {
          show: true,
          position: 'inside',
          formatter: (params: { name: string; value: number }) =>
            `${params.name}\n${formatNumber(params.value, 0)}`,
          fontWeight: 600,
        },
        data: funnelSteps.map((step, index) => ({
          name: step.name,
          value: step.value,
          itemStyle: {
            color: ['#94a3b8', '#3b82f6', '#8b5cf6', '#0ea5a4', '#22c55e'][index],
          },
        })),
      },
    ],
  };

  const columns: Array<ColumnDef<(typeof view.qualityFlags)[number]>> = [
    {
      header: '类型',
      cell: ({ row }) => qualityFlagTypeLabel(row.original.flagType),
    },
    {
      header: '级别',
      cell: ({ row }) => severityLabel(row.original.severity),
    },
    {
      header: '对象类型',
      cell: ({ row }) => qualityEntityTypeLabel(row.original.entityType),
    },
    { header: '对象 ID', accessorKey: 'entityId' },
    { header: '说明', accessorKey: 'message' },
  ];
  const reviewQueueColumns: Array<ColumnDef<(typeof reviewQueue)[number]>> = [
    {
      header: '复核原因',
      cell: ({ row }) => (
        <MetaPill tone={row.original.reviewReason === '低可信度' ? 'warning' : 'derived'}>
          {row.original.reviewReason}
        </MetaPill>
      ),
    },
    { header: '日期', accessorKey: 'date' },
    { header: '项目', accessorKey: 'projectName' },
    { header: '任务名称', accessorKey: 'taskName' },
    { header: '当前分类', accessorKey: 'topicLabel' },
    {
      header: '可信度',
      cell: ({ row }) => formatPercent(row.original.topicConfidence),
    },
  ];
  const currentWorkspace =
    workspaceMode === 'high'
      ? {
          title: '高风险旗标',
          subtitle: '先处理最影响可信度的高风险项',
          note: '这里优先看高风险质量旗标，适合作为本轮治理的第一优先级。',
          emptyMessage: '当前没有高风险质量旗标。',
        }
      : workspaceMode === 'task'
        ? {
            title: '待复核任务',
            subtitle: '集中处理待确认、未分类和低可信任务',
            note: '这里统一承接任务页迁过来的质量治理清单，更适合直接回到任务文本、主题规则和核验流程上处理。',
            emptyMessage: '当前没有待复核任务。',
          }
        : {
            title: '全部质量旗标',
            subtitle: '需要时再查看完整旗标清单，不把页面拖成长报表',
            note: '保留完整清单用于回查对象、级别和说明，建议优先看高风险与任务治理项。',
            emptyMessage: '当前没有质量旗标。',
          };
  const currentFlagData = workspaceMode === 'high' ? highSeverityFlags : view.qualityFlags;
  const currentWorkspaceCount = workspaceMode === 'task' ? reviewQueue.length : currentFlagData.length;

  return (
    <div className="page-grid">
      <Panel
        title="质量总览"
        subtitle="这份报告当前有多可信"
        note="质量分越低，当前结果越应被视为线索而非结论。"
        className="panel-wide panel-strip"
        meta={
          <div className="chart-meta">
            <MetaPill
              tone={
                view.dataHealth.status === 'healthy'
                  ? 'healthy'
                  : view.dataHealth.status === 'watch'
                    ? 'warning'
                    : 'derived'
              }
            >
              {`数据健康分 ${view.dataHealth.score}`}
            </MetaPill>
            <span>覆盖率：{(view.dataHealth.coverageRate * 100).toFixed(1)}%</span>
            <span>未分类任务：{(view.dataHealth.uncategorizedRate * 100).toFixed(1)}%</span>
            <span>高风险提醒：{(view.dataHealth.highSeverityRate * 100).toFixed(1)}%</span>
          </div>
        }
      >
        <div className="callout">
          <strong>{view.dataHealth.summary}</strong>
          <span>当前样本仅 {view.dataHealth.sampleDays} 天，建议先处理高风险质量项。</span>
        </div>
      </Panel>

      <ChartPanel
        title="核验漏斗"
        subtitle="任务数据在哪一步损耗最大"
        note={
          largestDrop && largestDrop.loss > 0
            ? `当前损耗最大的一步是“${largestDrop.from} → ${largestDrop.to}”，共减少 ${formatNumber(largestDrop.loss, 0)} 条任务。`
            : '当前各环节之间没有明显损耗。'
        }
        option={funnelOption}
        source="derived"
        method="原始任务数 → 合法任务数 → 已分类任务数 → 已核验任务数 → 高置信度任务数"
        reliability="高"
        caution="这是流程完整度视图，不代表业务价值损耗；高置信度口径依赖当前分类阈值"
      />

      <ChartPanel
        title="质量问题帕累托图"
        subtitle="先治理哪几类问题，收益最高"
        note={
          paretoEntries.length
            ? `当前前 20% 问题类型（约 ${paretoHighlightCount} 类）已覆盖 ${formatPercent(
                paretoHighlightCoverage,
              )} 的治理风险，优先关注 ${paretoTopLabels}。`
            : '当前筛选条件下没有可统计的质量问题类型。'
        }
        option={paretoOption}
        source="derived"
        method="混合统计任务级、员工日级、员工级和数据集级质量问题出现次数，并按数量降序计算累计覆盖率"
        reliability="中"
        caution="不同问题类型的统计单位并不完全一致，这张图更适合做治理优先级排序，不适合直接比较业务影响大小"
      />

      <ChartPanel
        title="质量提醒分布"
        subtitle="当前数据风险主要集中在哪些级别"
        note="这张图回答：当前筛选条件下，数据和流程风险是高、中还是低。"
        option={severityOption}
        source="derived"
        method="按质量 flag 级别聚合"
        reliability="高"
        caution="它反映的是数据与流程风险，不是业务价值大小"
      />

      <ChartPanel
        title="异常散点"
        subtitle="高工时、高碎片和多项目切换是否叠加"
        note="气泡越大代表当天涉及的项目越多，便于定位高切换负担。"
        option={anomalyOption}
        source="derived"
        method="规则阈值异常检测"
        reliability="中"
        caution="当前异常来自规则推导，不等同于人员绩效异常"
        onChartClick={(params) =>
          onOpenDetail({
            kind: 'employee',
            title: '异常员工聚焦分析',
            subtitle: String((params.value as Array<string | number>)?.[3] ?? ''),
            employeeId: view.employeeDays.find(
              (day) =>
                `${day.employeeName} ${day.date}` ===
                String((params.value as Array<string | number>)?.[3] ?? ''),
            )?.employeeId,
            highlightDate: view.employeeDays.find(
              (day) =>
                `${day.employeeName} ${day.date}` ===
                String((params.value as Array<string | number>)?.[3] ?? ''),
            )?.date,
            rows: [],
          })
        }
      />

      <ChartPanel
        title="质量旗标"
        subtitle="哪些数据问题出现得最频繁"
        note="这张图回答：当前最值得优先处理的是明细缺失、核验缺口，还是主题识别不足。"
        option={flagOption}
        source="derived"
        method="按质量提醒类型聚合"
        reliability="高"
        caution="类型数量高不代表影响一定最大，需结合质量总览理解"
      />

      <ChartPanel
        title="员工核验缺口率分布"
        subtitle="看核验缺口是集中在少数人，还是普遍存在"
        note="这张图只研究核验缺口率本身的分布，不再和异常日、风险分等规则型指标做耦合分析。"
        option={verifyGapDistributionOption}
        source="derived"
        method="前端计算：按员工计算核验缺口率并做区间分布统计"
        reliability="中高"
        caution="缺口率偏高可能来自流程延迟，也可能来自记录习惯差异，需要结合项目背景判断"
      />

      <ChartPanel
        title="待复核任务关键词频次"
        subtitle="把复核池里的模糊任务名拆成更可治理的关键词"
        note="这里已经不是简单统计完整任务名，而是做了轻量关键词抽取，更适合反向优化主题规则。"
        option={keywordFrequencyOption}
        source="derived"
        method="前端计算：复核池任务名清洗 + 关键词抽取 + 频次统计"
        reliability="中"
        caution="当前是轻量规则抽取，不是正式分词和主题建模"
      />

      <ChartPanel
        title="复核池主题簇地图"
        subtitle="把高频关键词投影到二维空间，看它们自然聚成哪些问题团块"
        note="这张图不是正式 LDA，而是把复核池高频关键词按共现关系做轻量分簇，再排成二维位置，帮助你快速看到哪些模糊词属于同一类问题。"
        option={reviewTopicMapOption}
        source="derived"
        method="前端计算：关键词共现关系 + 轻量分簇 + 二维排布"
        reliability="中"
        caution="这是一张探索图，适合发现潜在线索，不等于正式主题模型结论"
      />

      <ChartPanel
        title="待复核任务关键词共现网络"
        subtitle="看哪些关键词经常在同一条模糊任务里一起出现"
        note="这张图适合用来发现隐含主题团块，比如某些关键词总是一起出现，就很适合回头补一条明确规则。"
        option={keywordNetworkOption}
        source="derived"
        method="前端计算：复核池关键词抽取 + 同任务共现边统计"
        reliability="中"
        caution="当前网络仍是轻量规则抽取结果，不等于正式语义主题模型"
      />

      <Panel
        title="质量治理工作台"
        subtitle={currentWorkspace.subtitle}
        note={currentWorkspace.note}
        className="panel-wide"
        actions={
          <div className="focus-tabs task-workspace-tabs" role="tablist" aria-label="质量工作台切换">
            {[
              ['high', `高风险 ${highSeverityFlags.length}`],
              ['task', `待复核 ${reviewQueue.length}`],
              ['all', `全部旗标 ${view.qualityFlags.length}`],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={workspaceMode === value}
                className={`focus-tab ${workspaceMode === value ? 'active' : ''}`.trim()}
                onClick={() => setWorkspaceMode(value as QualityWorkspaceMode)}
              >
                {label}
              </button>
            ))}
          </div>
        }
        meta={
          <div className="chart-meta">
            <MetaPill tone="derived">{currentWorkspace.title}</MetaPill>
            <span>{`高风险 ${highSeverityFlags.length} 条`}</span>
            <span>{`待复核 ${reviewQueue.length} 条`}</span>
            <span>{`任务级旗标 ${taskFlags.length} 条`}</span>
            <span>{`当前表格 ${currentWorkspaceCount} 条`}</span>
          </div>
        }
      >
        {workspaceMode === 'task' ? (
          <DataTable
            columns={reviewQueueColumns}
            data={reviewQueue}
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
            data={currentFlagData}
            maxHeight={460}
            className="task-workspace-table"
            emptyMessage={currentWorkspace.emptyMessage}
          />
        )}
      </Panel>
    </div>
  );
}
