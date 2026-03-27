import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import ReactECharts from 'echarts-for-react';
import { analysisConfig } from '../config/analysisConfig';
import { useDarkMode } from '../hooks/useDarkMode';
import { useViewport } from '../hooks/useViewport';
import { withChartTheme } from '../lib/chartTheme';
import { projectColor, topicColor } from '../lib/chartColors';
import { TrendGranularitySwitch } from './TrendGranularitySwitch';
import { formatNumber, formatPercent } from '../lib/format';
import { buildTopicExplanation } from '../lib/topicExplain';
import { buildOvertimeHistogram, buildOvertimeRecords } from '../lib/overtime';
import {
  buildGranularityLabels,
  fillGroupedSeries,
  groupSeriesByGranularity,
  trendGranularityLabel,
  type TrendGranularity,
} from '../lib/timeSeries';
import type { AnalyticsView, DetailSelection, Filters } from '../types';

interface DetailDrawerProps {
  detail: DetailSelection | null;
  view: AnalyticsView;
  filters: Filters;
  onClose: () => void;
}

type FocusTab = 'overview' | 'tasks';

function MiniMetric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="focus-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}

function FocusChartShell({
  title,
  option,
  isDark,
  isCompact,
  isPhone,
  actions,
  legend,
}: {
  title: string;
  option: Record<string, unknown>;
  isDark: boolean;
  isCompact: boolean;
  isPhone: boolean;
  actions?: ReactNode;
  legend?: ReactNode;
}) {
  const [touchActive, setTouchActive] = useState(false);
  const chartHeight = isPhone
    ? 272
    : isCompact
      ? 280
      : 272;

  return (
    <section
      className={`focus-chart-card ${isCompact ? 'touch-ready' : ''} ${touchActive ? 'touch-active' : ''}`.trim()}
      onPointerDown={() => setTouchActive(true)}
      onPointerUp={() => setTouchActive(false)}
      onPointerLeave={() => setTouchActive(false)}
      onPointerCancel={() => setTouchActive(false)}
    >
      <div className="focus-chart-header">
        <div className="focus-chart-toolbar">
          <p className="panel-kicker">{title}</p>
          {actions}
        </div>
        {legend ? <div className="focus-chart-legend">{legend}</div> : null}
        {isCompact ? <span className="focus-touch-hint">轻触图表查看数据</span> : null}
      </div>
      <ReactECharts
        option={withChartTheme(option, isDark, isCompact)}
        style={{ height: chartHeight }}
        notMerge
      />
    </section>
  );
}

