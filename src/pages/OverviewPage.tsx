import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import type { BaseDataset, DetailSelection, Filters } from '../types';
import { ChartPanel } from '../components/ChartPanel';
import { CollapsiblePanel } from '../components/CollapsiblePanel';
import { DataSourceBoundaryBanner } from '../components/DataSourceBoundaryBanner';
import { DataTable } from '../components/DataTable';
import { MetricCard } from '../components/MetricCard';
import { MetaPill } from '../components/MetaPill';
import { Panel } from '../components/Panel';
import { TrendGranularitySwitch } from '../components/TrendGranularitySwitch';
import { analysisConfig } from '../config/analysisConfig';
import { projectColor } from '../lib/chartColors';
import { formatNumber, formatPercent } from '../lib/format';
import { holidayLabel } from '../lib/holidayCalendar';
import { getEmployeeRiskMetric } from '../lib/metrics';
import { buildOvertimeHistogram, buildOvertimeRecords } from '../lib/overtime';
import {
  buildGranularityLabels,
  fillGroupedSeries,
  groupSeriesByGranularity,
  trendGranularityLabel,
  type TrendGranularity,
} from '../lib/timeSeries';

interface OverviewPageProps {
  dataset: BaseDataset;
  view: import('../types').AnalyticsView;
  filters: Filters;
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

function bubbleSizeByAnomalyDays(days: number) {
  if (days >= 8) return 44;
  if (days >= 4) return 32;
  return 22;
}

export function OverviewPage({ dataset, view, filters, onOpenDetail }: OverviewPageProps) {
  const [monthTrendGranularity, setMonthTrendGranularity] = useState<'day' | 'week'>('day');
  const trendGranularity: TrendGranularity =
    filters.periodMode === 'month' ? monthTrendGranularity : 'month';
  const trendLabel = trendGranularityLabel(trendGranularity);
  const canSwitchTrendGranularity = filters.periodMode === 'month';
  const trendLabels = buildGranularityLabels(
    filters.startDate,
    filters.endDate,
    trendGranularity,
  );
  const trendGranularityActions = canSwitchTrendGranularity ? (
    <TrendGranularitySwitch
      value={monthTrendGranularity}
      onChange={setMonthTrendGranularity}
      ariaLabel="总览趋势聚合粒度"
    />
  ) : undefined;
  const dayHours = groupDayHours(view);
  const groupedDayHours = fillGroupedSeries(trendLabels, groupSeriesByGranularity(
    dayHours.map((item) => ({ date: item.date, value: item.hours })),
    trendGranularity,
  ));
  const topProjects = view.projectStats.slice(0, analysisConfig.displayLimits.overviewTopProjects);
  const topRiverProjects = view.projectStats.slice(0, analysisConfig.displayLimits.overviewRiverProjects);
  const topProjectNames = topProjects.map((project) => project.projectName);
  const topicNames = view.topicStats
    .slice(0, analysisConfig.displayLimits.overviewTopProjects)
    .map((topic) => topic.topicLabel);
  const topEmployee = view.employeeStats[0];
  const highestSwitcher = [...view.employeeStats].sort(
    (left, right) => right.multiProjectRate - left.multiProjectRate,
  )[0];
  const mostAnomalous = [...view.employeeStats].sort(
    (left, right) => right.anomalyDayCount - left.anomalyDayCount,
  )[0];
  const employeeRiskTop = [...view.employeeStats]
    .sort((left, right) => {
      const leftScore = getEmployeeRiskMetric(left).value;
      const rightScore = getEmployeeRiskMetric(right).value;
      return rightScore - leftScore;
    })
    .slice(0, analysisConfig.displayLimits.overviewRiskEmployees);

  const groupedProjectSeries = topProjects.map((project) => ({
    projectName: project.projectName,
    points: groupSeriesByGranularity(
      view.uniqueDates.map((date) => ({
        date,
        value: view.tasks
          .filter((task) => task.projectName === project.projectName && task.date === date)
          .reduce((sum, task) => sum + task.reportHour, 0),
      })),
      trendGranularity,
    ),
  }));

  const overtimeRecords = buildOvertimeRecords(view.employeeDays, filters.overtimeMode);
  const overtimeByDate = new Map<string, { workday: number; weekend: number; holiday: number }>();
  const overtimeByEmployee = new Map<
    string,
    { name: string; total: number; holiday: number; workday: number }
  >();

  overtimeRecords.forEach((record) => {
    if (record.overtimeHours <= 0 || record.overtimeType === 'none') {
      return;
    }

    const bucket = overtimeByDate.get(record.date) ?? { workday: 0, weekend: 0, holiday: 0 };
    const employeeBucket = overtimeByEmployee.get(record.employeeId) ?? {
      name: record.employeeName,
      total: 0,
      holiday: 0,
      workday: 0,
    };

    if (record.overtimeType === 'holiday') {
      bucket.holiday += record.overtimeHours;
      employeeBucket.total += record.overtimeHours;
      employeeBucket.holiday += record.overtimeHours;
    } else if (record.overtimeType === 'workday') {
      bucket.workday += record.overtimeHours;
      employeeBucket.total += record.overtimeHours;
      employeeBucket.workday += record.overtimeHours;
    } else if (record.overtimeType === 'weekend') {
      bucket.weekend += record.overtimeHours;
      employeeBucket.total += record.overtimeHours;
    }

    overtimeByDate.set(record.date, bucket);
    overtimeByEmployee.set(record.employeeId, employeeBucket);
  });

  const groupedWorkdayOvertime = fillGroupedSeries(trendLabels, groupSeriesByGranularity(
    Array.from(overtimeByDate.entries()).map(([date, values]) => ({
      date,
      value: values.workday,
    })),
    trendGranularity,
  ));
  const groupedWeekendOvertime = fillGroupedSeries(trendLabels, groupSeriesByGranularity(
    Array.from(overtimeByDate.entries()).map(([date, values]) => ({
      date,
      value: values.weekend,
    })),
    trendGranularity,
  ));
  const groupedHolidayOvertime = fillGroupedSeries(trendLabels, groupSeriesByGranularity(
    Array.from(overtimeByDate.entries()).map(([date, values]) => ({
      date,
      value: values.holiday,
    })),
    trendGranularity,
  ));
  const overtimeLabels = trendLabels;
  const overtimeSeriesLookup = {
    workday: new Map(groupedWorkdayOvertime.map((item) => [item.label, item.value])),
    weekend: new Map(groupedWeekendOvertime.map((item) => [item.label, item.value])),
    holiday: new Map(groupedHolidayOvertime.map((item) => [item.label, item.value])),
  };
  const overtimeMetrics = {
    total: Array.from(overtimeByEmployee.values()).reduce((sum, item) => sum + item.total, 0),
    workday: Array.from(overtimeByDate.values()).reduce((sum, item) => sum + item.workday, 0),
    weekend: Array.from(overtimeByDate.values()).reduce((sum, item) => sum + item.weekend, 0),
    holiday: Array.from(overtimeByDate.values()).reduce((sum, item) => sum + item.holiday, 0),
  };
  const holidayOvertimeDays = Array.from(overtimeByDate.entries()).filter(
    ([, values]) => values.holiday > 0,
  );
  const overtimeHistogram = buildOvertimeHistogram(overtimeRecords);
  const overtimeDayCount = overtimeRecords.filter((record) => record.overtimeHours > 0).length;
  const dominantOvertimeBin = [...overtimeHistogram].sort((left, right) => right.total - left.total)[0];
  const topOvertimeEmployees = Array.from(overtimeByEmployee.entries())
    .map(([employeeId, values]) => ({
      employeeId,
      ...values,
    }))
    .filter((item) => item.total > 0)
    .sort((left, right) => right.total - left.total)
    .slice(0, analysisConfig.displayLimits.employeeRank);
  const top3ProjectHours = topProjects
    .slice(0, 3)
    .reduce((sum, project) => sum + project.totalHours, 0);
  const top3ProjectShare = view.globalMetrics.totalHours
    ? top3ProjectHours / view.globalMetrics.totalHours
    : 0;

  const projectTrendOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: 24, right: 20, top: 30, bottom: 40, containLabel: true },
    xAxis: { type: 'category', data: groupedDayHours.map((item) => item.label) },
    yAxis: { type: 'value', name: '工时' },
    series: [
      {
        type: 'line',
        smooth: true,
        data: groupedDayHours.map((item) => item.value),
        color: '#1f6fff',
      },
    ],
  };

  const stackedProjectOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { top: 0 },
    grid: { left: 24, right: 20, top: 50, bottom: 40, containLabel: true },
    xAxis: { type: 'category', data: trendLabels },
    yAxis: { type: 'value', name: '工时' },
    series: topProjects.map((project, index) => ({
      name: project.projectName,
      type: 'bar',
      stack: 'hours',
      emphasis: { focus: 'series' },
      data:
        groupedProjectSeries.find((item) => item.projectName === project.projectName)?.points.map(
          (item) => item.value,
        ) ?? [],
      color: projectColor(index),
    })),
  };

  const riverSeriesProjects = [
    ...topRiverProjects.map((project) => project.projectName),
    ...(view.projectStats.length > topRiverProjects.length ? ['其他'] : []),
  ];
  const riverGroupedSeries = riverSeriesProjects.map((projectName) => ({
    projectName,
    points: groupSeriesByGranularity(
      view.uniqueDates.map((date) => {
        const value =
          projectName === '其他'
            ? view.tasks
                .filter(
                  (task) =>
                    !topRiverProjects.some((project) => project.projectName === task.projectName) &&
                    task.date === date,
                )
                .reduce((sum, task) => sum + task.reportHour, 0)
            : view.tasks
                .filter((task) => task.projectName === projectName && task.date === date)
                .reduce((sum, task) => sum + task.reportHour, 0);
        return { date, value };
      }),
      trendGranularity,
    ),
  }));

  const riverOption = {
    tooltip: { trigger: 'axis' },
    legend: { top: 0 },
    grid: { left: 24, right: 20, top: 50, bottom: 40, containLabel: true },
    xAxis: { type: 'category', data: riverGroupedSeries[0]?.points.map((item) => item.label) ?? [] },
    yAxis: {
      type: 'value',
      name: '工时占比',
      axisLabel: {
        formatter: '{value}%',
      },
      max: 100,
    },
    series: riverSeriesProjects.map((projectName, index) => {
      const points = fillGroupedSeries(
        trendLabels,
        riverGroupedSeries.find((item) => item.projectName === projectName)?.points ?? [],
      );
      const totalByLabel = new Map(
        trendLabels.map((label) => [
          label,
          riverGroupedSeries.reduce((sum, series) => {
            const matched = series.points.find((item) => item.label === label);
            return sum + (matched?.value ?? 0);
          }, 0),
        ]),
      );

      return {
        name: projectName,
        type: 'line',
        smooth: true,
        stack: 'share',
        symbol: 'none',
        areaStyle: { opacity: 0.88 },
        lineStyle: { width: 0.8 },
        emphasis: { focus: 'series' },
        data: points.map((point) => {
          const total = totalByLabel.get(point.label) ?? 0;
          return total ? Number(((point.value / total) * 100).toFixed(1)) : 0;
        }),
        color: projectName === '其他' ? '#cbd5e1' : projectColor(index),
      };
    }),
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

  const employeeRiskOption = {
    tooltip: {
      trigger: 'item',
      formatter: (params: { value?: Array<string | number> }) => {
        const value = params.value ?? [];
        const name = String(value[3] ?? '');
        const multiProjectRate = formatNumber(Number(value[0] ?? 0), 1);
        const focusScore = formatNumber(Number(value[1] ?? 0), 1);
        const anomalyDays = Number(value[2] ?? 0);
        return [
          `<strong>${name}</strong>`,
          `多项目率：${multiProjectRate}%`,
          `集中度：${focusScore}%`,
          `异常日：${anomalyDays} 天`,
        ].join('<br/>');
      },
    },
    xAxis: { type: 'value', name: '多项目率' },
    yAxis: { type: 'value', name: '集中度' },
    series: [
      {
        type: 'scatter',
        symbolSize: (value: number[]) => bubbleSizeByAnomalyDays(Number(value[2] ?? 0)),
        data: view.employeeStats.map((employee) => [
          Number((employee.multiProjectRate * 100).toFixed(1)),
          Number((employee.focusScore * 100).toFixed(1)),
          employee.anomalyDayCount,
          employee.name,
        ]),
        itemStyle: { color: '#ff9f0a', opacity: 0.9 },
      },
    ],
  };

  const overtimeTrendOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { top: 0 },
    grid: { left: 24, right: 20, top: 50, bottom: 40, containLabel: true },
    xAxis: { type: 'category', data: overtimeLabels },
    yAxis: { type: 'value', name: '加班小时' },
    series: [
      {
        name: '工作日加班',
        type: 'bar',
        stack: 'overtime',
        data: overtimeLabels.map((label) => overtimeSeriesLookup.workday.get(label) ?? 0),
        color: '#1f6fff',
      },
      {
        name: '周末加班',
        type: 'bar',
        stack: 'overtime',
        data: overtimeLabels.map((label) => overtimeSeriesLookup.weekend.get(label) ?? 0),
        color: '#ff9f0a',
      },
      {
        name: '法定假日加班',
        type: 'bar',
        stack: 'overtime',
        data: overtimeLabels.map((label) => overtimeSeriesLookup.holiday.get(label) ?? 0),
        color: '#ff375f',
      },
    ],
  };

  const overtimeEmployeeOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 24, right: 20, top: 20, bottom: 40, containLabel: true },
    xAxis: { type: 'value', name: '加班小时' },
    yAxis: {
      type: 'category',
      data: topOvertimeEmployees.map((item) => item.name).reverse(),
    },
    series: [
      {
        type: 'bar',
        data: topOvertimeEmployees.map((item) => item.total).reverse(),
        color: '#ff9f0a',
      },
    ],
  };

  const overtimeHistogramOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (
        params: Array<{ axisValue: string; seriesName: string; value: number }>,
      ) => {
        const total = params.reduce((sum, item) => sum + Number(item.value ?? 0), 0);
        return [
          `<strong>${params[0]?.axisValue ?? ''}</strong>`,
          `加班员工日：${total}`,
          ...params
            .filter((item) => Number(item.value ?? 0) > 0)
            .map((item) => `${item.seriesName}：${item.value} 天`),
        ].join('<br/>');
      },
    },
    legend: { top: 0 },
    grid: { left: 24, right: 20, top: 50, bottom: 40, containLabel: true },
    xAxis: { type: 'category', data: overtimeHistogram.map((item) => item.label) },
    yAxis: { type: 'value', name: '加班员工日' },
    series: [
      {
        name: '工作日加班',
        type: 'bar',
        stack: 'overtime-count',
        data: overtimeHistogram.map((item) => item.workday),
        color: '#1f6fff',
      },
      {
        name: '周末加班',
        type: 'bar',
        stack: 'overtime-count',
        data: overtimeHistogram.map((item) => item.weekend),
        color: '#ff9f0a',
      },
      {
        name: '法定假日加班',
        type: 'bar',
        stack: 'overtime-count',
        data: overtimeHistogram.map((item) => item.holiday),
        color: '#ff375f',
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
      <DataSourceBoundaryBanner
        className="panel-wide"
        realSources={['工时原始数据', '任务明细', '核验状态']}
        mockSources={
          analysisConfig.ruleToggles.showMockCharts ? ['Git', 'AI 使用', '用户反馈'] : []
        }
      />
      {view.dataHealth.sampleDays < analysisConfig.thresholds.lowSampleDays ? (
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

      <Panel
        title="管理摘要"
        subtitle="先看这一期最重要的判断"
        className="panel-wide panel-strip"
      >
        <div className="summary-ribbon">
          <strong>工时集中在 {topProjectNames.slice(0, 3).join('、') || '头部项目'}。</strong>
          <span>
            {topEmployee
              ? `${topEmployee.name} 投入最高，${highestSwitcher?.name ?? '当前样本'} 切换压力更明显。`
              : '当前没有可解释的员工样本。'}
          </span>
          <span>
            {mostAnomalous && mostAnomalous.anomalyDayCount > 0
              ? `${mostAnomalous.name} 异常员工日最多，建议优先复盘。`
              : '建议先看项目波动和工时流向。'}
          </span>
        </div>
      </Panel>

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
          label="总加班"
          value={`${formatNumber(overtimeMetrics.total)} h`}
          hint="工作日超 7.5h + 周末/法定节假日工时"
          tone="derived"
        />
        <MetricCard
          label="数据健康分"
          value={`${view.dataHealth.score}`}
          hint={view.dataHealth.status === 'healthy' ? '当前样本较稳' : view.dataHealth.status === 'watch' ? '结论需谨慎' : '优先检查数据质量'}
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
        subtitle={`这一期工时怎么变化，Top 3 项目占比 ${formatPercent(top3ProjectShare)}`}
        note={`样本量 ${view.employeeDays.length} 个员工日，时间范围 ${dataset.dateRange.start} 至 ${dataset.dateRange.end}。当前按${trendLabel}聚合。`}
        option={projectTrendOption}
        source="real"
        method={`按${trendLabel}聚合真实工时`}
        reliability={view.dataHealth.sampleDays < analysisConfig.thresholds.lowSampleDays ? '中，样本天数偏短' : '高'}
        caution="短样本适合观察波动，不适合判断长期效率"
        badge={trendLabel}
        actions={trendGranularityActions}
        onChartClick={
          trendGranularity === 'day'
            ? (params) =>
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
            : undefined
        }
      />

      <ChartPanel
        title="加班变化"
        subtitle={`把工作日拉长、周末投入和法定假日加班拆开看，假日加班 ${formatNumber(overtimeMetrics.holiday)}h`}
        note={`工作日按超出 ${analysisConfig.thresholds.standardDailyHours}h 的部分计入加班；周末和法定节假日按当天全部工时计入。当前数据范围内${
          holidayOvertimeDays.length
            ? `有 ${holidayOvertimeDays.length} 个法定节假日出现加班，主要集中在 ${uniqueHolidayNames(holidayOvertimeDays.map(([date]) => holidayLabel(date))).join('、')}。`
            : '没有记录到法定节假日加班。'
        }${filters.overtimeMode === 'bigSmallWeek' ? ` 当前按大小周处理：从 2025-07-05 起隔周周六按正常工作日计算，仅超出 ${analysisConfig.thresholds.standardDailyHours}h 的部分计入加班。` : ''}`}
        option={overtimeTrendOption}
        source="derived"
        method={`基于真实工时按${trendLabel}聚合，并按工作日/周末/法定节假日拆分`}
        reliability="中，依赖工时填报口径与节假日规则匹配"
        caution="这里反映的是投入时长，不直接代表劳动合规结论"
        badge="加班"
        actions={trendGranularityActions}
      />

      <ChartPanel
        title="加班分布直方图"
        subtitle={`看团队加班通常落在哪些区间，共 ${overtimeDayCount} 个加班员工日`}
        note={
          overtimeDayCount
            ? `横轴为单个员工日在当前口径下折算出的加班时长区间，纵轴为加班员工日数量。当前最常见区间是 ${dominantOvertimeBin?.label ?? '暂无'}。`
            : '当前范围内没有加班记录，因此没有形成可解释的分布。'
        }
        option={overtimeHistogramOption}
        source="derived"
        method="将每个员工日折算为加班小时后按区间分箱，并按工作日/周末/法定节假日拆分频次"
        reliability="中，受工时填报、节假日规则和大小周口径影响"
        caution="这里看的是加班发生频次，不是加班总量；少量长时周末值会集中落入高区间"
        badge="分布"
      />

      <ChartPanel
        title="加班重点人"
        subtitle="谁的加班更多，优先复盘排班和项目分配"
        note={
          topOvertimeEmployees.length
            ? `${topOvertimeEmployees[0].name} 当前加班最多，为 ${formatNumber(topOvertimeEmployees[0].total)}h。`
            : '当前范围内没有显著加班样本。'
        }
        option={overtimeEmployeeOption}
        source="derived"
        method="基于员工日工时和法定节假日规则汇总"
        reliability="中"
        caution="建议与关键项目节点、请假、调休和填报准确性一起复盘"
        onChartClick={(params) => {
          const employee = topOvertimeEmployees.find((item) => item.name === params.name);
          if (!employee) return;
          onOpenDetail({
            kind: 'employee',
            title: '员工聚焦分析',
            subtitle: employee.name,
            employeeId: employee.employeeId,
            rows: [],
          });
        }}
      />

      <ChartPanel
        title="项目投入结构"
        subtitle="工时主要流向哪些重点项目"
        note={`展示当前 Top ${topProjectNames.length} 项目的${trendLabel}分布。`}
        option={stackedProjectOption}
        source="real"
        method={`按项目和${trendLabel}做堆叠聚合`}
        reliability="中，受任务填报粒度影响"
        caution="未填报或粗粒度填报会压缩真实波动"
        actions={trendGranularityActions}
      />

      <ChartPanel
        title="项目占比河流图"
        subtitle="看项目占比随时间怎么变化"
        note={`这张图默认只保留 Top 5 项目，并把其余项目合并为“其他”。适合看结构迁移，而不是看单日极值。当前按${trendLabel}聚合。`}
        option={riverOption}
        source="real"
        method={`按项目和${trendLabel}聚合的占比河流图（Top 5 + 其他）`}
        reliability="中"
        caution="更适合看项目占比变化，不适合精确比较同一时间点的绝对值"
        actions={trendGranularityActions}
      />

      <ChartPanel
        title="员工风险分布"
        subtitle="谁更可能存在切换负担或投入分散"
        note="横轴越靠右表示多项目率越高，纵轴越低表示集中度越差。气泡固定分 3 档：低风险 / 中风险 / 高风险，不再按异常日线性放大。"
        option={employeeRiskOption}
        source="derived"
        method="多项目率 + 集中度 + 异常员工日联动"
        reliability="中"
        caution="这是管理复盘线索，不是绩效评分"
        onChartClick={(params) => {
          const label = String((params.value as Array<string | number>)?.[3] ?? '');
          const employee = view.employeeStats.find((item) => item.name === label);
          if (!employee) return;
          onOpenDetail({
            kind: 'employee',
            title: '员工聚焦分析',
            subtitle: employee.name,
            employeeId: employee.employeeId,
            rows: [],
          });
        }}
      />

      <ChartPanel
        title="工时流向"
        subtitle="员工 → 项目 → 主题"
        note="这张图回答：工时在当前筛选条件下是如何流动的。"
        option={sankeyOption}
        className="panel-wide"
        height={460}
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
                .slice(0, analysisConfig.displayLimits.overviewDetailRows)
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

      <Panel
        title="本期重点"
        subtitle="用图表之外的一句话收住首页信息"
        className="panel-wide panel-strip"
        meta={
          <div className="chart-meta">
            <MetaPill tone="real">真实工时</MetaPill>
            <span>主题主要集中在 {topicNames.join('、') || '暂无'}</span>
          </div>
        }
      >
        <div className="callout">
          <strong>建议优先从“项目投入结构”和“员工风险分布”两张图开始下钻。</strong>
          <span>首页只回答整体资源去哪了、谁值得复盘，不承担明细核查。</span>
        </div>
      </Panel>
    </div>
  );
}

function uniqueHolidayNames(values: string[]) {
  return Array.from(new Set(values));
}
