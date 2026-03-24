import type { ColumnDef } from '@tanstack/react-table';
import { ChartPanel } from '../components/ChartPanel';
import { CollapsiblePanel } from '../components/CollapsiblePanel';
import { DataTable } from '../components/DataTable';
import { MetaPill } from '../components/MetaPill';
import { Panel } from '../components/Panel';
import { formatNumber, formatPercent } from '../lib/format';
import type { AnalyticsView, DetailSelection } from '../types';

interface EmployeesPageProps {
  view: AnalyticsView;
  onOpenDetail: (detail: DetailSelection) => void;
}

export function EmployeesPage({ view, onOpenDetail }: EmployeesPageProps) {
  const highestSwitch = [...view.employeeStats].sort(
    (left, right) => right.multiProjectRate - left.multiProjectRate,
  )[0];
  const lowestFocus = [...view.employeeStats].sort(
    (left, right) => left.focusScore - right.focusScore,
  )[0];

  const yLabels = view.employeeStats.map((item) => item.name);

  const heatmapData = view.employeeDays.map((day) => {
    const label =
      view.employeeStats.find((item) => item.employeeId === day.employeeId)?.name ??
      day.employeeId;
    return [view.uniqueDates.indexOf(day.date), yLabels.indexOf(label), day.reportHour];
  });

  const heatmapOption = {
    tooltip: {
      formatter: (params: { value: [number, number, number] }) =>
        `${view.uniqueDates[params.value[0]]}<br />${yLabels[params.value[1]]}: ${params.value[2]} h`,
    },
    grid: { left: 64, right: 20, top: 24, bottom: 24, containLabel: true },
    xAxis: { type: 'category', data: view.uniqueDates },
    yAxis: { type: 'category', data: yLabels },
    visualMap: {
      min: 0,
      max: Math.max(...view.employeeDays.map((day) => day.reportHour), 8),
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
    },
    series: [{ type: 'heatmap', data: heatmapData }],
  };

  const barOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 24, right: 20, top: 24, bottom: 24, containLabel: true },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: yLabels },
    series: [
      {
        type: 'bar',
        data: view.employeeStats.map((item) => item.totalHours),
        itemStyle: { color: '#0a84ff', borderRadius: 10 },
      },
    ],
  };

  const scatterOption = {
    tooltip: { trigger: 'item' },
    xAxis: { type: 'value', name: '总工时' },
    yAxis: { type: 'value', name: '任务数' },
    series: [
      {
        type: 'scatter',
        symbolSize: (value: number[]) => 12 + value[2] * 10,
        data: view.employeeStats.map((item) => [
          item.totalHours,
          item.taskCount,
          item.multiProjectRate,
          item.name,
        ]),
      },
    ],
  };

  const columns: Array<ColumnDef<(typeof view.employeeStats)[number]>> = [
    {
      header: '员工',
      cell: ({ row }) => row.original.name,
    },
    {
      header: '总工时',
      cell: ({ row }) => `${formatNumber(row.original.totalHours)} h`,
    },
    {
      header: '日均工时',
      cell: ({ row }) => `${formatNumber(row.original.averageDailyHours)} h`,
    },
    { header: '项目数', accessorKey: 'projectCount' },
    { header: '任务数', accessorKey: 'taskCount' },
    {
      header: '多项目率',
      cell: ({ row }) => formatPercent(row.original.multiProjectRate),
    },
    {
      header: '集中度',
      cell: ({ row }) => formatPercent(row.original.focusScore),
    },
  ];

  return (
    <div className="page-grid">
      <Panel
        title="参数解读"
        subtitle="多项目率、集中度与任务负载应该怎么读"
        note="重点不是比高低，而是识别高负载是否伴随高切换和高分散。"
        className="panel-wide panel-strip"
        meta={
          <div className="chart-meta">
            <MetaPill tone="derived">规则推导</MetaPill>
            <span>多项目率 = 多项目工作日 / 全部工作日</span>
            <span>集中度 = 单一项目最大工时 / 总工时</span>
          </div>
        }
      >
        <div className="callout">
          <strong>
            {highestSwitch
              ? `${highestSwitch.name} 当前多项目率最高，为 ${(highestSwitch.multiProjectRate * 100).toFixed(1)}%。`
              : '当前没有可解释的员工样本。'}
          </strong>
          <span>
            {lowestFocus
              ? `${lowestFocus.name} 的集中度最低，为 ${(lowestFocus.focusScore * 100).toFixed(1)}%，说明工时更分散。高多项目率和低集中度一起出现时，更值得怀疑上下文切换损耗。`
              : '集中度需要与多项目率一起解读，不能单独评价员工表现。'}
          </span>
        </div>
      </Panel>

      <ChartPanel
        title="员工热力图"
        subtitle="谁在什么日期投入最密集"
        note={`这张图回答：员工工时在日期维度上的分布是否均衡。样本量 ${view.employeeDays.length} 个员工日。`}
        option={heatmapOption}
        height={380}
        source="real"
        method="员工日工时热力图"
        reliability="高"
        caution="适合看负载密度，不适合直接评估产出质量"
        onChartClick={(params) => {
          const dataPoint = params.data as [number, number, number] | undefined;
          const name = String(
            dataPoint?.[1] !== undefined ? yLabels[dataPoint[1]] : '',
          );
          onOpenDetail({
            kind: 'employee',
            title: '员工聚焦分析',
            subtitle: name,
            employeeId: view.employeeStats.find((item) => item.name === name)?.employeeId,
            rows: [],
          });
        }}
      />

      <ChartPanel
        title="工时排名"
        subtitle="谁承担了更多的有效投入"
        note="这张图回答：当前筛选范围内，哪些成员承担了更多工时。"
        option={barOption}
        source="real"
        method="按员工聚合总工时"
        reliability="高"
        caution="工时高不等于效率高，必须结合切换率和集中度一起看"
        onChartClick={(params) => {
          const label = String(params.name ?? '');
          onOpenDetail({
            kind: 'employee',
            title: '员工聚焦分析',
            subtitle: label,
            employeeId: view.employeeStats.find((item) => item.name === label)?.employeeId,
            rows: [],
          });
        }}
      />

      <ChartPanel
        title="负载与碎片"
        subtitle="工时多的人是否也承担更多任务切换"
        note="这张图回答：总工时、任务数和多项目率是否叠加出现。"
        option={scatterOption}
        source="derived"
        method="总工时 + 任务数 + 多项目率联动散点"
        reliability="中"
        caution="多项目率高提示切换风险，但不自动代表低效"
        onChartClick={(params) => {
          const label = String((params.value as Array<string | number>)?.[3] ?? '');
          onOpenDetail({
            kind: 'employee',
            title: '员工聚焦分析',
            subtitle: label,
            employeeId: view.employeeStats.find((item) => item.name === label)?.employeeId,
            rows: [],
          });
        }}
      />

      <CollapsiblePanel
        title="员工统计"
        subtitle="员工任务结构明细"
        note="表格用于核查图表中的异常点。"
        meta={
          <div className="chart-meta">
            <MetaPill tone="derived">参数说明</MetaPill>
            <span>多项目率：观察期内多项目工作日占比</span>
            <span>集中度：单一项目最大工时占比</span>
          </div>
        }
      >
        <DataTable columns={columns} data={view.employeeStats} />
      </CollapsiblePanel>
    </div>
  );
}
