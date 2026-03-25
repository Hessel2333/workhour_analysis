import { useState } from 'react';
import { ChartPanel } from '../components/ChartPanel';
import { MetaPill } from '../components/MetaPill';
import { Panel } from '../components/Panel';
import { TrendGranularitySwitch } from '../components/TrendGranularitySwitch';
import { analysisConfig } from '../config/analysisConfig';
import { topicColor } from '../lib/chartColors';
import { formatNumber, formatPercent } from '../lib/format';
import { getEmployeeRiskMetric, getFirefightingMetric, getFocusScoreMetric } from '../lib/metrics';
import { isReworkTask } from '../lib/taskSignals';
import {
  buildGranularityLabels,
  fillGroupedSeries,
  granularityBucketLabel,
  groupSeriesByGranularity,
  trendGranularityLabel,
  type TrendGranularity,
} from '../lib/timeSeries';
import type { AnalyticsView, DetailSelection, Filters } from '../types';

interface EmployeesPageProps {
  view: AnalyticsView;
  filters: Filters;
  onOpenDetail: (detail: DetailSelection) => void;
}

function bubbleSizeByAnomalyDays(days: number) {
  if (days >= 8) return 44;
  if (days >= 4) return 32;
  return 22;
}

function quantile(values: number[], ratio: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * ratio;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function buildBoxplotStats(values: number[]) {
  if (!values.length) {
    return {
      min: 0,
      q1: 0,
      median: 0,
      q3: 0,
      max: 0,
      outliers: [] as number[],
    };
  }

  const sorted = [...values].sort((left, right) => left - right);
  const q1 = quantile(sorted, 0.25);
  const median = quantile(sorted, 0.5);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const lowerFence = q1 - iqr * 1.5;
  const upperFence = q3 + iqr * 1.5;
  const inRange = sorted.filter((value) => value >= lowerFence && value <= upperFence);
  const outliers = sorted.filter((value) => value < lowerFence || value > upperFence);

  return {
    min: inRange[0] ?? sorted[0],
    q1,
    median,
    q3,
    max: inRange[inRange.length - 1] ?? sorted[sorted.length - 1],
    outliers,
  };
}

function longestConsecutive(values: boolean[]) {
  let longest = 0;
  let current = 0;
  values.forEach((value) => {
    if (value) {
      current += 1;
      longest = Math.max(longest, current);
      return;
    }
    current = 0;
  });
  return longest;
}

export function EmployeesPage({ view, filters, onOpenDetail }: EmployeesPageProps) {
  const [monthTrendGranularity, setMonthTrendGranularity] = useState<'day' | 'week'>('day');
  const [loadCalendarMode, setLoadCalendarMode] = useState<'hours' | 'risk' | 'anomaly'>('hours');
  const trendGranularity: TrendGranularity =
    filters.periodMode === 'month' ? monthTrendGranularity : 'month';
  const trendLabel = trendGranularityLabel(trendGranularity);
  const canSwitchTrendGranularity = filters.periodMode === 'month';
  const trendLabels = buildGranularityLabels(
    view.uniqueDates[0] ?? '',
    view.uniqueDates[view.uniqueDates.length - 1] ?? '',
    trendGranularity,
  );
  const topRiskEmployees = [...view.employeeStats]
    .sort(
      (left, right) =>
        getEmployeeRiskMetric(right).value - getEmployeeRiskMetric(left).value,
    )
    .slice(0, analysisConfig.displayLimits.employeeRank);
  const topSwitchEmployees = [...view.employeeStats]
    .sort((left, right) => {
      const leftScore = left.multiProjectRate * 100 + left.projectCount * 4 + left.totalHours / 40;
      const rightScore = right.multiProjectRate * 100 + right.projectCount * 4 + right.totalHours / 40;
      return rightScore - leftScore;
    })
    .slice(0, analysisConfig.displayLimits.employeeRank);
  const topHoursEmployees = [...view.employeeStats].slice(0, analysisConfig.displayLimits.employeeRank);
  const focusedEmployees = [...view.employeeStats]
    .sort((left, right) => right.focusScore - left.focusScore)
    .slice(0, analysisConfig.displayLimits.employeeRank);
  const trendGranularityActions = canSwitchTrendGranularity ? (
    <TrendGranularitySwitch
      value={monthTrendGranularity}
      onChange={setMonthTrendGranularity}
      ariaLabel="员工趋势聚合粒度"
    />
  ) : undefined;
  const topMonthlyEmployees = [...view.employeeStats].slice(0, analysisConfig.displayLimits.employeeTrendEmployees);
  const topHeatmapEmployees = [...view.employeeStats].slice(0, analysisConfig.displayLimits.employeeHeatmapEmployees);
  const topHeatmapProjects = [...view.projectStats]
    .slice(0, analysisConfig.displayLimits.employeeHeatmapProjects)
    .map((item) => item.projectName);
  const bucketTitle =
    trendGranularity === 'day' ? '日期' : trendGranularity === 'week' ? '周次' : '月份';
  const topLoadEmployees = [...view.employeeStats]
    .sort(
      (left, right) =>
        getEmployeeRiskMetric(right).value - getEmployeeRiskMetric(left).value,
    )
    .slice(0, analysisConfig.displayLimits.employeeHeatmapEmployees);
  const employeeFireStats = view.employeeStats.map((employee) => {
    const tasks = view.tasks.filter((task) => task.employeeId === employee.employeeId);
    const totalHours = tasks.reduce((sum, task) => sum + task.reportHour, 0);
    const reworkHours = tasks
      .filter((task) => isReworkTask(task))
      .reduce((sum, task) => sum + task.reportHour, 0);
    const supportHours = tasks
      .filter((task) => task.topicLabel === '现场支持')
      .reduce((sum, task) => sum + task.reportHour, 0);
    const fireMetric = getFirefightingMetric({
      totalHours,
      reworkHours,
      supportHours,
      multiProjectRate: employee.multiProjectRate,
      anomalyDayCount: employee.anomalyDayCount,
    });
    return {
      ...employee,
      reworkHours,
      reworkShare: fireMetric.reworkShare,
      supportHours,
      supportShare: fireMetric.supportShare,
      fireScore: fireMetric.value,
    };
  });
  const topFireEmployees = [...employeeFireStats]
    .sort((left, right) => right.fireScore - left.fireScore)
    .slice(0, analysisConfig.displayLimits.employeeRank);

  const riskScatterOption = {
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

  const hoursBarOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 24, right: 20, top: 24, bottom: 40, containLabel: true },
    xAxis: { type: 'value', name: '总工时（h）' },
    yAxis: { type: 'category', data: topHoursEmployees.map((item) => item.name) },
    series: [
      {
        type: 'bar',
        data: topHoursEmployees.map((item) => item.totalHours),
        itemStyle: { color: '#0a84ff', borderRadius: 10 },
      },
    ],
  };

  const focusBarOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 24, right: 20, top: 24, bottom: 40, containLabel: true },
    xAxis: { type: 'value', name: '聚焦度', max: 100, axisLabel: { formatter: '{value}%' } },
    yAxis: { type: 'category', data: focusedEmployees.map((item) => item.name) },
    series: [
      {
        type: 'bar',
        data: focusedEmployees.map((item) => Number((item.focusScore * 100).toFixed(1))),
        itemStyle: { color: '#34c759', borderRadius: 10 },
      },
    ],
  };

  const workTypeOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { top: 0 },
    grid: { left: 24, right: 20, top: 48, bottom: 40, containLabel: true },
    xAxis: { type: 'value', name: '工时占比', max: 100, axisLabel: { formatter: '{value}%' } },
    yAxis: { type: 'category', data: topRiskEmployees.map((item) => item.name) },
    series: ['开发', '维护', '现场支持', '会议'].map((topic, index) => ({
      name: topic,
      type: 'bar',
      stack: 'topicShare',
      data: topRiskEmployees.map((employee) => {
        const tasks = view.tasks.filter((task) => task.employeeId === employee.employeeId);
        const total = tasks.reduce((sum, task) => sum + task.reportHour, 0);
        if (!total) return 0;
        const hours = tasks
          .filter((task) => task.topicLabel === topic)
          .reduce((sum, task) => sum + task.reportHour, 0);
        return Number(((hours / total) * 100).toFixed(1));
      }),
      itemStyle: {
        color: topicColor(topic, index),
        borderRadius: 8,
      },
    })),
  };

  const employeeTrendOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { top: 0 },
    grid: { left: 24, right: 20, top: 48, bottom: 40, containLabel: true },
    xAxis: { type: 'category', data: trendLabels },
    yAxis: { type: 'value', name: '工时' },
    series: topMonthlyEmployees.map((employee, index) => ({
      name: employee.name,
      type: 'bar',
      stack: 'employeeHours',
      data: fillGroupedSeries(
        trendLabels,
        groupSeriesByGranularity(
          view.employeeDays
            .filter((day) => day.employeeId === employee.employeeId)
            .map((day) => ({ date: day.date, value: day.reportHour })),
          trendGranularity,
        ),
      ).map((item) => item.value),
      itemStyle: { borderRadius: 6, color: ['#2563eb', '#0ea5e9', '#14b8a6', '#22c55e', '#f59e0b', '#8b5cf6'][index] },
    })),
  };

  const monthlySwitchMeta = new Map<
    string,
    { distinctProjects: number; totalHours: number; averageProjectCount: number }
  >();
  topSwitchEmployees.forEach((employee) => {
    trendLabels.forEach((bucketLabel) => {
      const bucketTasks = view.tasks.filter(
        (task) =>
          task.employeeId === employee.employeeId &&
          granularityBucketLabel(task.date, trendGranularity) === bucketLabel,
      );
      const bucketDays = view.employeeDays.filter(
        (day) =>
          day.employeeId === employee.employeeId &&
          granularityBucketLabel(day.date, trendGranularity) === bucketLabel,
      );
      monthlySwitchMeta.set(`${employee.employeeId}:${bucketLabel}`, {
        distinctProjects: new Set(bucketTasks.map((task) => task.projectName)).size,
        totalHours: bucketTasks.reduce((sum, task) => sum + task.reportHour, 0),
        averageProjectCount:
          bucketDays.length > 0
            ? bucketDays.reduce((sum, day) => sum + day.projectCount, 0) / bucketDays.length
            : 0,
      });
    });
  });

  const monthlySwitchData = topSwitchEmployees.flatMap((employee, employeeIndex) =>
    trendLabels.map((bucketLabel, bucketIndex) => [
      bucketIndex,
      employeeIndex,
      monthlySwitchMeta.get(`${employee.employeeId}:${bucketLabel}`)?.distinctProjects ?? 0,
    ]),
  );
  const monthlySwitchMax = Math.max(...monthlySwitchData.map((item) => Number(item[2])), 0);
  const monthlySwitchOption = {
    tooltip: {
      position: 'top',
      formatter: (params: { value?: Array<string | number> }) => {
        const value = params.value ?? [];
        const employee = topSwitchEmployees[Number(value[1] ?? 0)];
        const bucketLabel = trendLabels[Number(value[0] ?? 0)] ?? '';
        const meta = monthlySwitchMeta.get(`${employee?.employeeId ?? ''}:${bucketLabel}`);
        return [
          `<strong>${employee?.name ?? ''}</strong>`,
          `${bucketTitle}：${bucketLabel}`,
          `参与项目数：${meta?.distinctProjects ?? 0}`,
          `${trendLabel}总工时：${formatNumber(meta?.totalHours ?? 0)} h`,
          `日均项目数：${formatNumber(meta?.averageProjectCount ?? 0, 1)}`,
        ].join('<br/>');
      },
    },
    grid: { left: 60, right: 24, top: 24, bottom: 36, containLabel: true },
    xAxis: { type: 'category', data: trendLabels },
    yAxis: { type: 'category', data: topSwitchEmployees.map((item) => item.name) },
    visualMap: {
      min: 0,
      max: monthlySwitchMax || 1,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      inRange: {
        color: ['#f8fafc', '#c7d2fe', '#818cf8', '#4338ca'],
      },
    },
    series: [
      {
        type: 'heatmap',
        data: monthlySwitchData,
        label: {
          show: true,
          formatter: (params: { value?: Array<string | number> }) =>
            Number(params.value?.[2] ?? 0) > 0 ? String(params.value?.[2] ?? 0) : '',
          color: '#0f172a',
          fontSize: 11,
          fontWeight: 600,
        },
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(15,23,42,0.16)' } },
      },
    ],
  };

  const boxplotEmployees = [...view.employeeStats].slice(
    0,
    analysisConfig.displayLimits.employeeBoxplot,
  );
  const boxplotStats = boxplotEmployees.map((employee) => {
    const values = view.employeeDays
      .filter((day) => day.employeeId === employee.employeeId)
      .map((day) => day.reportHour);
    return buildBoxplotStats(values);
  });
  const boxplotValues = boxplotStats.map((item) => [
    item.min,
    item.q1,
    item.median,
    item.q3,
    item.max,
  ]);
  const boxplotOutliers = boxplotStats.flatMap((item, employeeIndex) =>
    item.outliers.map((value) => [employeeIndex, value]),
  );
  const boxplotOption = {
    tooltip: {
      trigger: 'item',
      formatter: (params: {
        componentSubType?: string;
        name?: string;
        data?: number[];
        value?: number[];
        seriesName?: string;
        dataIndex?: number;
      }) => {
        if (params.componentSubType === 'scatter') {
          const value = params.value ?? [];
          const employee = boxplotEmployees[Number(value[0] ?? 0)];
          return [
            `<strong>${employee?.name ?? String(params.name ?? '')}</strong>`,
            `离群日工时：${formatNumber(Number(value[1] ?? 0))} h`,
            '说明：该值落在 1.5 IQR 之外，代表极端工作日。',
          ].join('<br/>');
        }

        const data = params.data ?? [];
        const employee = boxplotEmployees[params.dataIndex ?? -1];
        const stats = boxplotStats[params.dataIndex ?? -1];
        return [
          `<strong>${employee?.name ?? String(params.name ?? '')}</strong>`,
          `样本天数：${view.employeeDays.filter((day) => day.employeeId === employee?.employeeId).length}`,
          `须线最低：${formatNumber(Number(data[0] ?? 0))} h`,
          `Q1：${formatNumber(Number(data[1] ?? 0))} h`,
          `中位数：${formatNumber(Number(data[2] ?? 0))} h`,
          `Q3：${formatNumber(Number(data[3] ?? 0))} h`,
          `须线最高：${formatNumber(Number(data[4] ?? 0))} h`,
          `离群点：${stats?.outliers.length ?? 0} 个`,
        ].join('<br/>');
      },
    },
    grid: { left: 24, right: 20, top: 24, bottom: 40, containLabel: true },
    xAxis: {
      type: 'category',
      data: boxplotEmployees.map((item) => item.name),
      axisLabel: { rotate: 30 }, // 增加旋转系数
    },
    yAxis: { type: 'value', name: '日工时' },
    series: [
      {
        type: 'boxplot',
        data: boxplotValues,
        itemStyle: { color: '#93c5fd', borderColor: '#2563eb' },
      },
      {
        name: '离群点',
        type: 'scatter',
        data: boxplotOutliers,
        itemStyle: { color: '#ef4444' },
        symbolSize: 10,
      },
    ],
  };

  const heatmapData = topHeatmapEmployees.flatMap((employee, employeeIndex) =>
    topHeatmapProjects.map((projectName, projectIndex) => [
      projectIndex,
      employeeIndex,
      Number(
        view.tasks
          .filter(
            (task) =>
              task.employeeId === employee.employeeId && task.projectName === projectName,
          )
          .reduce((sum, task) => sum + task.reportHour, 0)
          .toFixed(1),
      ),
    ]),
  );
  const heatmapMax = Math.max(...heatmapData.map((item) => Number(item[2])), 0);
  const heatmapOption = {
    tooltip: {
      position: 'top',
      formatter: (params: { value?: Array<string | number> }) => {
        const value = params.value ?? [];
        const employee = topHeatmapEmployees[Number(value[1] ?? 0)];
        const project = topHeatmapProjects[Number(value[0] ?? 0)];
        const hours = Number(value[2] ?? 0);
        return [
          `<strong>${employee?.name ?? ''}</strong>`,
          `项目：${project ?? ''}`,
          `工时：${formatNumber(hours)} h`,
        ].join('<br/>');
      },
    },
    grid: { left: 64, right: 24, top: 24, bottom: 36, containLabel: true },
    xAxis: {
      type: 'category',
      data: topHeatmapProjects,
      axisLabel: { rotate: 30 }, // 增加旋转系数
    },
    yAxis: {
      type: 'category',
      data: topHeatmapEmployees.map((item) => item.name),
    },
    visualMap: {
      min: 0,
      max: heatmapMax || 1,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      inRange: {
        color: ['#eff6ff', '#93c5fd', '#2563eb'],
      },
    },
    series: [
      {
        type: 'heatmap',
        data: heatmapData,
        label: { show: false },
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(15,23,42,0.16)' } },
      },
    ],
  };

  const loadCalendarMeta = new Map<
    string,
    {
      totalHours: number;
      riskScore: number;
      anomalyCount: number;
      anomalyDayCount: number;
      taskCount: number;
      multiProjectRate: number;
      focusScore: number;
      activeDays: number;
    }
  >();
  topLoadEmployees.forEach((employee) => {
    trendLabels.forEach((bucketLabel) => {
      const bucketDays = view.employeeDays.filter(
        (day) =>
          day.employeeId === employee.employeeId &&
          granularityBucketLabel(day.date, trendGranularity) === bucketLabel,
      );
      const bucketTasks = view.tasks.filter(
        (task) =>
          task.employeeId === employee.employeeId &&
          granularityBucketLabel(task.date, trendGranularity) === bucketLabel,
      );
      const anomalyDayCount = bucketDays.filter((day) => day.isAnomalous).length;
      const totalHours = bucketDays.reduce((sum, day) => sum + day.reportHour, 0);
      const multiProjectRate = bucketDays.length
        ? bucketDays.filter((day) => day.projectCount > 1).length / bucketDays.length
        : 0;
      const focusScore = bucketTasks.length ? getFocusScoreMetric(bucketTasks).value : 0;
      const riskScore = getEmployeeRiskMetric({
        multiProjectRate,
        focusScore,
        anomalyDayCount,
        taskCount: bucketTasks.length,
      }).value;
      loadCalendarMeta.set(`${employee.employeeId}:${bucketLabel}`, {
        totalHours,
        riskScore,
        anomalyCount: bucketDays.reduce((sum, day) => sum + day.anomalyScore, 0),
        anomalyDayCount,
        taskCount: bucketTasks.length,
        multiProjectRate,
        focusScore,
        activeDays: bucketDays.length,
      });
    });
  });
  const loadCalendarValueByMode = (bucketLabel: string, employeeId: string) => {
    const meta = loadCalendarMeta.get(`${employeeId}:${bucketLabel}`);
    if (!meta) return 0;
    if (loadCalendarMode === 'risk') return Number(meta.riskScore.toFixed(1));
    if (loadCalendarMode === 'anomaly') return meta.anomalyCount;
    return Number(meta.totalHours.toFixed(1));
  };
  const loadCalendarData = topLoadEmployees.flatMap((employee, employeeIndex) =>
    trendLabels.map((bucketLabel, bucketIndex) => [
      bucketIndex,
      employeeIndex,
      loadCalendarValueByMode(bucketLabel, employee.employeeId),
    ]),
  );
  const loadCalendarMax = Math.max(...loadCalendarData.map((item) => Number(item[2])), 0);
  const loadCalendarColors =
    loadCalendarMode === 'risk'
      ? ['#fff7ed', '#fdba74', '#f97316', '#c2410c']
      : loadCalendarMode === 'anomaly'
        ? ['#ecfeff', '#67e8f9', '#06b6d4', '#155e75']
        : ['#eff6ff', '#93c5fd', '#2563eb', '#1d4ed8'];
  const loadCalendarUnit =
    loadCalendarMode === 'risk' ? '分' : loadCalendarMode === 'anomaly' ? '个' : 'h';
  const loadCalendarLabel =
    loadCalendarMode === 'risk' ? '风险分' : loadCalendarMode === 'anomaly' ? '异常数' : '总工时';
  const loadCalendarOption = {
    tooltip: {
      position: 'top',
      formatter: (params: { value?: Array<string | number> }) => {
        const value = params.value ?? [];
        const employee = topLoadEmployees[Number(value[1] ?? 0)];
        const currentBucketLabel = trendLabels[Number(value[0] ?? 0)] ?? '';
        const meta = loadCalendarMeta.get(`${employee?.employeeId ?? ''}:${currentBucketLabel}`);
        return [
          `<strong>${employee?.name ?? ''}</strong>`,
          `${bucketTitle}：${currentBucketLabel}`,
          `${loadCalendarLabel}：${formatNumber(Number(value[2] ?? 0))}${loadCalendarUnit === 'h' ? ' h' : loadCalendarUnit === '分' ? ' 分' : ' 个'}`,
          `活跃天数：${meta?.activeDays ?? 0} 天`,
          `异常员工日：${meta?.anomalyDayCount ?? 0} 天`,
          `多项目率：${formatPercent(meta?.multiProjectRate ?? 0)}`,
          `集中度：${formatPercent(meta?.focusScore ?? 0)}`,
          `任务数：${meta?.taskCount ?? 0}`,
        ].join('<br/>');
      },
    },
    grid: { left: 56, right: 24, top: 24, bottom: 36, containLabel: true },
    xAxis: {
      type: 'category',
      name: bucketTitle,
      data: trendLabels,
    },
    yAxis: {
      type: 'category',
      data: topLoadEmployees.map((item) => item.name),
    },
    visualMap: {
      min: 0,
      max: loadCalendarMax || 1,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      inRange: {
        color: loadCalendarColors,
      },
    },
    series: [
      {
        type: 'heatmap',
        data: loadCalendarData,
        label: {
          show: trendGranularity !== 'day',
          formatter: (params: { value?: Array<string | number> }) =>
            Number(params.value?.[2] ?? 0) > 0 ? formatNumber(Number(params.value?.[2] ?? 0)) : '',
          color: '#0f172a',
          fontSize: 11,
          fontWeight: 600,
        },
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(15,23,42,0.16)' } },
      },
    ],
  };
  const longestOverloadStreak = loadCalendarMode === 'hours' && trendGranularity === 'day'
    ? topLoadEmployees
        .map((employee) => ({
          employee,
          streak: longestConsecutive(
            trendLabels.map((bucketLabel) => {
              const meta = loadCalendarMeta.get(`${employee.employeeId}:${bucketLabel}`);
              return (meta?.totalHours ?? 0) >= analysisConfig.thresholds.standardDailyHours;
            }),
          ),
        }))
        .sort((left, right) => right.streak - left.streak)[0]
    : undefined;
  const loadCalendarNote =
    loadCalendarMode === 'risk'
      ? `颜色越深表示该员工在当前${trendLabel}里的综合风险分越高。当前默认展示风险最高的 ${topLoadEmployees.length} 位员工。`
      : loadCalendarMode === 'anomaly'
        ? `颜色越深表示异常信号叠加越多。优先留意持续出现深色块的员工，而不是只看单个高点。`
        : longestOverloadStreak && longestOverloadStreak.streak > 1
          ? `颜色越深表示当前${trendLabel}总工时越高。${longestOverloadStreak.employee.name} 已连续 ${longestOverloadStreak.streak} 个日期达到 ${formatNumber(
              analysisConfig.thresholds.standardDailyHours,
              1,
            )}h 以上，更适合优先复盘。`
          : `颜色越深表示当前${trendLabel}总工时越高。当前默认展示风险最高的 ${topLoadEmployees.length} 位员工。`;
  const loadCalendarActions = (
    <>
      {trendGranularityActions}
      <div className="mini-segment" aria-label="员工负载热图指标">
        {[
          ['hours', '总工时'],
          ['risk', '风险'],
          ['anomaly', '异常数'],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`mini-segment-button ${loadCalendarMode === value ? 'active' : ''}`.trim()}
            onClick={() => setLoadCalendarMode(value as 'hours' | 'risk' | 'anomaly')}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  );

  const summaryEmployee = topRiskEmployees[0];
  const fireEmployee = topFireEmployees[0];
  const firefightingOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: Array<{ name: string }>) => {
        const label = params[0]?.name ?? '';
        const employee = topFireEmployees.find((item) => item.name === label);
        if (!employee) return label;
        return [
          `<strong>${employee.name}</strong>`,
          `救火指数：${formatNumber(employee.fireScore, 1)}`,
          `返工类工时占比：${formatPercent(employee.reworkShare)}`,
          `现场支持占比：${formatPercent(employee.supportShare)}`,
          `多项目率：${formatPercent(employee.multiProjectRate)}`,
          `异常日：${employee.anomalyDayCount} 天`,
        ].join('<br/>');
      },
    },
    grid: { left: 24, right: 20, top: 24, bottom: 40, containLabel: true },
    xAxis: { type: 'value', name: '救火指数' },
    yAxis: { type: 'category', data: topFireEmployees.map((item) => item.name) },
    series: [
      {
        type: 'bar',
        data: topFireEmployees.map((item) => Number(item.fireScore.toFixed(1))),
        itemStyle: { color: '#f97316', borderRadius: 10 },
      },
    ],
  };

  return (
    <div className="page-grid">
      <Panel
        title="员工画像"
        subtitle="先看谁值得复盘，再点开个人详情"
        className="panel-wide panel-strip"
        meta={
          <div className="chart-meta">
            <MetaPill tone="derived">规则推导</MetaPill>
            <span>多项目率 = 多项目工作日 / 全部工作日</span>
            <span>集中度 = 单一项目最大工时占比</span>
            <span>异常日 = 高工时 / 高碎片 / 高切换叠加</span>
          </div>
        }
      >
        <div className="insight-grid">
          <div className="insight-card">
            <strong>优先复盘对象</strong>
            <p>
              {summaryEmployee
                ? `${summaryEmployee.name} 当前风险分最高，多项目率 ${formatPercent(summaryEmployee.multiProjectRate)}，异常日 ${summaryEmployee.anomalyDayCount} 天。`
                : '当前没有需要复盘的员工样本。'}
            </p>
          </div>
          <div className="insight-card">
            <strong>救火压力最高</strong>
            <p>
              {fireEmployee
                ? `${fireEmployee.name} 的返工类工时占比 ${formatPercent(fireEmployee.reworkShare)}，现场支持占比 ${formatPercent(fireEmployee.supportShare)}，更像在承担救火型任务。`
                : '当前没有明显的救火型员工样本。'}
            </p>
          </div>
          <div className="insight-card">
            <strong>如何使用</strong>
            <p>先看风险分布和救火指数定位员工，再点开个人详情看趋势、项目迁移和任务类型演进。</p>
          </div>
        </div>
      </Panel>

      <ChartPanel
        title="员工总工时趋势"
        subtitle={`按${trendLabel}看谁承担了更多投入`}
        note={`这张图适合看不同时间粒度下的主力投入分布。当前投入最高的是 ${topHoursEmployees[0]?.name ?? '暂无'}，当前按${trendLabel}聚合。`}
        option={employeeTrendOption}
        source="real"
        method={`按员工和${trendLabel}聚合总工时`}
        reliability="高"
        caution="适合看投入规模，不直接代表产出质量"
        badge={trendLabel}
        actions={trendGranularityActions}
      />

      <ChartPanel
        title="员工风险分布"
        subtitle="谁更可能存在切换负担和投入分散"
        note={`横轴越靠右表示多项目率越高，纵轴越低表示集中度越低。当前最值得先点开的是 ${summaryEmployee?.name ?? '暂无'}。`}
        option={riskScatterOption}
        source="derived"
        method="多项目率 + 集中度 + 异常员工日"
        reliability="中"
        caution="这是复盘优先级线索，不是绩效结论"
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
        title="投入规模"
        subtitle="谁承担了更多的工时投入"
        note={`这张图只看投入量。建议结合风险分布一起看，当前投入最高的是 ${topHoursEmployees[0]?.name ?? '暂无'}。`}
        option={hoursBarOption}
        source="real"
        method="按员工聚合总工时"
        reliability="高"
        caution="高工时不自动代表高效率或高价值"
        onChartClick={(params) => {
          const label = String(params.name ?? '');
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
        title="工作聚焦度"
        subtitle="谁更集中在少数重点项目"
        note={`集中度高表示当前投入更聚焦。当前最聚焦的是 ${focusedEmployees[0]?.name ?? '暂无'}。`}
        option={focusBarOption}
        source="derived"
        method="单一项目最大工时 / 总工时"
        reliability="中"
        caution="集中度高不一定更好，也可能意味着关键人依赖过强"
        onChartClick={(params) => {
          const label = String(params.name ?? '');
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
        title="高风险员工的工作结构"
        subtitle="风险更高的人，时间到底花在什么类型的工作上"
        note="这张图直接回答：风险来自开发主任务、维护返工，还是现场支持和沟通打断。"
        option={workTypeOption}
        source="derived"
        method="按员工聚合主题工时占比"
        reliability="中"
        caution="主题分类来自规则词典，复杂任务建议结合任务详情复核"
      />

      <ChartPanel
        title="员工负载日历热图"
        subtitle={`按${trendLabel}看谁处在连续高负载状态`}
        note={loadCalendarNote}
        option={loadCalendarOption}
        source="derived"
        method={`按员工和${trendLabel}聚合 ${loadCalendarLabel}`}
        reliability={loadCalendarMode === 'hours' ? '高' : '中'}
        caution="这张图更适合看连续性和节奏变化，不适合单独用于判断个人效率"
        badge={loadCalendarMode === 'hours' ? trendLabel : `${trendLabel}·${loadCalendarLabel}`}
        actions={loadCalendarActions}
        onChartClick={(params) => {
          const employee = topLoadEmployees[Number((params.value as Array<string | number>)?.[1] ?? -1)];
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
        title="员工项目切换热力图"
        subtitle={`按${trendLabel}看谁的项目参与最容易变化`}
        note={`颜色越深表示该员工当前${trendLabel}参与的项目越多。当前切换更频繁的通常集中在 ${topSwitchEmployees[0]?.name ?? '暂无'} 等人。`}
        option={monthlySwitchOption}
        source="derived"
        method={`按员工和${trendLabel}统计参与的不同项目数`}
        reliability="中高"
        caution="项目数高不一定代表问题，需结合月总工时和任务类型一起判断"
        badge={trendLabel}
        actions={trendGranularityActions}
        onChartClick={(params) => {
          const employee = topSwitchEmployees[Number((params.value as Array<string | number>)?.[1] ?? -1)];
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
        title="救火型员工识别"
        subtitle="返工、支持和高切换叠加时，谁最像在持续救火"
        note={`当前救火压力最高的是 ${fireEmployee?.name ?? '暂无'}，更适合优先复盘其任务结构和项目迁移。`}
        option={firefightingOption}
        source="derived"
        method="返工类工时占比 + 现场支持占比 + 多项目率 + 异常日"
        reliability="中"
        caution="这是流程和负载信号，不是个人绩效结论"
        onChartClick={(params) => {
          const label = String(params.name ?? '');
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
        title="员工工时箱线图"
        subtitle="看团队内谁的日工时波动更大"
        note="箱体表示常见波动范围，须线按 1.5 IQR 计算，极端工作日会单独显示为红色离群点。"
        option={boxplotOption}
        source="derived"
        method="按员工统计日工时分布的四分位数、1.5 IQR 须线与离群点"
        reliability="中高"
        caution="样本少的员工箱线图会更不稳定"
      />

      <ChartPanel
        title="员工-项目工时热力图"
        subtitle="谁把时间主要投到了哪些项目"
        note="这张图适合定位：哪些员工长期深度投入某项目，哪些人分布更分散。"
        option={heatmapOption}
        source="real"
        method="按员工和项目聚合总工时"
        reliability="高"
        caution="当前仅展示头部员工和头部项目，长尾项目被省略"
      />
    </div>
  );
}
