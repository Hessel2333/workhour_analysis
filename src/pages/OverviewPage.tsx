import type { ColumnDef } from '@tanstack/react-table';
import type { BaseDataset, DetailSelection } from '../types';
import { ChartPanel } from '../components/ChartPanel';
import { CollapsiblePanel } from '../components/CollapsiblePanel';
import { DataTable } from '../components/DataTable';
import { MetricCard } from '../components/MetricCard';
import { MetaPill } from '../components/MetaPill';
import { Panel } from '../components/Panel';
import { formatNumber, formatPercent } from '../lib/format';

interface OverviewPageProps {
  dataset: BaseDataset;
  view: import('../types').AnalyticsView;
  onOpenDetail: (detail: DetailSelection) => void;
}

function groupDayHours(view: import('../types').AnalyticsView) {
  return view.uniqueDates.map((date) => ({
    date,
    hours: view.employeeDays
      .filter((day) => day.date === date)
      .reduce((sum, day) => sum + day.reportHour, 0),
  }));
}

export function OverviewPage({ dataset, view, onOpenDetail }: OverviewPageProps) {
  const dayHours = groupDayHours(view);
  const topProjects = view.projectStats.slice(0, 6);
  const topProjectNames = topProjects.map((project) => project.projectName);
  const topicNames = view.topicStats.slice(0, 6).map((topic) => topic.topicLabel);

  const projectTrendOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: 24, right: 20, top: 30, bottom: 24, containLabel: true },
    xAxis: { type: 'category', data: dayHours.map((item) => item.date) },
    yAxis: { type: 'value' },
    series: [
      {
        type: 'line',
        smooth: true,
        data: dayHours.map((item) => item.hours),
        color: '#1f6fff',
      },
    ],
  };

  const stackedProjectOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { top: 0 },
    grid: { left: 24, right: 20, top: 50, bottom: 24, containLabel: true },
    xAxis: { type: 'category', data: view.uniqueDates },
    yAxis: { type: 'value' },
    series: topProjects.map((project, index) => ({
      name: project.projectName,
      type: 'bar',
      stack: 'hours',
      emphasis: { focus: 'series' },
      data: view.uniqueDates.map((date) =>
        view.tasks
          .filter((task) => task.projectName === project.projectName && task.date === date)
          .reduce((sum, task) => sum + task.reportHour, 0),
      ),
      color: ['#1f6fff', '#5ac8fa', '#34c759', '#ff9f0a', '#ff375f', '#6e6dfb'][index],
    })),
  };

  const sankeyLinks = [
    ...view.tasks.map((task) => ({
      source:
        view.employeeStats.find((item) => item.employeeId === task.employeeId)?.name ??
        task.employeeName,
      target: task.projectName,
      value: task.reportHour,
    })),
    ...view.tasks.map((task) => ({
        source: task.projectName,
        target: task.topicLabel,
        value: task.reportHour,
      })),
  ];

  const sankeyNodes = Array.from(
    new Set(sankeyLinks.flatMap((link) => [link.source, link.target])),
  ).map((name) => ({ name }));

  const sankeyOption = {
    tooltip: { trigger: 'item' },
    series: [
      {
        type: 'sankey',
        data: sankeyNodes,
        links: sankeyLinks,
        lineStyle: { color: 'source', curveness: 0.45, opacity: 0.2 },
        emphasis: { focus: 'adjacency' },
      },
    ],
  };

  const columns: Array<ColumnDef<(typeof topProjects)[number]>> = [
    { header: '项目', accessorKey: 'projectName' },
    {
      header: '总工时',
      cell: ({ row }) => `${formatNumber(row.original.totalHours)} h`,
    },
    { header: '参与人数', accessorKey: 'participantCount' },
    {
      header: '趋势斜率',
      cell: ({ row }) => formatNumber(row.original.trendSlope, 2),
    },
    { header: '主导主题', accessorKey: 'primaryTopic' },
  ];

  return (
    <div className="page-grid">
      {view.dataHealth.sampleDays < 14 ? (
        <Panel
          title="低样本模式"
          subtitle="当前样本主要适合发现线索，不适合下长期结论"
          note="优先看结构分布和异常点，谨慎解读趋势斜率、相关关系和人均对比。"
          className="panel-wide panel-strip"
          meta={
            <div className="chart-meta">
              <MetaPill tone="warning">低样本模式</MetaPill>
              <span>当前样本天数：{view.dataHealth.sampleDays}</span>
              <span>建议先看质量页和方法说明页</span>
            </div>
          }
        >
          <div className="callout">
            <strong>优先解读：工时流向、任务主题、异常员工日。</strong>
            <span>趋势和相关性先当线索，不当结论。</span>
          </div>
        </Panel>
      ) : null}

      <div className="metrics-grid">
        <MetricCard
          label="总工时"
          value={`${formatNumber(view.globalMetrics.totalHours)} h`}
          hint="当前筛选范围内的投入总量"
          tone="real"
        />
        <MetricCard
          label="活跃员工"
          value={`${view.globalMetrics.activeEmployees}`}
          hint="至少有 1 条匹配任务明细"
          tone="real"
        />
        <MetricCard
          label="项目数"
          value={`${view.globalMetrics.projectCount}`}
          hint="当前筛选后的项目范围"
          tone="real"
        />
        <MetricCard
          label="人均工时"
          value={`${formatNumber(view.globalMetrics.averageHoursPerEmployee)} h`}
          hint="总工时 / 活跃员工"
          tone="derived"
        />
        <MetricCard
          label="跨项目人数"
          value={`${view.globalMetrics.crossProjectEmployees}`}
          hint="至少有 1 天跨多个项目"
          tone="derived"
        />
        <MetricCard
          label="数据覆盖率"
          value={formatPercent(view.globalMetrics.coverageRate)}
          hint="有明细员工数 / 全部员工记录"
          tone="warning"
        />
        <MetricCard
          label="数据健康分"
          value={`${view.dataHealth.score}`}
          hint={view.dataHealth.summary}
          tone={
            view.dataHealth.status === 'healthy'
              ? 'healthy'
              : view.dataHealth.status === 'watch'
                ? 'warning'
                : 'derived'
          }
        />
      </div>

      <ChartPanel
        title="总览趋势"
        subtitle="每天到底投入了多少工时"
        note={`样本量 ${view.employeeDays.length} 个员工日，时间范围 ${dataset.dateRange.start} 至 ${dataset.dateRange.end}。`}
        option={projectTrendOption}
        source="real"
        method="按日期聚合真实工时"
        reliability={view.dataHealth.sampleDays < 14 ? '中，样本天数偏短' : '高'}
        caution="短样本适合观察波动，不适合判断长期效率"
        onChartClick={(params) =>
          onOpenDetail({
            kind: 'date',
            title: '日期详情',
            subtitle: String(params.name ?? ''),
            date: String(params.name ?? ''),
            rows: view.employeeDays
              .filter((day) => day.date === params.name)
              .map((day) => ({
                员工: day.employeeName,
                工时: day.reportHour,
                任务数: day.taskCount,
                项目数: day.projectCount,
              })),
          })
        }
      />

      <ChartPanel
        title="项目构成"
        subtitle="工时主要流向哪些项目"
        note={`展示当前 Top ${topProjectNames.length} 项目的日分布。`}
        option={stackedProjectOption}
        source="real"
        method="按项目和日期做堆叠聚合"
        reliability="中，受任务填报粒度影响"
        caution="未填报或粗粒度填报会压缩真实波动"
      />

      <ChartPanel
        title="工时流向"
        subtitle="员工 → 项目 → 主题"
        note="这张图回答：工时在当前筛选条件下是如何流动的。"
        option={sankeyOption}
        height={380}
        source="derived"
        method="真实工时 + 规则主题分类"
        reliability="中，主题规则会影响流向准确性"
        caution="主题未分类或误分类会改变流向宽度"
        onChartClick={(params) =>
          (() => {
            const clickedName = String(params.name ?? '');
            const employeeMatch = view.employeeStats.find((item) => item.name === clickedName);
            if (employeeMatch) {
              onOpenDetail({
                kind: 'employee',
                title: '员工聚焦分析',
                subtitle: employeeMatch.name,
                employeeId: employeeMatch.employeeId,
                rows: [],
              });
              return;
            }

            if (view.projectStats.some((project) => project.projectName === clickedName)) {
              onOpenDetail({
                kind: 'project',
                title: '项目聚焦分析',
                subtitle: clickedName,
                projectName: clickedName,
                rows: [],
              });
              return;
            }

            onOpenDetail({
              kind: 'generic',
              title: '流向节点',
              subtitle: clickedName,
              rows: view.tasks
                .filter(
                  (task) =>
                    task.projectName === clickedName ||
                    task.topicLabel === clickedName ||
                    task.employeeName === clickedName,
                )
                .slice(0, 12)
                .map((task) => ({
                  日期: task.date,
                  项目: task.projectName,
                  主题: task.topicLabel,
                  工时: task.reportHour,
                })),
            });
          })()
        }
      />

      <CollapsiblePanel
        title="项目清单"
        subtitle="老板先看投入规模、参与广度和主题焦点"
        note={`当前筛选后保留 ${topProjectNames.length} 个核心项目；主题维度主要集中在 ${topicNames.join('、') || '暂无'}。`}
        meta={
          <div className="chart-meta">
            <MetaPill tone="real">真实工时</MetaPill>
            <span>方法：项目聚合</span>
            <span>可靠性：中</span>
          </div>
        }
      >
        <DataTable columns={columns} data={topProjects} />
      </CollapsiblePanel>
    </div>
  );
}
