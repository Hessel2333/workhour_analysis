import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import ReactECharts from 'echarts-for-react';
import { withChartTheme } from '../lib/chartTheme';
import { projectColor, topicColor } from '../lib/chartColors';
import { formatNumber, formatPercent } from '../lib/format';
import { detectTaskStage, PROJECT_STAGE_ORDER } from '../lib/taskSignals';
import {
  buildGranularityLabels,
  fillGroupedSeries,
  groupSeriesByGranularity,
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

function chartShell(title: string, subtitle: string, option: Record<string, unknown>) {
  return (
    <section className="focus-chart-card">
      <div className="focus-chart-header">
        <p className="panel-kicker">{title}</p>
        <h4>{subtitle}</h4>
      </div>
      <ReactECharts option={withChartTheme(option)} style={{ height: 240 }} />
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
  const [activeTab, setActiveTab] = useState<FocusTab>('overview');
  const trendGranularity: TrendGranularity =
    filters.periodMode === 'month' ? 'day' : 'month';
  const globalTrendLabels = buildGranularityLabels(
    filters.startDate,
    filters.endDate,
    trendGranularity,
  );

  useEffect(() => {
    setActiveTab('overview');
  }, [detail?.kind, detail?.employeeId, detail?.projectName, detail?.date, detail?.taskId]);

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
        .slice(0, 6);
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
        ...projectNames.slice(0, 5).map((projectName) => ({
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
            .filter((item) => !projectNames.slice(0, 5).includes(item.projectName))
            .flatMap((item) => item.points)
            .filter((point) => point.label === label),
        ).reduce((sum, item) => sum + item.value, 0),
      }));
      if (groupedProjectSeries.length > 5) {
        projectEvolutionSeries.push({ name: '其他', points: otherProjectSeries });
      }
      const groupedTopicSeries = topicNames.slice(0, 5).map((topicLabel) => ({
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
                  !topicNames.slice(0, 5).includes(task.topicLabel) && task.date === date,
              )
              .reduce((sum, task) => sum + task.reportHour, 0),
          })),
          trendGranularity,
        ).find((item) => item.label === label)?.value ?? 0,
      }));
      if (topicNames.length > 5) {
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
        grid: { left: 24, right: 18, top: 24, bottom: 20, containLabel: true },
        xAxis: { type: 'category', data: trendLabels },
        yAxis: { type: 'value' },
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
        grid: { left: 24, right: 18, top: 50, bottom: 20, containLabel: true },
        xAxis: { type: 'category', data: trendLabels },
        yAxis: { type: 'value' },
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
        grid: { left: 24, right: 18, top: 24, bottom: 20, containLabel: true },
        xAxis: { type: 'value' },
        yAxis: { type: 'category', data: topicNames },
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
        grid: { left: 24, right: 18, top: 50, bottom: 20, containLabel: true },
        xAxis: { type: 'category', data: trendLabels },
        yAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } },
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
        grid: { left: 24, right: 18, top: 50, bottom: 20, containLabel: true },
        xAxis: { type: 'category', data: trendLabels },
        yAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } },
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
            {employeeStat.multiProjectRate > 0.34
              ? `${employeeName} 当前存在一定切换负担。`
              : `${employeeName} 当前切换负担相对可控。`}{' '}
            {employeeStat.focusScore < 0.58
              ? '投入分布偏散，建议结合项目构成继续看。'
              : '投入相对集中，可直接看趋势变化。'}
          </p>
          <div className="focus-chart-grid">
            {chartShell('工时趋势', '按日期观察个人投入变化', hoursTrendOption)}
            {chartShell('项目构成', '该员工在不同项目上的工时分布', projectStackOption)}
            {chartShell(
              '项目参与演进',
              trendGranularity === 'day' ? '按天看参与项目占比变化' : '按月看参与项目占比变化',
              projectEvolutionOption,
            )}
            {chartShell(
              '任务类型演进',
              trendGranularity === 'day' ? '按天看任务类型占比变化' : '按月看任务类型占比变化',
              topicEvolutionOption,
            )}
            {chartShell('任务主题', '当前主要工作类型构成', topicBarOption)}
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
            {employeeTasks.slice(0, 16).map((task) => (
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
        <>
          <FocusTabs
            labels={[
              { key: 'overview', label: '概览' },
              { key: 'tasks', label: '任务' },
            ]}
            activeTab={activeTab}
            onChange={setActiveTab}
          />
          <div className="focus-tab-panel">
            {activeTab === 'overview' ? overviewPanel : null}
            {activeTab === 'tasks' ? tasksPanel : null}
          </div>
        </>
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
      const groupedTrend = groupSeriesByGranularity(
        view.uniqueDates.map((date) => ({
          date,
          value: projectTasks
            .filter((task) => task.date === date)
            .reduce((sum, task) => sum + task.reportHour, 0),
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
      const groupedStageSeries = PROJECT_STAGE_ORDER.map((stageLabel) => ({
        stageLabel,
        points: groupSeriesByGranularity(
          view.uniqueDates.map((date) => ({
            date,
            value: projectTasks
              .filter(
                (task) =>
                  detectTaskStage(task) === stageLabel && task.date === date,
              )
              .reduce((sum, task) => sum + task.reportHour, 0),
          })),
          trendGranularity,
        ),
      }));
      const trendLabels = globalTrendLabels;
      const totalByLabel = new Map(
        trendLabels.map((label) => [
          label,
          groupedTopicSeries.reduce((sum, series) => {
            const matched = series.points.find((item) => item.label === label);
            return sum + (matched?.value ?? 0);
          }, 0),
        ]),
      );
      const totalStageByLabel = new Map(
        trendLabels.map((label) => [
          label,
          groupedStageSeries.reduce((sum, series) => {
            const matched = series.points.find((item) => item.label === label);
            return sum + (matched?.value ?? 0);
          }, 0),
        ]),
      );

      const trendOption = {
        tooltip: { trigger: 'axis' },
        grid: { left: 24, right: 18, top: 24, bottom: 20, containLabel: true },
        xAxis: { type: 'category', data: trendLabels },
        yAxis: { type: 'value' },
        series: [
          {
            type: 'line',
            smooth: true,
            color: '#2a9d8f',
            data: fillGroupedSeries(trendLabels, groupedTrend).map((item) => item.value),
          },
        ],
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
                  const hours = Number(item.value ?? 0);
                  const share = total ? ((hours / total) * 100).toFixed(1) : '0.0';
                  return `${item.seriesName}：${formatNumber(hours)} h (${share}%)`;
                }),
            ].join('<br/>');
          },
        },
        legend: { top: 0 },
        grid: { left: 24, right: 18, top: 50, bottom: 20, containLabel: true },
        xAxis: { type: 'category', data: trendLabels },
        yAxis: {
          type: 'value',
          name: '类型占比',
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

      const stageEvolutionOption = {
        tooltip: {
          trigger: 'axis',
          formatter: (
            params: Array<{ axisValue: string; seriesName: string; value: number }>,
          ) => {
            const axisValue = String(params[0]?.axisValue ?? '');
            return [
              `<strong>${axisValue}</strong>`,
              ...params
                .filter((item) => Number(item.value ?? 0) > 0)
                .map((item) => {
                  const total = totalStageByLabel.get(axisValue) ?? 0;
                  const hours = total * (Number(item.value ?? 0) / 100);
                  return `${item.seriesName}：${formatNumber(hours)} h (${formatNumber(Number(item.value ?? 0), 1)}%)`;
                }),
            ].join('<br/>');
          },
        },
        legend: { top: 0 },
        grid: { left: 24, right: 18, top: 50, bottom: 20, containLabel: true },
        xAxis: { type: 'category', data: trendLabels },
        yAxis: {
          type: 'value',
          name: '阶段占比',
          max: 100,
          axisLabel: { formatter: '{value}%' },
        },
        series: PROJECT_STAGE_ORDER.map((stageLabel, index) => ({
          name: stageLabel,
          type: 'line',
          stack: 'stageShare',
          smooth: true,
          symbol: 'none',
          areaStyle: { opacity: 0.86 },
          lineStyle: { width: 0.8 },
          emphasis: { focus: 'series' },
          data: fillGroupedSeries(
            trendLabels,
            groupedStageSeries.find((item) => item.stageLabel === stageLabel)?.points ?? [],
          ).map((point) => {
            const total = totalStageByLabel.get(point.label) ?? 0;
            return total ? Number(((point.value / total) * 100).toFixed(1)) : 0;
          }),
          color: ['#8b5cf6', '#2563eb', '#10b981', '#f59e0b', '#ef4444', '#94a3b8'][index],
        })),
      };

      const participantBarOption = {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: 24, right: 18, top: 24, bottom: 20, containLabel: true },
        xAxis: { type: 'value' },
        yAxis: { type: 'category', data: participants.map((item) => item.name) },
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
        grid: { left: 24, right: 18, top: 24, bottom: 20, containLabel: true },
        xAxis: { type: 'value' },
        yAxis: { type: 'category', data: topicNames },
        series: [
          {
            type: 'bar',
            data: topicNames.map((topicLabel) =>
              projectTasks
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
            {chartShell('项目趋势', '按日期观察项目投入变化', trendOption)}
            {chartShell('人员构成', '项目内各成员投入分布', participantBarOption)}
            {chartShell(
              '任务类型演进',
              trendGranularity === 'day' ? '按天看任务类型占比变化' : '按月看任务类型占比变化',
              topicEvolutionOption,
            )}
            {chartShell(
              '阶段演进',
              trendGranularity === 'day' ? '按天看项目所处阶段变化' : '按月看项目所处阶段变化',
              stageEvolutionOption,
            )}
            {chartShell('任务主题', '项目当前主要工作类型', topicBarOption)}
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
            {projectTasks.slice(0, 16).map((task) => (
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
        <>
          <FocusTabs
            labels={[
              { key: 'overview', label: '概览' },
              { key: 'tasks', label: '任务' },
            ]}
            activeTab={activeTab}
            onChange={setActiveTab}
          />
          <div className="focus-tab-panel">
            {activeTab === 'overview' ? overviewPanel : null}
            {activeTab === 'tasks' ? tasksPanel : null}
          </div>
        </>
      );
    }

    if (detail.kind === 'date' && detail.date) {
      const dayRows = view.employeeDays.filter((day) => day.date === detail.date);
      const dayTasks = view.tasks.filter((task) => task.date === detail.date);
      const projectNames = Array.from(new Set(dayTasks.map((task) => task.projectName)));
      const topicNames = Array.from(new Set(dayTasks.map((task) => task.topicLabel)));

      const employeeBarOption = {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: 24, right: 18, top: 24, bottom: 20, containLabel: true },
        xAxis: { type: 'value' },
        yAxis: {
          type: 'category',
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
        grid: { left: 24, right: 18, top: 24, bottom: 20, containLabel: true },
        xAxis: { type: 'value' },
        yAxis: { type: 'category', data: projectNames },
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
            {chartShell('员工负载', '当天每位成员投入情况', employeeBarOption)}
            {chartShell('项目分布', '当天工时流向了哪些项目', projectBarOption)}
            {chartShell('主题构成', '当天任务类型占比', topicPieOption)}
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
            {dayTasks.slice(0, 16).map((task) => (
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
        <>
          <FocusTabs
            labels={[
              { key: 'overview', label: '概览' },
              { key: 'tasks', label: '任务' },
            ]}
            activeTab={activeTab}
            onChange={setActiveTab}
          />
          <div className="focus-tab-panel">
            {activeTab === 'overview' ? overviewPanel : null}
            {activeTab === 'tasks' ? tasksPanel : null}
          </div>
        </>
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
          <div className="focus-chart-grid">
            {chartShell('项目趋势', '该任务所在项目的近期投入', {
              tooltip: { trigger: 'axis' },
              grid: { left: 24, right: 18, top: 24, bottom: 20, containLabel: true },
              xAxis: { type: 'category', data: globalTrendLabels },
              yAxis: { type: 'value' },
              series: [{ type: 'line', smooth: true, color: '#2a9d8f', data: fillGroupedSeries(globalTrendLabels, projectTrend).map((item) => item.value) }],
            })}
            {chartShell('个人趋势', '责任人的近期任务投入', {
              tooltip: { trigger: 'axis' },
              grid: { left: 24, right: 18, top: 24, bottom: 20, containLabel: true },
              xAxis: { type: 'category', data: globalTrendLabels },
              yAxis: { type: 'value' },
              series: [{ type: 'line', smooth: true, color: '#0a84ff', data: fillGroupedSeries(globalTrendLabels, employeeTrend).map((item) => item.value) }],
            })}
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
            {[task, ...relatedTasks].slice(0, 16).map((item) => (
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
        <>
          <FocusTabs
            labels={[
              { key: 'overview', label: '概览' },
              { key: 'tasks', label: '关联任务' },
            ]}
            activeTab={activeTab}
            onChange={setActiveTab}
          />
          <div className="focus-tab-panel">
            {activeTab === 'overview' ? overviewPanel : null}
            {activeTab === 'tasks' ? tasksPanel : null}
          </div>
        </>
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
        >
          <motion.aside
            className="detail-drawer"
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.24 }}
          >
            <div className="detail-header">
              <div className="detail-header-spacer" />
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
