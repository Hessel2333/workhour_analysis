import type { ColumnDef } from '@tanstack/react-table';
import { ChartPanel } from '../components/ChartPanel';
import { CollapsiblePanel } from '../components/CollapsiblePanel';
import { DataTable } from '../components/DataTable';
import { MetaPill } from '../components/MetaPill';
import { Panel } from '../components/Panel';
import { formatNumber } from '../lib/format';
import type { AnalyticsView, DetailSelection } from '../types';

interface ProjectsPageProps {
  view: AnalyticsView;
  onOpenDetail: (detail: DetailSelection) => void;
}

export function ProjectsPage({ view, onOpenDetail }: ProjectsPageProps) {
  const topProjects = view.projectStats.slice(0, 8);
  const steepestProject = [...view.projectStats].sort(
    (left, right) => right.trendSlope - left.trendSlope,
  )[0];
  const widestProject = [...view.projectStats].sort(
    (left, right) => right.participantCount - left.participantCount,
  )[0];

  const barOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 24, right: 20, top: 24, bottom: 24, containLabel: true },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: topProjects.map((item) => item.projectName) },
    series: [
      {
        type: 'bar',
        data: topProjects.map((item) => item.totalHours),
        itemStyle: { color: '#2a9d8f', borderRadius: 10 },
      },
    ],
  };

  const trendOption = {
    tooltip: { trigger: 'axis' },
    legend: { top: 0 },
    grid: { left: 24, right: 20, top: 48, bottom: 24, containLabel: true },
    xAxis: { type: 'category', data: view.uniqueDates },
    yAxis: { type: 'value' },
    series: topProjects.slice(0, 5).map((project, index) => ({
      name: project.projectName,
      type: 'line',
      smooth: true,
      data: view.uniqueDates.map((date) =>
        view.tasks
          .filter((task) => task.projectName === project.projectName && task.date === date)
          .reduce((sum, task) => sum + task.reportHour, 0),
      ),
      color: ['#1f6fff', '#30b0c7', '#4fa95d', '#f59e0b', '#ef4444'][index],
    })),
  };

  const bubbleOption = {
    tooltip: { trigger: 'item' },
    xAxis: { type: 'value', name: '参与人数' },
    yAxis: { type: 'value', name: '总工时' },
    series: [
      {
        type: 'scatter',
        symbolSize: (value: number[]) => 16 + value[2] * 5,
        data: view.projectStats.map((project) => [
          project.participantCount,
          project.totalHours,
          project.topicDiversity,
          project.projectName,
        ]),
      },
    ],
  };

  const columns: Array<ColumnDef<(typeof view.projectStats)[number]>> = [
    { header: '项目', accessorKey: 'projectName' },
    {
      header: '总工时',
      cell: ({ row }) => `${formatNumber(row.original.totalHours)} h`,
    },
    { header: '参与人数', accessorKey: 'participantCount' },
    { header: '任务数', accessorKey: 'taskCount' },
    {
      header: '人均投入',
      cell: ({ row }) => `${formatNumber(row.original.averageHoursPerPerson)} h`,
    },
    {
      header: '趋势斜率',
      cell: ({ row }) => formatNumber(row.original.trendSlope, 2),
    },
    { header: '主导主题', accessorKey: 'primaryTopic' },
  ];

  return (
    <div className="page-grid">
      <Panel
        title="参数解读"
        subtitle="趋势斜率、参与人数和人均投入怎么使用"
        note="重点是判断资源是否集中、投入是在升温还是回落，以及是否存在多人浅介入。"
        className="panel-wide panel-strip"
        meta={
          <div className="chart-meta">
            <MetaPill tone="derived">规则推导</MetaPill>
            <span>趋势斜率：按日工时线性回归斜率</span>
            <span>参与人数：观察期内至少有 1 条任务的员工数</span>
            <span>人均投入：总工时 / 参与人数</span>
          </div>
        }
      >
        <div className="callout">
          <strong>
            {steepestProject
              ? `${steepestProject.projectName} 的趋势斜率最高，为 ${steepestProject.trendSlope.toFixed(2)}。`
              : '当前没有可解释的项目趋势样本。'}
          </strong>
          <span>
            {widestProject
              ? `${widestProject.projectName} 当前参与人数最多，为 ${widestProject.participantCount} 人。参与人数高本身不代表协同效率高，若同时人均投入偏低，更可能是多人浅介入。`
              : '参与人数应和人均投入一起解释，避免把“人多”误读成“协作好”。'}
          </span>
        </div>
      </Panel>

      <ChartPanel
        title="项目投入规模"
        subtitle="哪些项目吸收了最多工时"
        note="这张图回答：资源是否向当前重点项目集中。"
        option={barOption}
        source="real"
        method="按项目聚合总工时"
        reliability="高"
        caution="工时高只说明投入高，不代表交付质量或业务结果更好"
        onChartClick={(params) =>
          onOpenDetail({
            kind: 'project',
            title: '项目聚焦分析',
            subtitle: String(params.name ?? ''),
            projectName: String(params.name ?? ''),
            rows: [],
          })
        }
      />

      <ChartPanel
        title="趋势对比"
        subtitle="重点项目是否出现投入波动"
        note="这张图回答：项目工时是稳态推进还是阶段性冲刺。"
        option={trendOption}
        source="real"
        method="按项目和日期聚合的趋势折线"
        reliability={view.dataHealth.sampleDays < 14 ? '中低，短样本敏感' : '中'}
        caution="趋势斜率适合看投入方向，不适合直接评价项目成败"
      />

      <ChartPanel
        title="项目气泡图"
        subtitle="参与人数、总工时、主题复杂度联动"
        note="气泡越大代表主题越复杂，越适合优先做流程与角色协同分析。"
        option={bubbleOption}
        source="derived"
        method="参与人数 + 总工时 + 主题复杂度联动"
        reliability="中"
        caution="参与人数高不自动代表协同效率高，应和人均投入一起解读"
        onChartClick={(params) =>
          onOpenDetail({
            kind: 'project',
            title: '项目聚焦分析',
            subtitle: String((params.value as Array<string | number>)?.[3] ?? ''),
            projectName: String((params.value as Array<string | number>)?.[3] ?? ''),
            rows: [],
          })
        }
      />

      <CollapsiblePanel
        title="项目明细"
        subtitle="确认项目权重、主导主题和波动性"
        note="表格是图表之外的落点，用来判断该项目是重开发、重维护还是重协调。"
        meta={
          <div className="chart-meta">
            <MetaPill tone="derived">参数说明</MetaPill>
            <span>趋势斜率：近期投入方向</span>
            <span>参与人数：观察期内活跃人员数</span>
            <span>人均投入：识别是否多人浅介入</span>
          </div>
        }
      >
        <DataTable columns={columns} data={view.projectStats} />
      </CollapsiblePanel>
    </div>
  );
}