function FocusTabs({
  labels,
  activeTab,
  onChange,
}: {
  labels: Array<{ key: FocusTab; label: string }>;
  activeTab: FocusTab;
  onChange: (tab: FocusTab) => void;
}) {
  return (
    <div className="focus-tabs" role="tablist">
      {labels.map((item) => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={activeTab === item.key}
          className={`focus-tab ${activeTab === item.key ? 'active' : ''}`.trim()}
          onClick={() => onChange(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function FocusIntro({
  label,
  title,
  summary,
}: {
  label: string;
  title: string;
  summary?: string;
}) {
  return (
    <div className="focus-intro">
      <span className="focus-intro-label">{label}</span>
      <h3>{title}</h3>
      {summary ? <p className="focus-intro-summary">{summary}</p> : null}
    </div>
  );
}

export function DetailDrawer({
  detail,
  view,
  filters,
  onClose,
}: DetailDrawerProps) {
  const isDark = useDarkMode();
  const { isCompact, isPhone } = useViewport();
  const [activeTab, setActiveTab] = useState<FocusTab>('overview');
  const [monthTrendGranularity, setMonthTrendGranularity] = useState<'day' | 'week'>('day');
  const [projectTopicViewMode, setProjectTopicViewMode] = useState<'share' | 'hours'>('share');
  const trendGranularity: TrendGranularity =
    filters.periodMode === 'month' ? monthTrendGranularity : 'month';
  const trendLabel = trendGranularityLabel(trendGranularity);
  const canSwitchTrendGranularity = filters.periodMode === 'month';
  const globalTrendLabels = buildGranularityLabels(
    filters.startDate,
    filters.endDate,
    trendGranularity,
  );
  const trendGranularityActions = canSwitchTrendGranularity ? (
    <TrendGranularitySwitch
      value={monthTrendGranularity}
      onChange={setMonthTrendGranularity}
      ariaLabel="详情趋势聚合粒度"
    />
  ) : undefined;

  useEffect(() => {
    setActiveTab('overview');
    setProjectTopicViewMode('share');
  }, [detail?.kind, detail?.employeeId, detail?.projectName, detail?.date, detail?.taskId]);

  const headerTabs =
    detail?.kind === 'employee' || detail?.kind === 'project' || detail?.kind === 'date'
      ? [
          { key: 'overview' as const, label: '概览' },
          { key: 'tasks' as const, label: '任务' },
        ]
      : detail?.kind === 'task'
        ? [
            { key: 'overview' as const, label: '概览' },
            { key: 'tasks' as const, label: '关联任务' },
          ]
        : null;

  const renderContent = () => {
    if (!detail) return null;

    if (detail.kind === 'employee' && detail.employeeId) {
      const employeeStat = view.employeeStats.find(
        (item) => item.employeeId === detail.employeeId,
      );
      if (!employeeStat) return null;

      const employeeDays = view.employeeDays.filter(
        (day) => day.employeeId === detail.employeeId,
      );
      const employeeTasks = view.tasks.filter((task) => task.employeeId === detail.employeeId);
      const employeeOvertimeRecords = buildOvertimeRecords(employeeDays, filters.overtimeMode).filter(
        (record) => record.overtimeHours > 0,
      );
      const employeeOvertimeHistogram = buildOvertimeHistogram(employeeOvertimeRecords);
      const employeeOvertimeTotal = employeeOvertimeRecords.reduce(
        (sum, record) => sum + record.overtimeHours,
        0,
      );
      const employeeOvertimeDayCount = employeeOvertimeRecords.length;
      const dominantEmployeeOvertimeBin = [...employeeOvertimeHistogram].sort(
        (left, right) => right.total - left.total,
      )[0];
      const employeeName = employeeStat.name;
      const projectNames = Array.from(
        new Set(employeeTasks.map((task) => task.projectName)),
      )
        .map((projectName) => ({
          projectName,
          hours: employeeTasks
            .filter((task) => task.projectName === projectName)
            .reduce((sum, task) => sum + task.reportHour, 0),
        }))
        .sort((left, right) => right.hours - left.hours)
        .map((item) => item.projectName)
        .slice(0, analysisConfig.displayLimits.detailFocusProjects);
      const topicNames = Array.from(new Set(employeeTasks.map((task) => task.topicLabel)))
        .map((topicLabel) => ({
          topicLabel,
          hours: employeeTasks
            .filter((task) => task.topicLabel === topicLabel)
            .reduce((sum, task) => sum + task.reportHour, 0),
        }))
        .sort((left, right) => right.hours - left.hours)
        .map((item) => item.topicLabel);
      const groupedHours = groupSeriesByGranularity(
        view.uniqueDates.map((date) => ({
          date,
          value: employeeDays.find((day) => day.date === date)?.reportHour ?? 0,
        })),
        trendGranularity,
      );
      const groupedProjectSeries = projectNames.map((projectName) => ({
        projectName,
        points: groupSeriesByGranularity(
          view.uniqueDates.map((date) => ({
            date,
            value: employeeTasks
              .filter((task) => task.projectName === projectName && task.date === date)
              .reduce((sum, task) => sum + task.reportHour, 0),
          })),
          trendGranularity,
        ),
      }));
      const trendLabels = globalTrendLabels;
      const projectEvolutionSeries = [
        ...projectNames.slice(0, analysisConfig.displayLimits.detailFocusSeries).map((projectName) => ({
          name: projectName,
          points: fillGroupedSeries(
            trendLabels,
            groupedProjectSeries.find((item) => item.projectName === projectName)?.points ?? [],
          ),
        })),
      ];
      const otherProjectSeries = trendLabels.map((label) => ({
        label,
        value: fillGroupedSeries(
          trendLabels,
          groupedProjectSeries
            .filter(
              (item) =>
                !projectNames
                  .slice(0, analysisConfig.displayLimits.detailFocusSeries)
                  .includes(item.projectName),
            )
            .flatMap((item) => item.points)
            .filter((point) => point.label === label),
        ).reduce((sum, item) => sum + item.value, 0),
      }));
      if (groupedProjectSeries.length > analysisConfig.displayLimits.detailFocusSeries) {
        projectEvolutionSeries.push({ name: '其他', points: otherProjectSeries });
      }
      const groupedTopicSeries = topicNames
        .slice(0, analysisConfig.displayLimits.detailFocusSeries)
        .map((topicLabel) => ({
        name: topicLabel,
        points: fillGroupedSeries(
          trendLabels,
          groupSeriesByGranularity(
            view.uniqueDates.map((date) => ({
              date,
              value: employeeTasks
                .filter((task) => task.topicLabel === topicLabel && task.date === date)
                .reduce((sum, task) => sum + task.reportHour, 0),
            })),
            trendGranularity,
          ),
        ),
      }));
      const otherTopicSeries = trendLabels.map((label) => ({
        label,
        value: groupSeriesByGranularity(
          view.uniqueDates.map((date) => ({
            date,
            value: employeeTasks
              .filter(
                (task) =>
                  !topicNames
                    .slice(0, analysisConfig.displayLimits.detailFocusSeries)
                    .includes(task.topicLabel) && task.date === date,
              )
              .reduce((sum, task) => sum + task.reportHour, 0),
          })),
          trendGranularity,
        ).find((item) => item.label === label)?.value ?? 0,
      }));
      if (topicNames.length > analysisConfig.displayLimits.detailFocusSeries) {
        groupedTopicSeries.push({ name: '其他', points: otherTopicSeries });
      }
      const totalProjectHoursByLabel = new Map(
        trendLabels.map((label) => [
          label,
          projectEvolutionSeries.reduce((sum, series) => {
            const point = series.points.find((item) => item.label === label);
            return sum + (point?.value ?? 0);
          }, 0),
        ]),
      );
      const totalTopicHoursByLabel = new Map(
        trendLabels.map((label) => [
          label,
          groupedTopicSeries.reduce((sum, series) => {
            const point = series.points.find((item) => item.label === label);
            return sum + (point?.value ?? 0);
          }, 0),
        ]),
      );

      const hoursTrendOption = {
        tooltip: { trigger: 'axis' },
        grid: { left: 24, right: 18, top: 24, bottom: 40, containLabel: true },
        xAxis: { type: 'category', data: trendLabels },
        yAxis: { type: 'value', name: '工时' },
        series: [
          {
            type: 'line',
            smooth: true,
            color: '#0a84ff',
            data: fillGroupedSeries(trendLabels, groupedHours).map((item) => item.value),
          },
        ],
      };

      const projectStackOption = {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: { top: 0 },
        grid: { left: 24, right: 18, top: 50, bottom: 40, containLabel: true },
        xAxis: { type: 'category', data: trendLabels },
        yAxis: { type: 'value', name: '工时' },
        series: projectNames.map((projectName, index) => ({
          name: projectName,
          type: 'bar',
          stack: 'projects',
          data: fillGroupedSeries(
            trendLabels,
            groupedProjectSeries.find((item) => item.projectName === projectName)?.points ?? [],
          ).map((item) => item.value),
          color: projectColor(index),
        })),
      };

      const topicBarOption = {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: 24, right: 18, top: 24, bottom: 40, containLabel: true },
        xAxis: { type: 'value', name: '工时' },
        yAxis: { type: 'category', inverse: true, data: topicNames },
        series: [
          {
            type: 'bar',
            data: topicNames.map((topicLabel) =>
              employeeTasks
                .filter((task) => task.topicLabel === topicLabel)
                .reduce((sum, task) => sum + task.reportHour, 0),
            ),
            itemStyle: {
              borderRadius: 10,
              color: (params: { dataIndex: number }) =>
                topicColor(topicNames[params.dataIndex] ?? '', params.dataIndex),
            },
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
        grid: { left: 24, right: 18, top: 50, bottom: 40, containLabel: true },
        xAxis: { type: 'category', data: employeeOvertimeHistogram.map((item) => item.label) },
        yAxis: { type: 'value', name: '加班员工日' },
        series: [
          {
            name: '工作日加班',
            type: 'bar',
            stack: 'overtime-count',
            data: employeeOvertimeHistogram.map((item) => item.workday),
            color: '#1f6fff',
          },
          {
            name: '周末加班',
            type: 'bar',
            stack: 'overtime-count',
            data: employeeOvertimeHistogram.map((item) => item.weekend),
            color: '#ff9f0a',
          },
          {
            name: '法定假日加班',
            type: 'bar',
            stack: 'overtime-count',
            data: employeeOvertimeHistogram.map((item) => item.holiday),
            color: '#ff375f',
          },
        ],
      };

      const projectEvolutionOption = {
        tooltip: {
          trigger: 'axis',
          formatter: (
            params: Array<{ axisValue: string; seriesName: string; value: number }>,
          ) => {
            const total = params.reduce((sum, item) => sum + Number(item.value ?? 0), 0);
            return [
              `<strong>${params[0]?.axisValue ?? ''}</strong>`,
              ...params
                .filter((item) => Number(item.value ?? 0) > 0)
                .map((item) => {
                  const hours = (totalProjectHoursByLabel.get(String(params[0]?.axisValue ?? '')) ?? 0) *
                    (Number(item.value ?? 0) / 100);
                  return `${item.seriesName}：${formatNumber(hours)} h (${formatNumber(Number(item.value ?? 0), 1)}%)`;
                }),
            ].join('<br/>');
          },
        },
        legend: { top: 0 },
        grid: { left: 24, right: 18, top: 50, bottom: 40, containLabel: true },
        xAxis: { type: 'category', data: trendLabels },
        yAxis: { type: 'value', name: '项目占比', max: 100, axisLabel: { formatter: '{value}%' } },
        series: projectEvolutionSeries.map((series, index) => ({
          name: series.name,
          type: 'line',
          stack: 'projectShare',
          smooth: true,
          symbol: 'none',
          areaStyle: { opacity: 0.86 },
          lineStyle: { width: 0.8 },
          emphasis: { focus: 'series' },
          data: series.points.map((point) => {
            const total = totalProjectHoursByLabel.get(point.label) ?? 0;
            return total ? Number(((point.value / total) * 100).toFixed(1)) : 0;
          }),
          color: projectColor(index),
        })),
      };

      const topicEvolutionOption = {
        tooltip: {
          trigger: 'axis',
          formatter: (
            params: Array<{ axisValue: string; seriesName: string; value: number }>,
          ) => {
            const total = params.reduce((sum, item) => sum + Number(item.value ?? 0), 0);
            return [
              `<strong>${params[0]?.axisValue ?? ''}</strong>`,
              ...params
                .filter((item) => Number(item.value ?? 0) > 0)
                .map((item) => {
                  const hours = (totalTopicHoursByLabel.get(String(params[0]?.axisValue ?? '')) ?? 0) *
                    (Number(item.value ?? 0) / 100);
                  return `${item.seriesName}：${formatNumber(hours)} h (${formatNumber(Number(item.value ?? 0), 1)}%)`;
                }),
            ].join('<br/>');
          },
        },
        legend: { top: 0 },
        grid: { left: 24, right: 18, top: 50, bottom: 40, containLabel: true },
        xAxis: { type: 'category', data: trendLabels },
        yAxis: { type: 'value', name: '主题占比', max: 100, axisLabel: { formatter: '{value}%' } },
        series: groupedTopicSeries.map((series, index) => ({
          name: series.name,
          type: 'line',
          stack: 'topicShare',
          smooth: true,
          symbol: 'none',
          areaStyle: { opacity: 0.86 },
          lineStyle: { width: 0.8 },
          emphasis: { focus: 'series' },
          data: series.points.map((point) => {
            const total = totalTopicHoursByLabel.get(point.label) ?? 0;
            return total ? Number(((point.value / total) * 100).toFixed(1)) : 0;
          }),
          color: topicColor(series.name, index),
        })),
      };

      const overviewPanel = (
        <>
          <FocusIntro
            label="员工聚焦分析"
            title={employeeName}
            summary="查看该员工在当前筛选范围内的工时变化、项目分布和任务构成。"
          />
          <div className="focus-stat-strip">
            <MiniMetric label="总工时" value={`${formatNumber(employeeStat.totalHours)} h`} hint="当前筛选范围" />
            <MiniMetric label="日均工时" value={`${formatNumber(employeeStat.averageDailyHours)} h`} hint="每个工作日平均" />
            <MiniMetric label="多项目率" value={formatPercent(employeeStat.multiProjectRate)} hint="多项目工作日占比" />
            <MiniMetric label="集中度" value={formatPercent(employeeStat.focusScore)} hint="单一项目最大工时占比" />
          </div>
          <p className="focus-brief">
            {employeeStat.multiProjectRate > analysisConfig.thresholds.highMultiProjectRate
              ? `${employeeName} 当前存在一定切换负担。`
              : `${employeeName} 当前切换负担相对可控。`}{' '}
            {employeeStat.focusScore < analysisConfig.thresholds.lowFocusScore
              ? '投入分布偏散，建议结合项目构成继续看。'
              : '投入相对集中，可直接看趋势变化。'}{' '}
            {employeeOvertimeDayCount
              ? `当前累计加班 ${formatNumber(employeeOvertimeTotal)}h，最常见区间是 ${dominantEmployeeOvertimeBin?.label ?? '暂无'}。`
              : '当前范围内没有记录到加班。'}
          </p>
          <div className="focus-chart-grid">
            <FocusChartShell
              title="工时趋势"
              option={hoursTrendOption}
              isDark={isDark}
              isCompact={isCompact}
              isPhone={isPhone}
              actions={trendGranularityActions}
            />
            <FocusChartShell title="项目构成" option={projectStackOption} isDark={isDark} isCompact={isCompact} isPhone={isPhone} />
            <FocusChartShell
              title="加班分布"
              option={overtimeHistogramOption}
              isDark={isDark}
              isCompact={isCompact}
              isPhone={isPhone}
            />
            <FocusChartShell
              title="项目参与演进"
              option={projectEvolutionOption}
              isDark={isDark}
              isCompact={isCompact}
              isPhone={isPhone}
              actions={trendGranularityActions}
            />
            <FocusChartShell
              title="任务类型演进"
              option={topicEvolutionOption}
              isDark={isDark}
              isCompact={isCompact}
              isPhone={isPhone}
              actions={trendGranularityActions}
            />
            <FocusChartShell title="任务主题" option={topicBarOption} isDark={isDark} isCompact={isCompact} isPhone={isPhone} />
          </div>
        </>
      );

      const tasksPanel = (
        <section className="focus-table-card">
          <div className="focus-chart-header">
            <p className="panel-kicker">近期任务</p>
            <h4>该员工参与的任务明细</h4>
          </div>
          <div className="focus-list">
            {employeeTasks.slice(0, analysisConfig.displayLimits.detailTaskRows).map((task) => (
              <div
                className={`focus-list-row ${detail.highlightDate === task.date ? 'highlight' : ''}`.trim()}
                key={`${task.taskId}-${task.date}`}
              >
                <div>
                  <span>{task.date}</span>
                  <strong>{task.projectName}</strong>
                </div>
                <div>
                  <span>{task.topicLabel}</span>
                  <strong>{task.taskName}</strong>
                </div>
                <div>
                  <span>工时</span>
                  <strong>{formatNumber(task.reportHour)} h</strong>
                </div>
              </div>
            ))}
          </div>
        </section>
      );

      return (
        <div className="focus-tab-panel">
          {activeTab === 'overview' ? overviewPanel : null}
          {activeTab === 'tasks' ? tasksPanel : null}
        </div>
      );
    }

    if (detail.kind === 'project' && detail.projectName) {
      const projectStat = view.projectStats.find(
        (item) => item.projectName === detail.projectName,
      );
      if (!projectStat) return null;

      const projectTasks = view.tasks.filter((task) => task.projectName === detail.projectName);
      const participants = Array.from(
        new Set(projectTasks.map((task) => task.employeeId)),
      )
        .map((employeeId) => {
          const stat = view.employeeStats.find((item) => item.employeeId === employeeId);
          const name = stat ? stat.name : employeeId;
          const hours = projectTasks
            .filter((task) => task.employeeId === employeeId)
            .reduce((sum, task) => sum + task.reportHour, 0);
          return { name, hours };
        })
        .sort((left, right) => right.hours - left.hours);

      const topicNames = Array.from(new Set(projectTasks.map((task) => task.topicLabel)));
      const rankedTopicNames = topicNames
        .map((topicLabel) => ({
          topicLabel,
          hours: projectTasks
            .filter((task) => task.topicLabel === topicLabel)
            .reduce((sum, task) => sum + task.reportHour, 0),
        }))
        .sort((left, right) => right.hours - left.hours)
        .map((item) => item.topicLabel);
      const groupedTrend = groupSeriesByGranularity(
        view.uniqueDates.map((date) => ({
          date,
          value: projectTasks
            .filter((task) => task.date === date)
            .reduce((sum, task) => sum + task.reportHour, 0),
        })),
        trendGranularity,
      );
      const groupedTotalTrend = groupSeriesByGranularity(
        view.uniqueDates.map((date) => ({
          date,
          value: view.employeeDays
            .filter((day) => day.date === date)
            .reduce((sum, day) => sum + day.reportHour, 0),
        })),
        trendGranularity,
      );
      const groupedTopicSeries = topicNames.map((topicLabel) => ({
        topicLabel,
        points: groupSeriesByGranularity(
          view.uniqueDates.map((date) => ({
            date,
            value: projectTasks
              .filter((task) => task.topicLabel === topicLabel && task.date === date)
              .reduce((sum, task) => sum + task.reportHour, 0),
          })),
          trendGranularity,
        ),
      }));
      const trendLabels = globalTrendLabels;
      const projectTrendPoints = fillGroupedSeries(trendLabels, groupedTrend);
      const totalTrendPoints = fillGroupedSeries(trendLabels, groupedTotalTrend);
      const totalByLabel = new Map(
        trendLabels.map((label) => [
          label,
          groupedTopicSeries.reduce((sum, series) => {
            const matched = series.points.find((item) => item.label === label);
            return sum + (matched?.value ?? 0);
          }, 0),
        ]),
      );
      const trendOption = {
        tooltip: {
          trigger: 'axis',
          formatter: (
            params: Array<{
              axisValue: string;
              value: number;
              seriesName: string;
              marker?: string;
            }>,
          ) => {
            const axisValue = String(params[0]?.axisValue ?? '');
            const total =
              totalTrendPoints.find((item) => item.label === axisValue)?.value ?? 0;
            const hours =
              projectTrendPoints.find((item) => item.label === axisValue)?.value ?? 0;
            const share = total ? ((hours / total) * 100).toFixed(1) : '0.0';
            return [
              `<strong>${axisValue}</strong>`,
              ...params.map((item) => {
                const label = item.seriesName === '项目占比' ? `${formatNumber(Number(item.value ?? 0), 1)}%` : `${formatNumber(Number(item.value ?? 0))} h`;
                return `${item.marker ?? ''}${item.seriesName}：${label}`;
              }),
              `全局总工时：${formatNumber(total)} h`,
              `项目工时占比：${share}%`,
            ].join('<br/>');
          },
        },
        grid: { left: 24, right: 28, top: 28, bottom: 40, containLabel: true },
        xAxis: { type: 'category', data: trendLabels },
        yAxis: [
          { type: 'value' },
          {
            type: 'value',
            max: 100,
            axisLabel: { formatter: '{value}%' },
          },
        ],
        series: [
          {
            name: '项目工时',
            type: 'bar',
            color: '#2a9d8f',
            yAxisIndex: 0,
            barMaxWidth: isPhone ? 18 : 26,
            itemStyle: {
              borderRadius: [8, 8, 0, 0],
            },
            data: projectTrendPoints.map((item) => item.value),
          },
          {
            name: '项目占比',
            type: 'line',
            smooth: true,
            yAxisIndex: 1,
            color: '#f59e0b',
            lineStyle: { width: 2, type: 'dashed' },
            symbolSize: 7,
            data: projectTrendPoints.map((item, index) => {
              const total = totalTrendPoints[index]?.value ?? 0;
              return total ? Number(((item.value / total) * 100).toFixed(1)) : 0;
            }),
          },
        ],
      };
      const trendLegend = (
        <>
          {[
            ['项目工时', '#2a9d8f', 'bar'],
            ['项目占比', '#f59e0b', 'line'],
          ].map(([label, color, kind]) => (
            <span key={label} className="focus-chart-legend-item">
              <span
                className={`focus-chart-legend-swatch ${kind === 'line' ? 'line' : ''}`.trim()}
                style={{ ['--legend-color' as string]: color }}
              />
              <span>{label}</span>
            </span>
          ))}
        </>
      );

      const topicEvolutionOption = {
        tooltip: {
          trigger: 'axis',
          formatter: (
            params: Array<{ axisValue: string; seriesName: string; value: number }>,
          ) => {
            const total = params.reduce((sum, item) => sum + Number(item.value ?? 0), 0);
            return [
              `<strong>${params[0]?.axisValue ?? ''}</strong>`,
              ...params
                .filter((item) => Number(item.value ?? 0) > 0)
                .map((item) => {
                  const hours = Number(item.value ?? 0);
                  const share = total ? ((hours / total) * 100).toFixed(1) : '0.0';
                  return `${item.seriesName}：${formatNumber(hours)} h (${share}%)`;
                }),
            ].join('<br/>');
          },
        },
        grid: { left: 24, right: 18, top: 24, bottom: 40, containLabel: true },
        xAxis: { type: 'category', data: trendLabels },
        yAxis: {
          type: 'value',
          max: 100,
          axisLabel: { formatter: '{value}%' },
        },
        series: topicNames.map((topicLabel, index) => ({
          name: topicLabel,
          type: 'line',
          stack: 'topicShare',
          smooth: true,
          symbol: 'none',
          areaStyle: { opacity: 0.86 },
          lineStyle: { width: 0.8 },
          emphasis: { focus: 'series' },
          data: fillGroupedSeries(
            trendLabels,
            groupedTopicSeries.find((item) => item.topicLabel === topicLabel)?.points ?? [],
          ).map((point) => {
            const total = totalByLabel.get(point.label) ?? 0;
            return total ? Number(((point.value / total) * 100).toFixed(1)) : 0;
          }),
          color: topicColor(topicLabel, index),
        })),
      };
      const topicHoursEvolutionOption = {
        tooltip: {
          trigger: 'axis',
          formatter: (
            params: Array<{ axisValue: string; seriesName: string; value: number }>,
          ) => {
            const total = params.reduce((sum, item) => sum + Number(item.value ?? 0), 0);
            return [
              `<strong>${params[0]?.axisValue ?? ''}</strong>`,
              ...params
                .filter((item) => Number(item.value ?? 0) > 0)
                .map((item) => {
                  const hours = Number(item.value ?? 0);
                  const share = total ? ((hours / total) * 100).toFixed(1) : '0.0';
                  return `${item.seriesName}：${formatNumber(hours)} h (${share}%)`;
                }),
            ].join('<br/>');
          },
        },
        grid: { left: 24, right: 18, top: 24, bottom: 40, containLabel: true },
        xAxis: { type: 'category', data: trendLabels },
        yAxis: {
          type: 'value',
        },
        series: topicNames.map((topicLabel, index) => ({
          name: topicLabel,
          type: 'line',
          stack: 'topicHours',
          smooth: true,
          symbol: 'none',
          areaStyle: { opacity: 0.2 },
          lineStyle: { width: 1.2 },
          emphasis: { focus: 'series' },
          data: fillGroupedSeries(
            trendLabels,
            groupedTopicSeries.find((item) => item.topicLabel === topicLabel)?.points ?? [],
          ).map((point) => point.value),
          color: topicColor(topicLabel, index),
        })),
      };
      const topicLegend = (
        <>
          {topicNames.map((topicLabel, index) => (
            <span key={topicLabel} className="focus-chart-legend-item">
              <span
                className="focus-chart-legend-swatch"
                style={{ ['--legend-color' as string]: topicColor(topicLabel, index) }}
              />
              <span>{topicLabel}</span>
            </span>
          ))}
        </>
      );

      const topicViewActions = (
        <>
          <div className="mini-segment" aria-label="任务类型演进显示方式">
            {[
              ['share', '占比'],
              ['hours', '工时'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`mini-segment-button ${projectTopicViewMode === value ? 'active' : ''}`.trim()}
                onClick={() => setProjectTopicViewMode(value as 'share' | 'hours')}
              >
                {label}
              </button>
            ))}
          </div>
          {trendGranularityActions}
        </>
      );

      const participantBarOption = {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: 24, right: 18, top: 24, bottom: 40, containLabel: true },
        xAxis: { type: 'value', name: '工时' },
        yAxis: { type: 'category', inverse: true, data: participants.map((item) => item.name) },
        series: [
          {
            type: 'bar',
            data: participants.map((item) => item.hours),
            itemStyle: { color: '#0a84ff', borderRadius: 10 },
          },
        ],
      };

      const topicBarOption = {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: 24, right: 18, top: 24, bottom: 40, containLabel: true },
        xAxis: { type: 'value', name: '工时' },
        yAxis: { type: 'category', inverse: true, data: rankedTopicNames },
        series: [
          {
            type: 'bar',
            data: rankedTopicNames.map((topicLabel) =>
              projectTasks
                .filter((task) => task.topicLabel === topicLabel)
                .reduce((sum, task) => sum + task.reportHour, 0),
            ),
            itemStyle: {
              borderRadius: 10,
              color: (params: { dataIndex: number }) =>
                topicColor(rankedTopicNames[params.dataIndex] ?? '', params.dataIndex),
            },
          },
        ],
      };

      const overviewPanel = (
        <>
          <FocusIntro
            label="项目聚焦分析"
            title={detail.projectName}
            summary="查看该项目的投入变化、参与人员和任务主题。"
          />
          <div className="focus-stat-strip">
            <MiniMetric label="总工时" value={`${formatNumber(projectStat.totalHours)} h`} hint="当前筛选范围" />
            <MiniMetric label="参与人数" value={`${projectStat.participantCount}`} hint="至少 1 条任务记录" />
            <MiniMetric label="人均投入" value={`${formatNumber(projectStat.averageHoursPerPerson)} h`} hint="总工时 / 参与人数" />
            <MiniMetric label="趋势斜率" value={formatNumber(projectStat.trendSlope, 2)} hint="近期投入方向" />
          </div>
          <p className="focus-brief">
            {projectStat.trendSlope > 0.8
              ? `${detail.projectName} 投入正在抬升。`
              : projectStat.trendSlope < -0.8
                ? `${detail.projectName} 投入近期回落。`
                : `${detail.projectName} 投入相对平稳。`}{' '}
            {projectStat.participantCount >= 4 && projectStat.averageHoursPerPerson <= 8
              ? '当前更值得关注多人浅介入。'
              : '当前参与面与人均投入基本匹配。'}
          </p>
          <div className="focus-chart-grid">
            <FocusChartShell
              title="项目趋势"
              option={trendOption}
              isDark={isDark}
              isCompact={isCompact}
              isPhone={isPhone}
              actions={trendGranularityActions}
              legend={trendLegend}
            />
            <FocusChartShell title="人员构成" option={participantBarOption} isDark={isDark} isCompact={isCompact} isPhone={isPhone} />
            <FocusChartShell
              title="任务类型演进"
              option={
                projectTopicViewMode === 'share'
                  ? topicEvolutionOption
                  : topicHoursEvolutionOption
              }
              isDark={isDark}
              isCompact={isCompact}
              isPhone={isPhone}
              actions={topicViewActions}
              legend={topicLegend}
            />
            <FocusChartShell title="任务主题" option={topicBarOption} isDark={isDark} isCompact={isCompact} isPhone={isPhone} />
          </div>
        </>
      );

      const tasksPanel = (
        <section className="focus-table-card">
          <div className="focus-chart-header">
            <p className="panel-kicker">近期任务</p>
            <h4>该项目的任务明细</h4>
          </div>
          <div className="focus-list">
            {projectTasks.slice(0, analysisConfig.displayLimits.detailTaskRows).map((task) => (
              <div className="focus-list-row" key={`${task.taskId}-${task.date}`}>
                <div>
                  <span>{task.date}</span>
                  <strong>
                    {task.employeeName}
                  </strong>
                </div>
                <div>
                  <span>{task.topicLabel}</span>
                  <strong>{task.taskName}</strong>
                </div>
                <div>
                  <span>工时</span>
                  <strong>{formatNumber(task.reportHour)} h</strong>
                </div>
              </div>
            ))}
          </div>
        </section>
      );

      return (
        <div className="focus-tab-panel">
          {activeTab === 'overview' ? overviewPanel : null}
          {activeTab === 'tasks' ? tasksPanel : null}
        </div>
      );
    }

    if (detail.kind === 'date' && detail.date) {
      const dayRows = [...view.employeeDays]
        .filter((day) => day.date === detail.date)
        .sort((left, right) => right.reportHour - left.reportHour);
      const dayTasks = view.tasks.filter((task) => task.date === detail.date);
      const projectNames = Array.from(new Set(dayTasks.map((task) => task.projectName)))
        .map((projectName) => ({
          projectName,
          hours: dayTasks
            .filter((task) => task.projectName === projectName)
            .reduce((sum, task) => sum + task.reportHour, 0),
        }))
        .sort((left, right) => right.hours - left.hours)
        .map((item) => item.projectName);
      const topicNames = Array.from(new Set(dayTasks.map((task) => task.topicLabel)));

      const employeeBarOption = {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: 24, right: 18, top: 24, bottom: 40, containLabel: true },
        xAxis: { type: 'value', name: '工时' },
        yAxis: {
          type: 'category',
          inverse: true,
          data: dayRows.map((day) =>
            day.employeeName,
          ),
        },
        series: [
          {
            type: 'bar',
            data: dayRows.map((day) => day.reportHour),
            itemStyle: { color: '#0a84ff', borderRadius: 10 },
          },
        ],
      };

      const projectBarOption = {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: 24, right: 18, top: 24, bottom: 40, containLabel: true },
        xAxis: { type: 'value', name: '工时' },
        yAxis: { type: 'category', inverse: true, data: projectNames },
        series: [
          {
            type: 'bar',
            data: projectNames.map((projectName) =>
              dayTasks
                .filter((task) => task.projectName === projectName)
                .reduce((sum, task) => sum + task.reportHour, 0),
            ),
            itemStyle: { color: '#34c759', borderRadius: 10 },
          },
        ],
      };

      const topicPieOption = {
        tooltip: { trigger: 'item' },
        legend: { bottom: 0 },
        series: [
          {
            type: 'pie',
            radius: ['44%', '68%'],
            data: topicNames.map((topicLabel) => ({
              name: topicLabel,
              value: dayTasks
                .filter((task) => task.topicLabel === topicLabel)
                .reduce((sum, task) => sum + task.reportHour, 0),
              itemStyle: { color: topicColor(topicLabel) },
            })),
          },
        ],
      };

      const overviewPanel = (
        <>
          <FocusIntro
            label="日期聚焦分析"
            title={detail.date}
            summary="查看这一天的人员负载、项目流向和任务主题。"
          />
          <div className="focus-stat-strip">
            <MiniMetric label="总工时" value={`${formatNumber(dayRows.reduce((sum, day) => sum + day.reportHour, 0))} h`} hint="当天总投入" />
            <MiniMetric label="活跃员工" value={`${dayRows.length}`} hint="当天有记录的人数" />
            <MiniMetric label="项目数" value={`${projectNames.length}`} hint="当天涉及的项目" />
            <MiniMetric label="异常员工日" value={`${dayRows.filter((day) => day.isAnomalous).length}`} hint="当天命中的异常规则" />
          </div>
          <p className="focus-brief">这个日期视角适合识别异常高负载、多人切换和项目投入是否过于集中。</p>
          <div className="focus-chart-grid">
            <FocusChartShell title="员工负载" option={employeeBarOption} isDark={isDark} isCompact={isCompact} isPhone={isPhone} />
            <FocusChartShell title="项目分布" option={projectBarOption} isDark={isDark} isCompact={isCompact} isPhone={isPhone} />
            <FocusChartShell title="主题构成" option={topicPieOption} isDark={isDark} isCompact={isCompact} isPhone={isPhone} />
          </div>
        </>
      );

      const tasksPanel = (
        <section className="focus-table-card">
          <div className="focus-chart-header">
            <p className="panel-kicker">当日任务</p>
            <h4>该日期下的任务明细</h4>
          </div>
          <div className="focus-list">
            {dayTasks.slice(0, analysisConfig.displayLimits.detailTaskRows).map((task) => (
              <div className="focus-list-row" key={`${task.taskId}-${task.employeeId}`}>
                <div>
                  <span>
                    {task.employeeName}
                  </span>
                  <strong>{task.projectName}</strong>
                </div>
                <div>
                  <span>{task.topicLabel}</span>
                  <strong>{task.taskName}</strong>
                </div>
                <div>
                  <span>工时</span>
                  <strong>{formatNumber(task.reportHour)} h</strong>
                </div>
              </div>
            ))}
          </div>
        </section>
      );

      return (
        <div className="focus-tab-panel">
          {activeTab === 'overview' ? overviewPanel : null}
          {activeTab === 'tasks' ? tasksPanel : null}
        </div>
      );
    }

    if (detail.kind === 'task' && detail.taskId) {
      const task = view.tasks.find((item) => item.taskId === detail.taskId);
      if (!task) return null;

      const employeeTasks = view.tasks.filter((item) => item.employeeId === task.employeeId);
      const sameDayTasks = view.tasks.filter(
        (item) => item.employeeId === task.employeeId && item.date === task.date,
      );
      const relatedTasks = view.tasks.filter(
        (item) =>
          item.taskId !== task.taskId &&
          (item.projectName === task.projectName ||
            (item.employeeId === task.employeeId && item.date === task.date)),
      );
      const projectTrend = groupSeriesByGranularity(
        view.uniqueDates.map((date) => ({
          date,
          value: view.tasks
            .filter((item) => item.projectName === task.projectName && item.date === date)
            .reduce((sum, item) => sum + item.reportHour, 0),
        })),
        trendGranularity,
      );
      const employeeTrend = groupSeriesByGranularity(
        view.uniqueDates.map((date) => ({
          date,
          value: employeeTasks
            .filter((item) => item.date === date)
            .reduce((sum, item) => sum + item.reportHour, 0),
        })),
        trendGranularity,
      );
      const topicExplanation = buildTopicExplanation(task);

      const overviewPanel = (
        <>
          <FocusIntro
            label="任务聚焦分析"
            title={task.taskName}
            summary="查看单个任务的责任人、项目背景和相关任务上下文。"
          />
          <div className="focus-stat-strip">
            <MiniMetric label="任务工时" value={`${formatNumber(task.reportHour)} h`} hint="当前任务填报值" />
            <MiniMetric label="责任人" value={task.employeeName} hint="当前任务归属员工" />
            <MiniMetric label="所属项目" value={task.projectName} hint="任务所在项目" />
            <MiniMetric label="分类可信度" value={formatPercent(task.topicConfidence)} hint="规则分类置信度" />
          </div>
          <p className="focus-brief">
            该任务发生在 {task.date}，归类为“{task.topicLabel}”。同日该员工记录 {sameDayTasks.length} 项任务，
            当前可结合关联任务判断它是独立事项还是更大工作流的一部分。
          </p>
          <section className="focus-explanation-card">
            <div className="focus-explanation-header">
              <div>
                <span className="focus-intro-label">分类命中详情</span>
                <strong>{topicExplanation.ruleLabel}</strong>
              </div>
              <div className="focus-explanation-tags">
                <span className={`explain-tag ${topicExplanation.usedFallback ? 'warning' : 'derived'}`.trim()}>
                  {topicExplanation.usedFallback ? 'Fallback 兜底' : '规则词典'}
                </span>
                <span className="explain-tag neutral">
                  可信度 {formatPercent(topicExplanation.confidence)}
                </span>
              </div>
            </div>
            <p className="focus-explanation-summary">{topicExplanation.summary}</p>
            <div className="focus-explanation-grid">
              <div className="focus-explanation-row">
                <span>命中规则名</span>
                <strong>{topicExplanation.ruleName}</strong>
              </div>
              <div className="focus-explanation-row">
                <span>命中关键词</span>
                <strong>
                  {topicExplanation.matchedKeywords.length
                    ? topicExplanation.matchedKeywords.join(' / ')
                    : '当前无稳定关键词'}
                </strong>
              </div>
              <div className="focus-explanation-row wide">
                <span>解释说明</span>
                <strong>{topicExplanation.note}</strong>
              </div>
            </div>
          </section>
          <div className="focus-chart-grid">
            <FocusChartShell
              title="项目趋势"
              option={{
                tooltip: { trigger: 'axis' },
                grid: { left: 24, right: 18, top: 24, bottom: 40, containLabel: true },
                xAxis: { type: 'category', data: globalTrendLabels },
                yAxis: { type: 'value', name: '工时' },
                series: [
                  {
                    type: 'line',
                    smooth: true,
                    color: '#2a9d8f',
                    data: fillGroupedSeries(globalTrendLabels, projectTrend).map((item) => item.value),
                  },
                ],
              }}
              isDark={isDark}
              isCompact={isCompact}
              isPhone={isPhone}
              actions={trendGranularityActions}
            />
            <FocusChartShell
              title="个人趋势"
              option={{
                tooltip: { trigger: 'axis' },
                grid: { left: 24, right: 18, top: 24, bottom: 40, containLabel: true },
                xAxis: { type: 'category', data: globalTrendLabels },
                yAxis: { type: 'value', name: '工时' },
                series: [
                  {
                    type: 'line',
                    smooth: true,
                    color: '#0a84ff',
                    data: fillGroupedSeries(globalTrendLabels, employeeTrend).map((item) => item.value),
                  },
                ],
              }}
              isDark={isDark}
              isCompact={isCompact}
              isPhone={isPhone}
              actions={trendGranularityActions}
            />
          </div>
        </>
      );

      const tasksPanel = (
        <section className="focus-table-card">
          <div className="focus-chart-header">
            <p className="panel-kicker">关联任务</p>
            <h4>同日或同项目的相关任务</h4>
          </div>
          <div className="focus-list">
            {[task, ...relatedTasks]
              .slice(0, analysisConfig.displayLimits.detailTaskRows)
              .map((item) => (
              <div
                className={`focus-list-row ${item.taskId === task.taskId ? 'highlight' : ''}`.trim()}
                key={`${item.taskId}-${item.date}`}
              >
                <div>
                  <span>{item.date}</span>
                  <strong>{item.employeeName}</strong>
                </div>
                <div>
                  <span>{item.projectName} / {item.topicLabel}</span>
                  <strong>{item.taskName}</strong>
                </div>
                <div>
                  <span>工时</span>
                  <strong>{formatNumber(item.reportHour)} h</strong>
                </div>
              </div>
            ))}
          </div>
        </section>
      );

      return (
        <div className="focus-tab-panel">
          {activeTab === 'overview' ? overviewPanel : null}
          {activeTab === 'tasks' ? tasksPanel : null}
        </div>
      );
    }

    return (
      <>
        <FocusIntro label={detail.title} title={detail.subtitle} />
        <section className="focus-table-card">
          <div className="focus-list">
            {detail.rows.map((row, index) => (
              <div className="focus-list-row" key={`${detail.subtitle}-${index}`}>
                {Object.entries(row).map(([key, value]) => (
                  <div key={key}>
                    <span>{key}</span>
                    <strong>{String(value)}</strong>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      </>
    );
  };

  return (
    <AnimatePresence>
      {detail ? (
        <motion.div
          className="detail-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.aside
            className="detail-drawer"
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="detail-header">
              {headerTabs ? (
                <FocusTabs labels={headerTabs} activeTab={activeTab} onChange={setActiveTab} />
              ) : (
                <div className="detail-header-spacer" />
              )}
              <button className="ghost-button" onClick={onClose} type="button">
                关闭
              </button>
            </div>
            <div className="detail-content">{renderContent()}</div>
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
