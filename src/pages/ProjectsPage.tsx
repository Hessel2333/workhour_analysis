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
  buildProjectStructureProfiles,
  projectStructureLabelColor,
} from '../lib/projectStructureLabels';
import { isReworkTask } from '../lib/taskSignals';
import {
  buildGranularityLabels,
  fillGroupedSeries,
  groupSeriesByGranularity,
  trendGranularityLabel,
  type TrendGranularity,
} from '../lib/timeSeries';
import type { AnalyticsView, DetailSelection, Filters } from '../types';

interface ProjectsPageProps {
  view: AnalyticsView;
  filters: Filters;
  onOpenDetail: (detail: DetailSelection) => void;
}

export function ProjectsPage({ view, filters, onOpenDetail }: ProjectsPageProps) {
  const chartScopeSize = 8;
  const [pageMode, setPageMode] = useState<'charts' | 'catalog'>('charts');
  const [catalogChartMode, setCatalogChartMode] = useState<
    | 'hours'
    | 'rework'
    | 'participants'
    | 'average'
    | 'bubble'
    | 'trend'
  >('hours');
  const [chartScope, setChartScope] = useState<'top' | 'mid' | 'tail'>('top');
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
  const projectReworkStats = view.projectStats.map((project) => {
    const tasks = view.tasks.filter((task) => task.projectName === project.projectName);
    const reworkHours = tasks
      .filter((task) => isReworkTask(task))
      .reduce((sum, task) => sum + task.reportHour, 0);
    return {
      ...project,
      reworkHours,
      reworkRate: getProjectReworkShareMetric({
        totalHours: project.totalHours,
        reworkHours,
      }).value,
    };
  });
  const projectStructureProfiles = buildProjectStructureProfiles(view.projectStats);
  const projectStructureProfileMap = new Map(
    projectStructureProfiles.map((item) => [item.projectName, item]),
  );
  const sortedProjects = [...projectReworkStats].sort(
    (left, right) => right.totalHours - left.totalHours,
  );
  const chartMidStart = chartScopeSize;
  const chartMidEnd = chartScopeSize * 2;
  const scopedProjects =
    chartScope === 'top'
      ? sortedProjects.slice(0, chartScopeSize)
      : chartScope === 'mid'
        ? sortedProjects.slice(chartMidStart, chartMidEnd)
        : sortedProjects.slice(chartMidEnd);
  const displayedProjects =
    scopedProjects.length > 0
      ? scopedProjects
      : sortedProjects.slice(0, chartScopeSize);
  const chartScopeLabel =
    chartScope === 'top'
      ? `TOP ${chartScopeSize}`
      : chartScope === 'mid'
        ? '腰部'
        : '中长尾';
  const scatterProjects = displayedProjects.filter((item) => item.totalHours > 0);
  const topProject = displayedProjects[0];
  const steepestProject = [...displayedProjects].sort(
    (left, right) => right.trendSlope - left.trendSlope,
  )[0];
  const fixHeavyProjects = [...displayedProjects]
    .filter(
      (project) =>
        project.totalHours >= analysisConfig.thresholds.fixHeavyProjectMinHours &&
        project.reworkRate >= analysisConfig.thresholds.fixHeavyReworkRate,
    )
    .sort((left, right) => right.reworkRate - left.reworkRate);
  const fixHeavySummary =
    fixHeavyProjects.length > 0
      ? `${fixHeavyProjects
          .slice(0, 2)
          .map(
            (project) =>
              `${project.projectName}（返工类 ${formatNumber(project.reworkHours)}h，占比 ${formatPercent(project.reworkRate)}）`,
          )
          .join('、')} 在当前${chartScopeLabel}范围内返工压力相对更高。`
      : `当前${chartScopeLabel}范围内未发现返工压力明显偏高的项目。`;
  const fastestProjects = [...displayedProjects]
    .filter((item) => item.totalHours > 0)
    .sort((left, right) => right.trendSlope - left.trendSlope)
    .slice(0, Math.min(displayedProjects.length, analysisConfig.displayLimits.projectPrimary));
  const reworkRankProjects = [...displayedProjects]
    .filter((item) => item.totalHours > 0)
    .sort((left, right) => right.reworkRate - left.reworkRate)
    .slice(0, Math.min(displayedProjects.length, analysisConfig.displayLimits.projectPrimary));

  const bubbleSymbolSize = (value: number[]) =>
    Math.min(56, Math.max(18, 14 + Number(value[2] ?? 0) * 4));
  const quadrantSymbolSize = (value: number[]) =>
    Math.min(44, Math.max(16, 12 + Number(value[2] ?? 0) * 2.2));
  const scatterGrid = { left: 36, right: 32, top: 36, bottom: 56, containLabel: true };

  const tierTrendProjects = displayedProjects.slice(0, chartScopeSize);
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
    yAxis: { type: 'category', inverse: true, data: displayedProjects.map((item) => item.projectName) },
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
    yAxis: { type: 'category', inverse: true, data: fastestProjects.map((item) => item.projectName) },
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
    yAxis: { type: 'category', inverse: true, data: reworkRankProjects.map((item) => item.projectName) },
    series: [
      {
        type: 'bar',
        data: reworkRankProjects.map((item) => Number((item.reworkRate * 100).toFixed(1))),
        itemStyle: { color: '#ef4444', borderRadius: 10 },
      },
    ],
  };
  const renderTrendActions = () =>
    canSwitchTrendGranularity ? (
      <TrendGranularitySwitch
        value={monthTrendGranularity}
        onChange={setMonthTrendGranularity}
        ariaLabel="项目趋势聚合粒度"
      />
    ) : undefined;
  const renderCatalogActions = () => (
    <div className="catalog-switcher" aria-label="全量项目主图切换">
      {[
        {
          label: '规模',
          items: [
            ['hours', '总工时'],
            ['participants', '参与人数'],
            ['average', '人均投入'],
            ['bubble', '气泡图'],
          ] as const,
        },
        {
          label: '质量/结构',
          items: [['rework', '返工占比']] as const,
        },
        {
          label: '变化',
          items: [['trend', '趋势']] as const,
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
  const trendProjects = [...projectReworkStats].sort(
    (left, right) => right.trendSlope - left.trendSlope || right.totalHours - left.totalHours,
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

  const allProjectsBubbleOption = {
    tooltip: {
      trigger: 'item',
      formatter: (params: { seriesName?: string; value?: Array<string | number> }) => {
        const value = params.value ?? [];
        const projectName = String(value[3] ?? '');
        const project = sortedProjects.find((item) => item.projectName === projectName);
        if (!project) return projectName;
        const profile = projectStructureProfileMap.get(project.projectName);
        return [
          `<strong>${project.projectName}</strong>`,
          `结构标签：${params.seriesName ?? profile?.structureLabel ?? '稳态项目'}`,
          `参与人数：${project.participantCount}`,
          `总工时：${formatNumber(project.totalHours)} h`,
          `主题复杂度：${project.topicDiversity}`,
          `人均投入：${formatNumber(project.averageHoursPerPerson)} h`,
          `趋势斜率：${formatNumber(project.trendSlope, 2)}`,
          `主导主题：${project.primaryTopic}`,
        ].join('<br/>');
      },
    },
    legend: { top: 0 },
    grid: { left: 42, right: 28, top: 48, bottom: 52, containLabel: true },
    xAxis: { type: 'value', name: '参与人数', scale: true },
    yAxis: { type: 'value', name: '总工时（h）', scale: true },
    series: Array.from(
      new Set(projectStructureProfiles.map((item) => item.structureLabel)),
    ).map((label) => ({
      name: label,
      type: 'scatter',
      clip: false,
      symbolSize: bubbleSymbolSize,
      data: sortedProjects
        .filter((project) => project.totalHours > 0)
        .filter((project) => projectStructureProfileMap.get(project.projectName)?.structureLabel === label)
        .map((project) => [
          project.participantCount,
          Number(project.totalHours.toFixed(1)),
          project.topicDiversity,
          project.projectName,
        ]),
      itemStyle: {
        color: projectStructureLabelColor(label),
        opacity: 0.84,
      },
    })),
  };

  const catalogHeroHeight = (() => {
    if (catalogChartMode === 'bubble') {
      return 560;
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
    bubble: {
      title: '全部项目气泡图',
      subtitle: '参与人数、总工时和主题复杂度的全量分布',
      note: '每个气泡代表一个项目。横轴看参与人数，纵轴看总工时，气泡大小表示主题复杂度，颜色表示项目结构标签。',
      option: allProjectsBubbleOption,
      source: 'derived' as const,
      onChartClick: (params: { value?: unknown }) =>
        openProjectDetail(String((params.value as Array<string | number> | undefined)?.[3] ?? '')),
    },
    trend: {
      title: '全部项目趋势斜率',
      subtitle: '按趋势斜率从高到低展开全部项目',
      note: '',
      option: allTrendOption,
      source: 'derived' as const,
      onChartClick: (params: { name?: string }) => openProjectDetail(String(params.name ?? '')),
    },
  }[catalogChartMode];

  return (
    <div className="page-grid">
      <section className="panel panel-wide project-view-toolbar sticky">
        <div className="project-view-toolbar-inner">
          <div className="project-view-toolbar-actions">
            <div
              className="focus-tabs project-view-page-switch"
              role="tablist"
              aria-label="项目页视图切换"
            >
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
            {pageMode === 'charts' ? (
              <div
                className="mini-segment project-view-scope-switch"
                role="tablist"
                aria-label="项目图表范围筛选"
              >
                {[
                  ['top', `TOP ${chartScopeSize}`],
                  ['mid', '腰部'],
                  ['tail', '中长尾'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={chartScope === value}
                    className={`mini-segment-button ${chartScope === value ? 'active' : ''}`.trim()}
                    onClick={() => setChartScope(value as 'top' | 'mid' | 'tail')}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : (
              renderCatalogActions()
            )}
          </div>
        </div>
      </section>

      {pageMode === 'charts' ? (
        <>
      <Panel
        title="项目洞察"
        subtitle="先看当前范围，再点开项目纵览"
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
        <div className="insight-grid">
          <div className="insight-card">
            <strong>当前投入最高</strong>
            <p>
              {topProject
                ? `${topProject.projectName} 是当前${chartScopeLabel}里投入最高的项目，总工时 ${formatNumber(topProject.totalHours)}h。`
                : '当前没有可解释的项目样本。'}
            </p>
          </div>
          <div className="insight-card">
            <strong>变化最快</strong>
            <p>
              {steepestProject
                ? `${steepestProject.projectName} 在当前${chartScopeLabel}里趋势斜率最高，为 ${formatNumber(steepestProject.trendSlope, 1)}。`
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
        title="项目投入规模"
        subtitle="固定看总工时"
        note={`这张图只看总量，避免把“小时、斜率、百分比”混在一张图里。当前范围：${chartScopeLabel}。`}
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
        note={`这张图只看当前${chartScopeLabel}里的增长差异。当前变化最快的是 ${steepestProject?.projectName ?? '暂无'}。`}
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
        note={`${fixHeavyProjects[0] ? `${fixHeavyProjects[0].projectName} 在当前${chartScopeLabel}里返工压力最值得优先复盘。` : '这张图回答：当前范围里哪些项目承受较高的返工和反馈处理压力。'}`}
        option={reworkRankOption}
        source="derived"
        method="按返工类工时占比排序"
        reliability="中"
        caution="返工高说明修补压力大，建议结合总工时和任务类型结构一起看"
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
        note={`这张图跟随当前 ${chartScopeLabel} 视图。按${trendLabel}聚合，适合看这一层项目里谁在抬升、谁在回落。`}
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
        note={`当前查看 ${chartScopeLabel}。用同一套页面范围筛选同步看整体分布，避免每张图各自切换。`}
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

      <ChartPanel
        title="项目返工四象限"
        subtitle="总工时高且返工占比高的项目更值得优先复盘"
        note={`${fixHeavyProjects[0] ? `${fixHeavyProjects[0].projectName} 在当前${chartScopeLabel}里最接近“高投入、高返工”的模式。` : '纵轴越高，说明修改、bug、调整、客户反馈类工时占比越高。'} 当前查看 ${chartScopeLabel}。`}
        option={quadrantOption}
        source="derived"
        method="总工时 + 返工类关键词占比 + 项目参与人数"
        reliability="中"
        caution="返工类识别来自任务文本规则，适合快速发现线索"
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
