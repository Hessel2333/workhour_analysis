import type { ColumnDef } from '@tanstack/react-table';
import { ChartPanel } from '../components/ChartPanel';
import { CollapsiblePanel } from '../components/CollapsiblePanel';
import { DataTable } from '../components/DataTable';
import { MetaPill } from '../components/MetaPill';
import { Panel } from '../components/Panel';
import { severityLabel } from '../lib/format';
import type { AnalyticsView, DetailSelection } from '../types';

interface QualityPageProps {
  view: AnalyticsView;
  onOpenDetail: (detail: DetailSelection) => void;
}

export function QualityPage({ view, onOpenDetail }: QualityPageProps) {
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
      map.set(flag.flagType, (map.get(flag.flagType) ?? 0) + 1);
      return map;
    }, new Map<string, number>()),
  );

  const flagOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 24, right: 20, top: 24, bottom: 24, containLabel: true },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: flagCountEntries.map(([flagType]) => flagType) },
    series: [
      {
        type: 'bar',
        data: flagCountEntries.map(([, count]) => count),
        itemStyle: { color: '#ff453a', borderRadius: 10 },
      },
    ],
  };

  const columns: Array<ColumnDef<(typeof view.qualityFlags)[number]>> = [
    { header: '类型', accessorKey: 'flagType' },
    {
      header: '级别',
      cell: ({ row }) => severityLabel(row.original.severity),
    },
    { header: '对象类型', accessorKey: 'entityType' },
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
            <span>高风险 flag：{(view.dataHealth.highSeverityRate * 100).toFixed(1)}%</span>
          </div>
        }
      >
        <div className="callout">
          <strong>{view.dataHealth.summary}</strong>
          <span>当前样本仅 {view.dataHealth.sampleDays} 天，建议先处理高风险质量项。</span>
        </div>
      </Panel>

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
        method="按 flagType 聚合"
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
