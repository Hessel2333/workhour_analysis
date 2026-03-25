import type { ColumnDef } from '@tanstack/react-table';
import { ChartPanel } from '../components/ChartPanel';
import { CollapsiblePanel } from '../components/CollapsiblePanel';
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
import { isReworkTask } from '../lib/taskSignals';
import type { AnalyticsView, BaseDataset, DetailSelection } from '../types';

interface QualityPageProps {
  dataset: BaseDataset;
  view: AnalyticsView;
  onOpenDetail: (detail: DetailSelection) => void;
}

export function QualityPage({ dataset, view, onOpenDetail }: QualityPageProps) {
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
  );
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

  const flagOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 24, right: 20, top: 24, bottom: 40, containLabel: true },
    xAxis: { type: 'value', name: '异常次数' },
    yAxis: { type: 'category', data: flagCountEntries.map(([flagType]) => flagType) },
    series: [
      {
        type: 'bar',
        data: flagCountEntries.map(([, count]) => count),
        itemStyle: { color: '#ff453a', borderRadius: 10 },
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

      <CollapsiblePanel
        title="质量清单"
        subtitle="逐条核查并安排后续治理"
        note="建议先处理高风险项，再迭代规则词典和多源身份映射。"
        meta={
          <div className="chart-meta">
            <MetaPill tone="derived">规则推导</MetaPill>
            <span>方法：质量旗标列表</span>
            <span>建议：先看高风险，再看覆盖率</span>
          </div>
        }
      >
        <DataTable columns={columns} data={view.qualityFlags} />
      </CollapsiblePanel>
    </div>
  );
}
