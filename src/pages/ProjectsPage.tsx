import { useState } from 'react';
import { ChartPanel } from '../components/ChartPanel';
import { MetaPill } from '../components/MetaPill';
import { Panel } from '../components/Panel';
import { TrendGranularitySwitch } from '../components/TrendGranularitySwitch';
import { analysisConfig } from '../config/analysisConfig';
import { projectColor } from '../lib/chartColors';
import { formatNumber, formatPercent } from '../lib/format';
import { getProjectReworkShareMetric } from '../lib/metrics';
import {
  classifyTaskWorkstream,
  detectTaskStage,
  isReworkTask,
} from '../lib/taskSignals';
import {
  buildGranularityLabels,
  fillGroupedSeries,
  groupSeriesByGranularity,
  trendGranularityLabel,
  type TrendGranularity,
} from '../lib/timeSeries';
import type { AnalyticsView, DetailSelection, Filters } from '../types';

const PROJECT_WORKFLOW_ORDER = ['建设型', '修补型', '支撑型', '成长型'] as const;

interface ProjectsPageProps {
  view: AnalyticsView;
  filters: Filters;
  onOpenDetail: (detail: DetailSelection) => void;
}

export function ProjectsPage({ view, filters, onOpenDetail }: ProjectsPageProps) {
  const [pageMode, setPageMode] = useState<'charts' | 'catalog'>('charts');
  const [catalogChartMode, setCatalogChartMode] = useState<
    | 'hours'
    | 'rework'
    | 'workflow'
    | 'participants'
    | 'average'
    | 'diversity'
    | 'trend'
    | 'structure'
  >('hours');
  const [tierMode, setTierMode] = useState<'top' | 'mid' | 'tail'>('top');
  const [scatterMode, setScatterMode] = useState<'focus' | 'all' | 'mid' | 'tail'>('focus');
  const [workflowScope, setWorkflowScope] = useState<'focus' | 'all'>('focus');
  const workflowFocusCount = analysisConfig.displayLimits.projectTierSize;
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
  const topProjects = view.projectStats.slice(0, analysisConfig.displayLimits.projectPrimary);
  const steepestProject = [...view.projectStats].sort(
    (left, right) => right.trendSlope - left.trendSlope,
  )[0];
  const topProject = topProjects[0];
  const projectReworkStats = view.projectStats.map((project) => {
    const tasks = view.tasks.filter((task) => task.projectName === project.projectName);
    const reworkHours = tasks
      .filter((task) => isReworkTask(task))
      .reduce((sum, task) => sum + task.reportHour, 0);
    const stageHours = new Map<string, number>();
    tasks.forEach((task) => {
      const stage = detectTaskStage(task);
      stageHours.set(stage, (stageHours.get(stage) ?? 0) + task.reportHour);
    });
    const dominantStage = [...stageHours.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? '其他';
    const developmentHours = (stageHours.get('开发') ?? 0) + (stageHours.get('需求/设计') ?? 0);
    const maintenanceHours = (stageHours.get('维护/反馈') ?? 0) + reworkHours;
    return {
      ...project,
      reworkHours,
      reworkRate: getProjectReworkShareMetric({
        totalHours: project.totalHours,
        reworkHours,
      }).value,
      dominantStage,
      developmentHours,
      maintenanceHours,
    };
  });
  const fixHeavyProjects = [...projectReworkStats]
    .filter(
      (project) =>
        project.totalHours >= analysisConfig.thresholds.fixHeavyProjectMinHours &&
        project.maintenanceHours >
          project.developmentHours * analysisConfig.thresholds.fixHeavyMaintenanceMultiplier &&
        project.reworkRate >= analysisConfig.thresholds.fixHeavyReworkRate,
    )
    .sort(
      (left, right) =>
        right.maintenanceHours / Math.max(right.developmentHours, 1) -
        left.maintenanceHours / Math.max(left.developmentHours, 1),
    );
  const fixHeavySummary =
    fixHeavyProjects.length > 0
      ? `${fixHeavyProjects
          .slice(0, 2)
          .map(
            (project) =>
              `${project.projectName}（修改/维护 ${formatNumber(project.maintenanceHours)}h，高于开发 ${formatNumber(project.developmentHours)}h）`,
          )
          .join('、')} 更像“开发期短、修改期长”的项目。`
      : '当前未发现明显“开发期短、修改期长”的重点项目。';
  const sortedProjects = [...projectReworkStats].sort(
    (left, right) => right.totalHours - left.totalHours,
  );
  const scatterBucketSize = analysisConfig.displayLimits.projectScatterBucketSize;
  const tieredProjects =
    tierMode === 'top'
      ? sortedProjects.slice(0, analysisConfig.displayLimits.projectTierSize)
      : tierMode === 'mid'
        ? sortedProjects.slice(
            analysisConfig.displayLimits.projectTierSize,
            analysisConfig.displayLimits.projectTailStart,
          )
        : sortedProjects.slice(
            analysisConfig.displayLimits.projectTailStart,
            analysisConfig.displayLimits.projectTailEnd,
          );
  const displayedProjects =
    tieredProjects.length > 0
      ? tieredProjects
      : sortedProjects.slice(0, analysisConfig.displayLimits.projectTierSize);
  const scatterTieredProjects =
    scatterMode === 'all'
      ? sortedProjects
      : scatterMode === 'focus'
        ? sortedProjects.slice(0, scatterBucketSize)
        : scatterMode === 'mid'
          ? sortedProjects.slice(scatterBucketSize, scatterBucketSize * 2)
          : sortedProjects.slice(scatterBucketSize * 2, scatterBucketSize * 3);
  const scatterProjects = (
    scatterTieredProjects.length > 0 ? scatterTieredProjects : sortedProjects.slice(0, scatterBucketSize)
  ).filter((item) => item.totalHours > 0);
  const fastestProjects = [...projectReworkStats]
    .filter((item) => item.totalHours > 0)
    .sort((left, right) => right.trendSlope - left.trendSlope)
    .slice(0, analysisConfig.displayLimits.projectPrimary);
  const reworkRankProjects = [...projectReworkStats]
    .filter((item) => item.totalHours > 0)
    .sort((left, right) => right.reworkRate - left.reworkRate)
    .slice(0, analysisConfig.displayLimits.projectPrimary);
  const workflowProjects = (
    workflowScope === 'all'
      ? sortedProjects
      : sortedProjects.slice(0, workflowFocusCount)
  ).filter((item) => item.totalHours > 0);
  const workflowOrder = PROJECT_WORKFLOW_ORDER;
  const workflowColorMap: Record<(typeof PROJECT_WORKFLOW_ORDER)[number], string> = {
    建设型: '#2563eb',
    修补型: '#ef4444',
    支撑型: '#f59e0b',
    成长型: '#8b5cf6',
  };
  const allWorkflowStats = sortedProjects.map((project) => {
    const projectTasks = view.tasks.filter((task) => task.projectName === project.projectName);
    const workstreamHours = workflowOrder.reduce(
      (summary, label) => ({ ...summary, [label]: 0 }),
      {} as Record<(typeof workflowOrder)[number], number>,
    );
    let pendingHours = 0;
    projectTasks.forEach((task) => {
      const workstream = classifyTaskWorkstream(task);
      if (workstream in workstreamHours) {
        workstreamHours[workstream as keyof typeof workstreamHours] += task.reportHour;
      } else {
        pendingHours += task.reportHour;
      }
    });
    const totalTrackedHours = workflowOrder.reduce(
      (sum, label) => sum + workstreamHours[label],
      0,
    );
    const denominator = totalTrackedHours || project.totalHours || 1;
    return {
      projectName: project.projectName,
      totalHours: project.totalHours,
      pendingHours,
      workstreamHours,
      shares: workflowOrder.reduce(
        (summary, label) => ({
          ...summary,
          [label]: Number(((workstreamHours[label] / denominator) * 100).toFixed(1)),
        }),
        {} as Record<(typeof workflowOrder)[number], number>,
      ),
    };
  });
  const workflowStats = allWorkflowStats.filter((item) =>
    workflowProjects.some((project) => project.projectName === item.projectName),
  );
  const repairHeavyWorkflowProject = [...workflowStats].sort(
    (left, right) => right.shares['修补型'] - left.shares['修补型'],
  )[0];
  const workflowChartHeight =
    workflowScope === 'all' ? Math.max(320, workflowStats.length * 42 + 96) : 320;

  const bubbleSymbolSize = (value: number[]) =>
    Math.min(56, Math.max(18, 14 + Number(value[2] ?? 0) * 4));
  const quadrantSymbolSize = (value: number[]) =>
    Math.min(44, Math.max(16, 12 + Number(value[2] ?? 0) * 2.2));
  const scatterGrid = { left: 36, right: 32, top: 36, bottom: 56, containLabel: true };

  const groupedProjectSeries = topProjects
    .slice(0, analysisConfig.displayLimits.projectTierSize)
    .map((project) => ({
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
  const tierTrendProjects = displayedProjects.slice(0, analysisConfig.displayLimits.projectTierSize);
  const tierGroupedProjectSeries = tierTrendProjects.map((project) => ({
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

  const barOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 24, right: 20, top: 24, bottom: 40, containLabel: true },
    xAxis: { type: 'value', name: '总工时（h）' },
    yAxis: { type: 'category', data: displayedProjects.map((item) => item.projectName) },
    series: [
      {
        type: 'bar',
        data: displayedProjects.map((item) => item.totalHours),
        itemStyle: { color: '#2a9d8f', borderRadius: 10 },
      },
    ],
  };

  const trendOption = {
    tooltip: { trigger: 'axis' },
    legend: { top: 0 },
    grid: { left: 24, right: 20, top: 48, bottom: 40, containLabel: true },
    xAxis: {
      type: 'category',
      data: trendLabels,
    },
    yAxis: { type: 'value', name: '工时' },
    series: tierTrendProjects.map((project, index) => ({
      name: project.projectName,
      type: 'line',
      smooth: true,
      data: fillGroupedSeries(
        trendLabels,
        tierGroupedProjectSeries.find((item) => item.projectName === project.projectName)?.points ?? [],
      ).map((item) => item.value),
      color: projectColor(index),
    })),
  };

  const bubbleOption = {
    tooltip: {
      trigger: 'item',
      formatter: (params: { value?: Array<string | number> }) => {
        const value = params.value ?? [];
        const projectName = String(value[3] ?? '');
        const project = scatterProjects.find((item) => item.projectName === projectName);
        if (!project) return projectName;
        return [
          `<strong>${project.projectName}</strong>`,
          `参与人数：${project.participantCount}`,
          `总工时：${formatNumber(project.totalHours)} h`,
          `主题复杂度：${project.topicDiversity}`,
          `人均投入：${formatNumber(project.averageHoursPerPerson)} h`,
          `主导主题：${project.primaryTopic}`,
        ].join('<br/>');
      },
    },
    grid: scatterGrid,
    xAxis: { type: 'value', name: '参与人数', scale: true },
    yAxis: { type: 'value', name: '总工时', scale: true },
    series: [
      {
        type: 'scatter',
        clip: false,
        symbolSize: bubbleSymbolSize,
        data: scatterProjects.map((project) => [
          project.participantCount,
          project.totalHours,
          project.topicDiversity,
          project.projectName,
        ]),
      },
    ],
  };

  const quadrantOption = {
    tooltip: {
      trigger: 'item',
      formatter: (params: { value?: Array<string | number> }) => {
        const value = params.value ?? [];
        const projectName = String(value[3] ?? '');
        const project = projectReworkStats.find((item) => item.projectName === projectName);
        if (!project) return projectName;
        return [
          `<strong>${project.projectName}</strong>`,
          `总工时：${formatNumber(project.totalHours)} h`,
          `返工类工时占比：${formatPercent(project.reworkRate)}`,
          `返工类工时：${formatNumber(project.reworkHours)} h`,
          `参与人数：${project.participantCount}`,
          `主阶段：${project.dominantStage}`,
        ].join('<br/>');
      },
    },
    grid: scatterGrid,
    xAxis: { type: 'value', name: '总工时', scale: true },
    yAxis: {
      type: 'value',
      name: '返工类工时占比',
      axisLabel: { formatter: '{value}%' },
      max: 100,
      scale: true,
    },
    series: [
      {
        type: 'scatter',
        clip: false,
        symbolSize: quadrantSymbolSize,
        data: scatterProjects.map((project) => [
          Number(project.totalHours.toFixed(1)),
          Number((project.reworkRate * 100).toFixed(1)),
          project.participantCount,
          project.projectName,
        ]),
        itemStyle: { color: '#ef4444', opacity: 0.84 },
      },
    ],
  };

  const fastestOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: Array<{ name: string; value: number }>) => {
        const label = params[0]?.name ?? '';
        const project = fastestProjects.find((item) => item.projectName === label);
        if (!project) return label;
        return [
          `<strong>${project.projectName}</strong>`,
          `趋势斜率：${formatNumber(project.trendSlope, 1)}`,
          `总工时：${formatNumber(project.totalHours)} h`,
          `参与人数：${project.participantCount}`,
          `主导主题：${project.primaryTopic}`,
        ].join('<br/>');
      },
    },
    grid: { left: 24, right: 20, top: 24, bottom: 40, containLabel: true },
    xAxis: { type: 'value', name: '趋势斜率' },
    yAxis: { type: 'category', data: fastestProjects.map((item) => item.projectName) },
    series: [
      {
        type: 'bar',
        data: fastestProjects.map((item) => Number(item.trendSlope.toFixed(1))),
        itemStyle: { color: '#0a84ff', borderRadius: 10 },
      },
    ],
  };
  const reworkRankOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: Array<{ name: string; value: number }>) => {
        const label = params[0]?.name ?? '';
        const project = reworkRankProjects.find((item) => item.projectName === label);
        if (!project) return label;
        return [
          `<strong>${project.projectName}</strong>`,
          `返工占比：${formatPercent(project.reworkRate)}`,
          `返工类工时：${formatNumber(project.reworkHours)} h`,
          `总工时：${formatNumber(project.totalHours)} h`,
          `主阶段：${project.dominantStage}`,
        ].join('<br/>');
      },
    },
    grid: { left: 24, right: 20, top: 24, bottom: 40, containLabel: true },
    xAxis: {
      type: 'value',
      name: '返工占比',
      axisLabel: { formatter: '{value}%' },
      max: 100,
    },
    yAxis: { type: 'category', data: reworkRankProjects.map((item) => item.projectName) },
    series: [
      {
        type: 'bar',
        data: reworkRankProjects.map((item) => Number((item.reworkRate * 100).toFixed(1))),
        itemStyle: { color: '#ef4444', borderRadius: 10 },
      },
    ],
  };
  const workflowOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (
        params: Array<{ seriesName: string; value: number; name: string }>,
      ) => {
        const projectName = params[0]?.name ?? '';
        const project = workflowStats.find((item) => item.projectName === projectName);
        if (!project) return projectName;
        return [
          `<strong>${project.projectName}</strong>`,
          `总工时：${formatNumber(project.totalHours)} h`,
          ...workflowOrder.map(
            (label) =>
              `${label}：${formatNumber(project.workstreamHours[label])} h (${formatNumber(
                project.shares[label],
                1,
              )}%)`,
          ),
          project.pendingHours > 0
            ? `待确认：${formatNumber(project.pendingHours)} h（未计入四类占比）`
            : '',
        ]
          .filter(Boolean)
          .join('<br/>');
      },
    },
    legend: { top: 0 },
    grid: { left: 28, right: 24, top: 52, bottom: 40, containLabel: true },
    xAxis: {
      type: 'value',
      name: '工作流占比',
      max: 100,
      axisLabel: { formatter: '{value}%' },
    },
    yAxis: {
      type: 'category',
      data: workflowStats.map((item) => item.projectName),
    },
    series: workflowOrder.map((label) => ({
      name: label,
      type: 'bar',
      stack: 'workflow',
      emphasis: { focus: 'series' },
      itemStyle: { color: workflowColorMap[label], borderRadius: 8 },
      data: workflowStats.map((item) => item.shares[label]),
    })),
  };
  const tierLabel =
    tierMode === 'top' ? 'Top 5' : tierMode === 'mid' ? '中腰部' : '长尾';
  const scatterLabel =
    scatterMode === 'focus'
      ? '重点项目'
      : scatterMode === 'all'
        ? '全部项目'
        : scatterMode === 'mid'
          ? '中腰部'
          : '长尾';
  const renderScatterActions = () => (
    <div className="mini-segment" aria-label="散点图显示范围">
      {[
        ['focus', '重点'],
        ['all', '全部'],
        ['mid', '中腰部'],
        ['tail', '长尾'],
      ].map(([value, label]) => (
        <button
          key={value}
          type="button"
          className={`mini-segment-button ${scatterMode === value ? 'active' : ''}`.trim()}
          onClick={() => setScatterMode(value as 'focus' | 'all' | 'mid' | 'tail')}
        >
          {label}
        </button>
      ))}
    </div>
  );
  const renderTrendActions = () =>
    canSwitchTrendGranularity ? (
      <TrendGranularitySwitch
        value={monthTrendGranularity}
        onChange={setMonthTrendGranularity}
        ariaLabel="项目趋势聚合粒度"
      />
    ) : undefined;
  const renderWorkflowActions = () => (
    <div className="mini-segment" aria-label="项目工作流显示范围">
      {[
        ['focus', `Top ${workflowFocusCount}`],
        ['all', '全部'],
      ].map(([value, label]) => (
        <button
          key={value}
          type="button"
          className={`mini-segment-button ${workflowScope === value ? 'active' : ''}`.trim()}
          onClick={() => setWorkflowScope(value as 'focus' | 'all')}
        >
          {label}
        </button>
      ))}
    </div>
  );
  const renderCatalogActions = () => (
    <div className="catalog-switcher" aria-label="全量项目主图切换">
      {[
        {
          label: '规模',
          items: [
            ['hours', '总工时'],
            ['participants', '参与人数'],
            ['average', '人均投入'],
          ] as const,
        },
        {
          label: '质量/结构',
          items: [
            ['rework', '返工占比'],
            ['structure', '开发/维护'],
            ['workflow', '工作流'],
          ] as const,
        },
        {
          label: '变化',
          items: [
            ['diversity', '复杂度'],
            ['trend', '趋势'],
          ] as const,
        },
      ].map((group) => (
        <div className="catalog-switcher-group" key={group.label}>
          <span className="catalog-switcher-label">{group.label}</span>
          <div className="mini-segment">
            {group.items.map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`mini-segment-button ${catalogChartMode === value ? 'active' : ''}`.trim()}
                onClick={() => setCatalogChartMode(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
  const openProjectDetail = (projectName: string) =>
    onOpenDetail({
      kind: 'project',
      title: '项目聚焦分析',
      subtitle: projectName,
      projectName,
      rows: [],
    });

  const catalogBarMaxWidth = 14;
  const createCatalogBarSeries = (
    values: number[],
    color: string,
  ) => ({
    type: 'bar',
    barMaxWidth: catalogBarMaxWidth,
    data: values,
    itemStyle: { color, borderRadius: 10 },
  });
  const participantProjects = [...sortedProjects].sort(
    (left, right) =>
      right.participantCount - left.participantCount || right.totalHours - left.totalHours,
  );
  const averageHoursProjects = [...sortedProjects].sort(
    (left, right) =>
      right.averageHoursPerPerson - left.averageHoursPerPerson || right.totalHours - left.totalHours,
  );
  const diversityProjects = [...sortedProjects].sort(
    (left, right) => right.topicDiversity - left.topicDiversity || right.totalHours - left.totalHours,
  );
  const trendProjects = [...projectReworkStats].sort(
    (left, right) => right.trendSlope - left.trendSlope || right.totalHours - left.totalHours,
  );
  const structureProjects = [...projectReworkStats].sort(
    (left, right) => right.maintenanceHours - left.maintenanceHours || right.totalHours - left.totalHours,
  );

  const allProjectsBarOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 28, right: 20, top: 24, bottom: 40, containLabel: true },
    xAxis: { type: 'value', name: '总工时（h）' },
    yAxis: {
      type: 'category',
      inverse: true,
      data: sortedProjects.map((item) => item.projectName),
    },
    series: [
      createCatalogBarSeries(sortedProjects.map((item) => item.totalHours), '#2a9d8f'),
    ],
  };

  const allProjectsReworkOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: Array<{ name: string; value: number }>) => {
        const label = params[0]?.name ?? '';
        const project = projectReworkStats.find((item) => item.projectName === label);
        if (!project) return label;
        return [
          `<strong>${project.projectName}</strong>`,
          `返工占比：${formatPercent(project.reworkRate)}`,
          `返工类工时：${formatNumber(project.reworkHours)} h`,
          `总工时：${formatNumber(project.totalHours)} h`,
          `主阶段：${project.dominantStage}`,
        ].join('<br/>');
      },
    },
    grid: { left: 28, right: 20, top: 24, bottom: 40, containLabel: true },
    xAxis: {
      type: 'value',
      name: '返工占比',
      axisLabel: { formatter: '{value}%' },
      max: 100,
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: [...projectReworkStats]
        .sort((left, right) => right.reworkRate - left.reworkRate)
        .map((item) => item.projectName),
    },
    series: [
      createCatalogBarSeries(
        [...projectReworkStats]
          .sort((left, right) => right.reworkRate - left.reworkRate)
          .map((item) => Number((item.reworkRate * 100).toFixed(1))),
        '#ef4444',
      ),
    ],
  };

  const allParticipantsOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 28, right: 20, top: 24, bottom: 40, containLabel: true },
    xAxis: { type: 'value', name: '参与人数' },
    yAxis: {
      type: 'category',
      inverse: true,
      data: participantProjects.map((item) => item.projectName),
    },
    series: [
      createCatalogBarSeries(
        participantProjects.map((item) => item.participantCount),
        '#0a84ff',
      ),
    ],
  };

  const allAverageHoursOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 28, right: 20, top: 24, bottom: 40, containLabel: true },
    xAxis: { type: 'value', name: '人均投入（h）' },
    yAxis: {
      type: 'category',
      inverse: true,
      data: averageHoursProjects.map((item) => item.projectName),
    },
    series: [
      createCatalogBarSeries(
        averageHoursProjects.map((item) => item.averageHoursPerPerson),
        '#7c5cff',
      ),
    ],
  };

  const allDiversityOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 28, right: 20, top: 24, bottom: 40, containLabel: true },
    xAxis: { type: 'value', name: '主题复杂度' },
    yAxis: {
      type: 'category',
      inverse: true,
      data: diversityProjects.map((item) => item.projectName),
    },
    series: [
      createCatalogBarSeries(
        diversityProjects.map((item) => item.topicDiversity),
        '#ff9f0a',
      ),
    ],
  };

  const allTrendOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 28, right: 20, top: 24, bottom: 40, containLabel: true },
    xAxis: { type: 'value', name: '趋势斜率' },
    yAxis: {
      type: 'category',
      inverse: true,
      data: trendProjects.map((item) => item.projectName),
    },
    series: [
      createCatalogBarSeries(
        trendProjects.map((item) => Number(item.trendSlope.toFixed(1))),
        '#34c759',
      ),
    ],
  };

  const allStructureOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (
        params: Array<{ seriesName: string; value: number; name: string }>,
      ) => {
        const projectName = params[0]?.name ?? '';
        const project = structureProjects.find((item) => item.projectName === projectName);
        if (!project) return projectName;
        return [
          `<strong>${project.projectName}</strong>`,
          `维护/修改：${formatNumber(project.maintenanceHours)} h`,
          `开发/需求：${formatNumber(project.developmentHours)} h`,
          `总工时：${formatNumber(project.totalHours)} h`,
          `返工占比：${formatPercent(project.reworkRate)}`,
        ].join('<br/>');
      },
    },
    legend: { top: 0 },
    grid: { left: 28, right: 24, top: 52, bottom: 40, containLabel: true },
    xAxis: { type: 'value', name: '工时' },
    yAxis: {
      type: 'category',
      inverse: true,
      data: structureProjects.map((item) => item.projectName),
    },
    series: [
      {
        name: '开发/需求',
        type: 'bar',
        stack: 'structure',
        barMaxWidth: catalogBarMaxWidth,
        data: structureProjects.map((item) => item.developmentHours),
        itemStyle: { color: '#1f6fff', borderRadius: 8 },
      },
      {
        name: '维护/修改',
        type: 'bar',
        stack: 'structure',
        barMaxWidth: catalogBarMaxWidth,
        data: structureProjects.map((item) => item.maintenanceHours),
        itemStyle: { color: '#ff7a59', borderRadius: 8 },
      },
    ],
  };

  const allWorkflowOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (
        params: Array<{ seriesName: string; value: number; name: string }>,
      ) => {
        const projectName = params[0]?.name ?? '';
        const project = allWorkflowStats.find((item) => item.projectName === projectName);
        if (!project) return projectName;
        return [
          `<strong>${project.projectName}</strong>`,
          `总工时：${formatNumber(project.totalHours)} h`,
          ...workflowOrder.map(
            (label) =>
              `${label}：${formatNumber(project.workstreamHours[label])} h (${formatNumber(
                project.shares[label],
                1,
              )}%)`,
          ),
          project.pendingHours > 0
            ? `待确认：${formatNumber(project.pendingHours)} h（未计入四类占比）`
            : '',
        ]
          .filter(Boolean)
          .join('<br/>');
      },
    },
    legend: { top: 0 },
    grid: { left: 28, right: 24, top: 52, bottom: 40, containLabel: true },
    xAxis: {
      type: 'value',
      name: '工作流占比',
      max: 100,
      axisLabel: { formatter: '{value}%' },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: allWorkflowStats.map((item) => item.projectName),
    },
    series: workflowOrder.map((label) => ({
      name: label,
      type: 'bar',
      stack: 'workflow',
      barMaxWidth: catalogBarMaxWidth,
      emphasis: { focus: 'series' },
      itemStyle: { color: workflowColorMap[label], borderRadius: 8 },
      data: allWorkflowStats.map((item) => item.shares[label]),
    })),
  };

  const catalogHeroHeight = (() => {
    if (catalogChartMode === 'workflow' || catalogChartMode === 'structure') {
      return Math.max(420, allWorkflowStats.length * 42 + 110);
    }
    return Math.max(420, sortedProjects.length * 36 + 110);
  })();

  const catalogChartConfig = {
    hours: {
      title: '全部项目总工时',
      subtitle: `按总工时完整展开 ${sortedProjects.length} 个项目`,
      note: '',
      option: allProjectsBarOption,
      source: 'real' as const,
      onChartClick: (params: { name?: string }) => openProjectDetail(String(params.name ?? '')),
    },
    rework: {
      title: '全部项目返工占比',
      subtitle: '按返工占比从高到低展开全部项目',
      note: '',
      option: allProjectsReworkOption,
      source: 'derived' as const,
      onChartClick: (params: { name?: string }) => openProjectDetail(String(params.name ?? '')),
    },
    participants: {
      title: '全部项目参与人数',
      subtitle: '按参与人数从高到低展开全部项目',
      note: '',
      option: allParticipantsOption,
      source: 'derived' as const,
      onChartClick: (params: { name?: string }) => openProjectDetail(String(params.name ?? '')),
    },
    average: {
      title: '全部项目人均投入',
      subtitle: '按人均投入从高到低展开全部项目',
      note: '',
      option: allAverageHoursOption,
      source: 'derived' as const,
      onChartClick: (params: { name?: string }) => openProjectDetail(String(params.name ?? '')),
    },
    diversity: {
      title: '全部项目主题复杂度',
      subtitle: '按主题复杂度从高到低展开全部项目',
      note: '',
      option: allDiversityOption,
      source: 'derived' as const,
      onChartClick: (params: { name?: string }) => openProjectDetail(String(params.name ?? '')),
    },
    trend: {
      title: '全部项目趋势斜率',
      subtitle: '按趋势斜率从高到低展开全部项目',
      note: '',
      option: allTrendOption,
      source: 'derived' as const,
      onChartClick: (params: { name?: string }) => openProjectDetail(String(params.name ?? '')),
    },
    structure: {
      title: '全部项目开发-维护结构',
      subtitle: '按维护/修改工时从高到低展开全部项目',
      note: '',
      option: allStructureOption,
      source: 'derived' as const,
      onChartClick: (params: { name?: string }) => openProjectDetail(String(params.name ?? '')),
    },
    workflow: {
      title: '全部项目工作流结构',
      subtitle: '按总工时从高到低展开全部项目',
      note: '',
      option: allWorkflowOption,
      source: 'derived' as const,
      onChartClick: (params: { name?: string }) => openProjectDetail(String(params.name ?? '')),
    },
  }[catalogChartMode];

  return (
    <div className="page-grid">
      <section
        className={`panel panel-wide project-view-toolbar ${pageMode === 'catalog' ? 'sticky' : ''}`.trim()}
      >
        <div className="project-view-toolbar-inner">
          <div className="project-view-toolbar-copy">
            <p className="panel-kicker">项目页视图</p>
            <h3 className="panel-title">
              {pageMode === 'charts' ? '图表探索' : '全量项目纵览'}
            </h3>
            <p className="project-view-toolbar-note">
              {pageMode === 'charts'
                ? '先找重点项目，再下钻详情。'
                : '主图支持随滚动切换不同全量视角。'}
            </p>
          </div>
          <div className="project-view-toolbar-actions">
            <div className="focus-tabs" role="tablist" aria-label="项目页视图切换">
              {[
                ['charts', '图表页'],
                ['catalog', '全量项目'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={pageMode === value}
                  className={`focus-tab ${pageMode === value ? 'active' : ''}`.trim()}
                  onClick={() => setPageMode(value as 'charts' | 'catalog')}
                >
                  {label}
                </button>
              ))}
            </div>
            {pageMode === 'catalog' ? renderCatalogActions() : null}
          </div>
        </div>
      </section>

      {pageMode === 'charts' ? (
        <>
      <Panel
        title="项目洞察"
        subtitle="先看重点项目，再点开项目纵览"
        className="panel-wide panel-strip"
        meta={
          <div className="chart-meta">
            <MetaPill tone="derived">规则推导</MetaPill>
            <span>趋势斜率：按日工时线性回归斜率</span>
            <span>参与人数：观察期内至少有 1 条任务的员工数</span>
            <span>人均投入：总工时 / 参与人数</span>
          </div>
        }
        actions={
          <div className="mini-segment">
            {[
              ['top', 'Top 5'],
              ['mid', '中腰部'],
              ['tail', '长尾'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`mini-segment-button ${tierMode === value ? 'active' : ''}`.trim()}
                onClick={() => setTierMode(value as 'top' | 'mid' | 'tail')}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        <div className="insight-grid">
          <div className="insight-card">
            <strong>当前投入最高</strong>
            <p>
              {topProject
                ? `${topProject.projectName} 是当前投入最高的项目，总工时 ${formatNumber(topProject.totalHours)}h。`
                : '当前没有可解释的项目样本。'}
            </p>
          </div>
          <div className="insight-card">
            <strong>变化最快</strong>
            <p>
              {steepestProject
                ? `${steepestProject.projectName} 的趋势斜率最高，为 ${formatNumber(steepestProject.trendSlope, 1)}。`
                : '当前没有可解释的项目趋势样本。'}
            </p>
          </div>
          <div className="insight-card">
            <strong>修改期偏长</strong>
            <p>
              {fixHeavySummary}
            </p>
          </div>
        </div>
      </Panel>

      <ChartPanel
        title="项目工作流结构图"
        subtitle="一眼看出哪些项目更偏建设、修补、支撑还是成长"
        note={
          repairHeavyWorkflowProject
            ? `${repairHeavyWorkflowProject.projectName} 当前修补型占比最高，为 ${formatNumber(repairHeavyWorkflowProject.shares['修补型'], 1)}%。默认展示重点项目，可切换查看全部。`
            : '这张图按四类工作流拆分项目工时结构，适合快速识别“修补型占比偏高”的项目。'
        }
        option={workflowOption}
        height={workflowChartHeight}
        source="derived"
        method="按项目聚合任务，再归并为建设型 / 修补型 / 支撑型 / 成长型并换算占比"
        reliability="中"
        caution="待确认和未分类任务不计入四类占比，若灰区任务较多，建议先去任务页补规则"
        actions={renderWorkflowActions()}
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
        title="项目投入规模"
        subtitle="固定看总工时，再切 Top 5 / 中腰部 / 长尾"
        note={`这张图只看总量，避免把“小时、斜率、百分比”混在一张图里。当前正在看 ${tierLabel} 项目。`}
        option={barOption}
        source="real"
        method="按项目聚合总工时，再按层级分组展示"
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
        title="变化最快项目"
        subtitle="单独看增长，不和总量混在一张图里"
        note={`这张图专门把“不是 Top 总量，但变化更快”的项目拉出来。当前变化最快的是 ${steepestProject?.projectName ?? '暂无'}。`}
        option={fastestOption}
        source="derived"
        method="按项目趋势斜率排序"
        reliability={view.dataHealth.sampleDays < analysisConfig.thresholds.lowSampleDays ? '中低，短样本敏感' : '中'}
        caution="趋势斜率适合看变化方向，建议结合总工时和返工占比一起解读"
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
        title="返工占比排行"
        subtitle="单独看返工压力，不和总量混在一张图里"
        note={`${fixHeavyProjects[0] ? `${fixHeavyProjects[0].projectName} 当前返工压力最值得优先复盘。` : '这张图回答：哪些项目更像处在修补和反馈处理阶段。'}`}
        option={reworkRankOption}
        source="derived"
        method="按返工类工时占比排序"
        reliability="中"
        caution="返工高说明修补压力大，建议结合总工时和阶段演进一起看"
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
        note={`这张图跟随当前 ${tierLabel} 视图。按${trendLabel}聚合，适合看这一层项目里谁在抬升、谁在回落。`}
        option={trendOption}
        source="real"
        method={`按项目和${trendLabel}聚合的趋势折线`}
        reliability={view.dataHealth.sampleDays < analysisConfig.thresholds.lowSampleDays ? '中低，短样本敏感' : '中'}
        caution="趋势斜率适合看投入方向，不适合直接评价项目成败"
        badge={trendLabel}
        actions={renderTrendActions()}
      />

      <ChartPanel
        title="项目气泡图"
        subtitle="参与人数、总工时、主题复杂度联动"
        note={`当前查看 ${scatterLabel}。可以切换范围看整体分布，也可以聚焦重点项目，避免全部堆在一张图里。`}
        option={bubbleOption}
        source="derived"
        method="参与人数 + 总工时 + 主题复杂度联动"
        reliability="中"
        caution="参与人数高不自动代表协同效率高，应和人均投入一起解读"
        actions={renderScatterActions()}
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

      <ChartPanel
        title="项目返工四象限"
        subtitle="总工时高且返工占比高的项目更值得优先复盘"
        note={`${fixHeavyProjects[0] ? `${fixHeavyProjects[0].projectName} 当前最接近“开发短、修改长”的模式。` : '纵轴越高，说明修改、bug、调整、客户反馈类工时占比越高。'} 当前查看 ${scatterLabel}。`}
        option={quadrantOption}
        source="derived"
        method="总工时 + 返工类关键词占比 + 项目参与人数"
        reliability="中"
        caution="返工类识别来自任务文本规则，适合快速发现线索"
        actions={renderScatterActions()}
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

      <Panel
        title="使用建议"
        subtitle="项目页只做定位，不做明细核查"
        className="panel-wide panel-strip"
        meta={
          <div className="chart-meta">
            <MetaPill tone="real">真实工时</MetaPill>
            <span>项目详情请直接点击图表进入项目纵览</span>
          </div>
        }
      >
        <div className="callout">
          <strong>建议先从“项目投入规模”和“项目气泡图”两张图开始点开项目。</strong>
          <span>项目页回答的是组合结构和复杂度，单个项目的趋势、成员构成和任务主题请在项目弹窗里看。</span>
        </div>
      </Panel>
        </>
      ) : (
        <>
          <ChartPanel
            title={catalogChartConfig.title}
            subtitle={catalogChartConfig.subtitle}
            note={catalogChartConfig.note}
            option={catalogChartConfig.option}
            height={catalogHeroHeight}
            className="panel-wide"
            source={catalogChartConfig.source}
            badge="全量"
            onChartClick={catalogChartConfig.onChartClick}
          />
        </>
      )}
    </div>
  );
}
