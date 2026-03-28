import { useMemo, useState } from 'react';
import { ChartPanel } from '../components/ChartPanel';
import { MetaPill } from '../components/MetaPill';
import { Panel } from '../components/Panel';
import { TrendGranularitySwitch } from '../components/TrendGranularitySwitch';
import { analysisConfig } from '../config/analysisConfig';
import { topicColor } from '../lib/chartColors';
import { buildEmployeeUpSetData, buildEmployeeVolatilityData } from '../lib/employeeExploration';
import { formatNumber, formatPercent } from '../lib/format';
import { isCompanyWorkday } from '../lib/holidayCalendar';
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

function bubbleSizeByHeavyOvertimeDays(days: number) {
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

function standardDeviation(values: number[]) {
  if (values.length <= 1) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function gaussianKernel(value: number) {
  return Math.exp(-0.5 * value * value) / Math.sqrt(2 * Math.PI);
}

function buildViolinDensity(values: number[]) {
  if (!values.length) return [] as Array<[number, number]>;

  const sorted = [...values].sort((left, right) => left - right);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const range = max - min;
  const deviation = standardDeviation(sorted);
  const fallbackBandwidth = Math.max(range / 6, 0.35);
  const bandwidth =
    deviation > 0 ? Math.max(1.06 * deviation * sorted.length ** -0.2, 0.25) : fallbackBandwidth;

  if (range === 0) {
    const center = min;
    return [
      [Math.max(center - 0.25, 0), 0],
      [center, 1],
      [center + 0.25, 0],
    ];
  }

  const sampleCount = 36;
  const densities = Array.from({ length: sampleCount + 1 }, (_, index) => {
    const value = min + (range * index) / sampleCount;
    const density =
      sorted.reduce((sum, sample) => sum + gaussianKernel((value - sample) / bandwidth), 0) /
      (sorted.length * bandwidth);
    return [value, density] as [number, number];
  });
  const maxDensity = Math.max(...densities.map((item) => item[1]), 1);

  return densities.map(([value, density]) => [value, density / maxDensity] as [number, number]);
}

function buildViolinStats(values: number[]) {
  if (!values.length) {
    return {
      min: 0,
      q1: 0,
      median: 0,
      q3: 0,
      max: 0,
      sampleCount: 0,
      spread: 0,
      stdDev: 0,
      overtimeDays: 0,
      heavyOvertimeDays: 0,
      density: [] as Array<[number, number]>,
    };
  }

  const sorted = [...values].sort((left, right) => left - right);
  const q1 = quantile(sorted, 0.25);
  const median = quantile(sorted, 0.5);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const overtimeThreshold = analysisConfig.thresholds.standardDailyHours;
  const heavyOvertimeThreshold = analysisConfig.thresholds.highIntensityOvertimeHours;
  const overtimeDays = sorted.filter((value) => value > overtimeThreshold).length;
  const heavyOvertimeDays = sorted.filter((value) => value > heavyOvertimeThreshold).length;

  return {
    min: sorted[0],
    q1,
    median,
    q3,
    max: sorted[sorted.length - 1],
    sampleCount: sorted.length,
    spread: iqr,
    stdDev: standardDeviation(sorted),
    overtimeDays,
    heavyOvertimeDays,
    density: buildViolinDensity(sorted) as Array<[number, number]>,
  };
}

type ViolinStats = ReturnType<typeof buildViolinStats>;

interface ViolinSeriesDatum {
  value: [number];
  density: Array<[number, number]>;
  employeeName: string;
  stats: ViolinStats;
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
  const [volatilityMode, setVolatilityMode] = useState<'weekday' | 'all'>('weekday');
  const [selectedUpSetComboIndex, setSelectedUpSetComboIndex] = useState<number | null>(null);
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
  const employeesByTotalHours = [...view.employeeStats].sort(
    (left, right) => right.totalHours - left.totalHours,
  );
  const topHoursEmployees = employeesByTotalHours.slice(0, analysisConfig.displayLimits.employeeRank);
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
  const topMonthlyEmployees = employeesByTotalHours.slice(
    0,
    analysisConfig.displayLimits.employeeTrendEmployees,
  );
  const topHeatmapEmployees = employeesByTotalHours.slice(
    0,
    analysisConfig.displayLimits.employeeHeatmapEmployees,
  );
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
      heavyOvertimeDayCount: employee.heavyOvertimeDayCount,
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
  const volatilityModeData = useMemo(() => {
    const sourceDays =
      volatilityMode === 'weekday'
        ? view.employeeDays.filter((day) => isCompanyWorkday(day.date, filters.overtimeMode))
        : view.employeeDays;

    return buildEmployeeVolatilityData(sourceDays, volatilityMode === 'weekday' ? '平日' : '全量');
  }, [filters.overtimeMode, view.employeeDays, volatilityMode]);
  const employeeUpSetData = useMemo(
    () => buildEmployeeUpSetData(view.employeeStats, view.employeeDays),
    [view.employeeDays, view.employeeStats],
  );
  const selectedUpSetCombo =
    selectedUpSetComboIndex !== null
      ? employeeUpSetData.sortedCombinations[selectedUpSetComboIndex] ?? null
      : null;

  const riskScatterOption = {
    tooltip: {
      trigger: 'item',
      formatter: (params: { value?: Array<string | number> }) => {
        const value = params.value ?? [];
        const name = String(value[3] ?? '');
        const multiProjectRate = formatNumber(Number(value[0] ?? 0), 1);
        const focusScore = formatNumber(Number(value[1] ?? 0), 1);
        const heavyOvertimeDays = Number(value[2] ?? 0);
        return [
          `<strong>${name}</strong>`,
          `多项目率：${multiProjectRate}%`,
          `集中度：${focusScore}%`,
          `重度加班日：${heavyOvertimeDays} 天`,
        ].join('<br/>');
      },
    },
    xAxis: { type: 'value', name: '多项目率' },
    yAxis: { type: 'value', name: '集中度' },
    series: [
      {
        type: 'scatter',
        symbolSize: (value: number[]) => bubbleSizeByHeavyOvertimeDays(Number(value[2] ?? 0)),
        data: view.employeeStats.map((employee) => [
          Number((employee.multiProjectRate * 100).toFixed(1)),
          Number((employee.focusScore * 100).toFixed(1)),
          employee.heavyOvertimeDayCount,
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
    yAxis: { type: 'category', inverse: true, data: topHoursEmployees.map((item) => item.name) },
    series: [
      {
        type: 'bar',
        data: topHoursEmployees.map((item) => item.totalHours),
        itemStyle: { color: '#0a84ff', borderRadius: 10 },
      },
    ],
  };

  const workhourVolatilityOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: Array<{ name?: string; value?: number }>) => {
        const current = volatilityModeData.topItems.find(
          (item) => item.employeeName === params[0]?.name,
        );
        return [
          `<strong>${params[0]?.name ?? ''}</strong>`,
          `口径：${volatilityModeData.modeLabel}`,
          `工时波动率：${formatNumber((params[0]?.value ?? 0) * 100, 1)}%`,
          `日均工时：${formatNumber(current?.meanHours ?? 0, 1)} h`,
          `标准差：${formatNumber(current?.sdHours ?? 0, 1)} h`,
          `工作天数：${formatNumber(current?.daysWorked ?? 0)}`,
          `总工时：${formatNumber(current?.totalHours ?? 0, 1)} h`,
        ].join('<br/>');
      },
    },
    grid: { left: 88, right: 24, top: 24, bottom: 42, containLabel: true },
    xAxis: {
      type: 'value',
      name: '工时波动率（%）',
      axisLabel: {
        formatter: (value: number) => `${formatNumber(value * 100, 0)}%`,
      },
    },
    yAxis: {
      type: 'category',
      data: volatilityModeData.topItems
        .slice()
        .reverse()
        .map((item) => item.employeeName),
    },
    series: [
      {
        type: 'bar',
        data: volatilityModeData.topItems
          .slice()
          .reverse()
          .map((item) => item.coefficientOfVariation),
        itemStyle: {
          color: '#0f766e',
          borderRadius: 10,
        },
        label: {
          show: true,
          position: 'right',
          formatter: (params: { value?: number }) =>
            `${formatNumber((params.value ?? 0) * 100, 0)}%`,
          color: '#475569',
        },
      },
    ],
  };

  const employeeUpSetOption = useMemo(() => {
    const { featureDefs, thresholds, setCounts, sortedCombinations } = employeeUpSetData;

    if (!sortedCombinations.length) {
      return {
        grid: [],
        xAxis: [],
        yAxis: [],
        series: [],
      };
    }

    const comboLabels = sortedCombinations.map((_, index) => `交集 ${index + 1}`);
    const featureLabels = featureDefs.map((feature) => feature.label);
    const featureLabelByKey = new Map(featureDefs.map((feature) => [feature.key, feature.label]));

    const inactiveDots = sortedCombinations.flatMap((_, comboIndex) =>
      featureLabels.map((label) => ({
        value: [comboIndex, label],
        comboIndex,
      })),
    );
    const activeDots = sortedCombinations.flatMap((combo, comboIndex) =>
      combo.activeKeys.map((key) => {
        const feature = featureDefs.find((item) => item.key === key)!;
        return {
          value: [comboIndex, feature.label],
          comboIndex,
          itemStyle: { color: feature.color },
        };
      }),
    );
    const connectorData = sortedCombinations
      .map((combo, comboIndex) => {
        if (combo.activeKeys.length < 2) return null;
        const labels = combo.activeKeys
          .map((key) => featureLabelByKey.get(key))
          .filter(Boolean) as string[];
        return {
          comboIndex,
          coords: labels.map((label) => [comboIndex, label]),
        };
      })
      .filter(Boolean);

    return {
      tooltip: {
        trigger: 'item',
        formatter: (params: {
          seriesName?: string;
          data?: {
            value?: [number, string] | [number, number] | number;
            comboIndex?: number;
            featureKey?: string;
          };
          value?: number | [number, string] | [number, number];
        }) => {
          if (params.seriesName === '交集规模') {
            const comboIndex = Number(params.data?.comboIndex ?? -1);
            const combo = sortedCombinations[comboIndex];
            if (!combo) return '';
            return [
              `<strong>${comboLabels[comboIndex]}</strong>`,
              combo.activeKeys.length
                ? `特征：${combo.activeKeys
                    .map((key) => featureLabelByKey.get(key))
                    .join('、')}`
                : '特征：四项都未高于团队中位数',
              `员工数：${combo.count}`,
              `成员：${
                combo.members.length <= 6
                  ? combo.members.map((member) => member.employeeName).join('、')
                  : `${combo.members
                      .slice(0, 6)
                      .map((member) => member.employeeName)
                      .join('、')} 等 ${combo.members.length} 人`
              }`,
              '点击可查看完整名单与指标',
            ].join('<br/>');
          }

          if (params.seriesName === '特征规模') {
            const feature = featureDefs.find((item) => item.key === params.data?.featureKey);
            if (!feature) return '';
            const threshold = thresholds[feature.key];
            return [
              `<strong>${feature.label}</strong>`,
              `达到该特征的员工：${setCounts.get(feature.key) ?? 0}`,
              `${
                feature.key === 'verifyGapRate'
                  ? `阈值：>= ${formatNumber(threshold * 100, 1)}%`
                  : `阈值：>= ${formatNumber(threshold, 2)}${feature.key === 'averageDailyHours' ? ' h' : ''}`
              }`,
            ].join('<br/>');
          }

          const matrixValue = params.data?.value;
          const comboIndex = Array.isArray(matrixValue) ? Number(matrixValue[0]) : -1;
          const featureLabel = Array.isArray(matrixValue) ? String(matrixValue[1] ?? '') : '';
          const combo = sortedCombinations[comboIndex];
          const matrixFeature = featureDefs.find((feature) => feature.label === featureLabel);
          if (!combo) return '';
          return [
            `<strong>${featureLabel}</strong>`,
            `交集：${comboLabels[comboIndex]}`,
            matrixFeature && combo.activeKeys.includes(matrixFeature.key)
              ? '该交集包含此特征'
              : '该交集不包含此特征',
            `员工数：${combo.count}`,
            `成员：${combo.members.map((member) => member.employeeName).join('、')}`,
            '点击可查看完整名单与指标',
          ].join('<br/>');
        },
      },
      grid: [
        { left: 156, right: 20, top: 24, height: 150 },
        { left: 156, right: 20, top: 190, height: 120 },
        { left: 24, width: 108, top: 190, height: 120 },
      ],
      xAxis: [
        {
          type: 'category',
          gridIndex: 0,
          data: comboLabels,
          axisLabel: { show: false },
          axisTick: { show: false },
        },
        {
          type: 'category',
          gridIndex: 1,
          data: comboLabels,
          axisLabel: { show: false },
          axisTick: { show: false },
          axisLine: { show: false },
        },
        {
          type: 'value',
          gridIndex: 2,
          name: '人数',
          inverse: true,
          splitLine: { show: false },
        },
      ],
      yAxis: [
        {
          type: 'value',
          gridIndex: 0,
          name: '交集人数',
        },
        {
          type: 'category',
          gridIndex: 1,
          data: featureLabels,
          inverse: true,
          axisLabel: { show: false },
          axisTick: { show: false },
          axisLine: { show: false },
        },
        {
          type: 'category',
          gridIndex: 2,
          data: featureLabels,
          inverse: true,
          position: 'right',
          axisTick: { show: false },
          axisLine: { show: false },
          axisLabel: {
            color: '#334155',
            fontWeight: 600,
            margin: 16,
          },
        },
      ],
      series: [
        {
          name: '交集规模',
          type: 'bar',
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: sortedCombinations.map((combo, comboIndex) => ({
            value: combo.count,
            comboIndex,
            itemStyle: {
              color: '#8b5cf6',
              borderRadius: [8, 8, 0, 0],
            },
          })),
          label: {
            show: true,
            position: 'top',
            color: '#475569',
            formatter: (params: { value?: number }) => `${params.value ?? 0}`,
          },
        },
        {
          name: '连接线',
          type: 'lines',
          coordinateSystem: 'cartesian2d',
          xAxisIndex: 1,
          yAxisIndex: 1,
          silent: true,
          z: 2,
          data: connectorData,
          lineStyle: {
            color: 'rgba(124, 58, 237, 0.45)',
            width: 2,
          },
        },
        {
          name: '未命中特征',
          type: 'scatter',
          xAxisIndex: 1,
          yAxisIndex: 1,
          z: 1,
          data: inactiveDots,
          symbolSize: 10,
          itemStyle: {
            color: 'rgba(148, 163, 184, 0.28)',
          },
        },
        {
          name: '命中特征',
          type: 'scatter',
          xAxisIndex: 1,
          yAxisIndex: 1,
          z: 3,
          data: activeDots,
          symbolSize: 13,
        },
        {
          name: '特征规模',
          type: 'bar',
          xAxisIndex: 2,
          yAxisIndex: 2,
          data: featureDefs.map((feature) => ({
            value: setCounts.get(feature.key) ?? 0,
            featureKey: feature.key,
            itemStyle: {
              color: feature.color,
              borderRadius: [8, 0, 0, 8],
            },
          })),
          label: {
            show: true,
            position: 'left',
            color: '#475569',
            formatter: (params: { value?: number }) => `${params.value ?? 0}`,
          },
        },
      ],
    };
  }, [employeeUpSetData]);

  const focusBarOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 24, right: 20, top: 24, bottom: 40, containLabel: true },
    xAxis: { type: 'value', name: '聚焦度', max: 100, axisLabel: { formatter: '{value}%' } },
    yAxis: { type: 'category', inverse: true, data: focusedEmployees.map((item) => item.name) },
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
    yAxis: { type: 'category', inverse: true, data: topRiskEmployees.map((item) => item.name) },
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

  const employeeDayHourMap = view.employeeDays.reduce<Record<string, number[]>>((accumulator, day) => {
    if (!accumulator[day.employeeId]) {
      accumulator[day.employeeId] = [];
    }
    accumulator[day.employeeId].push(day.reportHour);
    return accumulator;
  }, {});
  const violinEmployees = [...view.employeeStats]
    .map((employee) => {
      const values = employeeDayHourMap[employee.employeeId] ?? [];
      return {
        ...employee,
        violinStats: buildViolinStats(values),
      };
    })
    .filter((employee) => employee.violinStats.sampleCount > 0)
    .sort(
      (left, right) =>
        right.violinStats.spread - left.violinStats.spread ||
        right.violinStats.stdDev - left.violinStats.stdDev ||
        right.totalHours - left.totalHours,
    )
    .slice(0, 5);
  const violinSeriesData: ViolinSeriesDatum[] = violinEmployees.map((employee, employeeIndex) => ({
    value: [employeeIndex],
    density: employee.violinStats.density as Array<[number, number]>,
    employeeName: employee.name,
    stats: employee.violinStats,
  }));
  const violinMedianData = violinEmployees.map((employee, employeeIndex) => [
    employeeIndex,
    employee.violinStats.median,
  ]);
  const violinOption = {
    tooltip: {
      trigger: 'item',
      formatter: (params: {
        seriesType?: string;
        name?: string;
        data?: number[] | ViolinSeriesDatum;
        value?: number[];
        seriesName?: string;
        dataIndex?: number;
      }) => {
        if (params.seriesName === '中位数') {
          const value = params.value ?? [];
          const employee = violinEmployees[Number(value[0] ?? 0)];
          const sampleCount = employee?.violinStats.sampleCount ?? 0;
          const overtimeDays = employee?.violinStats.overtimeDays ?? 0;
          return [
            `<strong>${employee?.name ?? String(params.name ?? '')}</strong>`,
            `中位数：${formatNumber(Number(value[1] ?? 0))} h`,
            `样本天数：${sampleCount}`,
            `加班日：${overtimeDays} 天${sampleCount ? `（${formatNumber((overtimeDays / sampleCount) * 100)}%）` : ''}`,
          ].join('<br/>');
        }

        const violinDatum = violinSeriesData[params.dataIndex ?? -1];
        const stats = violinDatum?.stats;
        const overtimeShare =
          stats && stats.sampleCount > 0
            ? `（${formatNumber((stats.overtimeDays / stats.sampleCount) * 100)}%）`
            : '';
        return [
          `<strong>${violinDatum?.employeeName ?? String(params.name ?? '')}</strong>`,
          `样本天数：${stats?.sampleCount ?? 0}`,
          `加班日：${stats?.overtimeDays ?? 0} 天${overtimeShare}`,
          `重度加班日：${stats?.heavyOvertimeDays ?? 0} 天（>${analysisConfig.thresholds.highIntensityOvertimeHours}h）`,
          `常见波动范围：${formatNumber(stats?.q1 ?? 0)} - ${formatNumber(stats?.q3 ?? 0)} h`,
          `中位数：${formatNumber(stats?.median ?? 0)} h`,
          `全样本范围：${formatNumber(stats?.min ?? 0)} - ${formatNumber(stats?.max ?? 0)} h`,
          `IQR：${formatNumber(stats?.spread ?? 0)} h`,
        ].join('<br/>');
      },
    },
    grid: { left: 24, right: 20, top: 24, bottom: 40, containLabel: true },
    xAxis: {
      type: 'category',
      data: violinEmployees.map((item) => item.name),
      axisLabel: { rotate: 28 },
    },
    yAxis: { type: 'value', name: '日工时' },
    series: [
      {
        name: '工时分布',
        type: 'custom',
        coordinateSystem: 'cartesian2d',
        data: violinSeriesData,
        renderItem: (
          params: { dataIndex: number; dataIndexInside: number },
          api: {
            value: (dimension: number) => number;
            coord: (value: [number, number]) => [number, number];
            size: (value: [number, number]) => [number, number];
          },
        ) => {
          const data = violinSeriesData[params.dataIndex];
          if (!data || data.density.length < 2) {
            return null;
          }
          const employeeIndex = Number(api.value(0));
          const categoryWidth = api.size([1, 0])[0] || 0;
          const maxHalfWidth = categoryWidth * 0.32;
          const leftPoints = data.density.map(([hour, density]) => {
            const [x, y] = api.coord([employeeIndex, hour]);
            return [x - maxHalfWidth * density, y];
          });
          const rightPoints = [...data.density].reverse().map(([hour, density]) => {
            const [x, y] = api.coord([employeeIndex, hour]);
            return [x + maxHalfWidth * density, y];
          });
          return {
            type: 'polygon',
            shape: { points: [...leftPoints, ...rightPoints] },
            style: {
              fill: 'rgba(14, 165, 233, 0.28)',
              stroke: '#0284c7',
              lineWidth: 2,
            },
          };
        },
      },
      {
        name: '中位数',
        type: 'scatter',
        data: violinMedianData,
        symbol: 'diamond',
        symbolSize: 12,
        itemStyle: { color: '#0f172a', borderColor: '#ffffff', borderWidth: 2 },
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
      heavyOvertimeDayCount: number;
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
      const heavyOvertimeDayCount = bucketDays.filter((day) => day.isHeavyOvertime).length;
      const totalHours = bucketDays.reduce((sum, day) => sum + day.reportHour, 0);
      const multiProjectRate = bucketDays.length
        ? bucketDays.filter((day) => day.projectCount > 1).length / bucketDays.length
        : 0;
      const focusScore = bucketTasks.length ? getFocusScoreMetric(bucketTasks).value : 0;
      const riskScore = getEmployeeRiskMetric({
        multiProjectRate,
        focusScore,
        heavyOvertimeDayCount,
        anomalyDayCount,
        taskCount: bucketTasks.length,
      }).value;
      loadCalendarMeta.set(`${employee.employeeId}:${bucketLabel}`, {
        totalHours,
        riskScore,
        anomalyCount: bucketDays.reduce((sum, day) => sum + day.anomalyScore, 0),
        anomalyDayCount,
        heavyOvertimeDayCount,
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
          `异常负载日：${meta?.anomalyDayCount ?? 0} 天`,
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
          `重度加班日：${employee.heavyOvertimeDayCount} 天`,
        ].join('<br/>');
      },
    },
    grid: { left: 24, right: 20, top: 24, bottom: 40, containLabel: true },
    xAxis: { type: 'value', name: '救火指数' },
    yAxis: { type: 'category', inverse: true, data: topFireEmployees.map((item) => item.name) },
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
            <span>{`重度加班日 = >${analysisConfig.thresholds.highIntensityOvertimeHours}h`}</span>
            <span>{`异常负载日 = ≥${analysisConfig.thresholds.anomalyDailyHours}h 且伴随碎片/切换/核验等复合信号`}</span>
          </div>
        }
      >
        <div className="insight-grid">
          <div className="insight-card">
            <strong>优先复盘对象</strong>
            <p>
              {summaryEmployee
                ? `${summaryEmployee.name} 当前风险分最高，多项目率 ${formatPercent(summaryEmployee.multiProjectRate)}，重度加班日 ${summaryEmployee.heavyOvertimeDayCount} 天。`
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
        method="多项目率 + 集中度 + 重度加班日 + 异常负载日"
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
        title="员工工时波动率排名"
        className="rlab-inline-header-panel"
        subtitle={`当前按${volatilityModeData.modeLabel}口径看谁的工时节奏最不稳定`}
        note="这里用单个员工的日工时均值与标准差计算工时波动率。全量会把周末、法定节假日和调休工作日一起算进去；平日口径会按项目里的公司工作日规则过滤，更适合看常规工作节奏。"
        option={workhourVolatilityOption}
        source="derived"
        method="前端计算：按员工聚合单日工时序列，计算标准差与变异系数"
        reliability="中高"
        caution={`当前“平日”会复用项目的公司工作日规则：法定节假日会排除，调休工作日会保留${filters.overtimeMode === 'bigSmallWeek' ? '，大小周上班周六也会保留' : ''}`}
        actions={
          <div className="mini-segment" aria-label="工时波动率口径切换">
            <button
              type="button"
              className={`mini-segment-button ${volatilityMode === 'weekday' ? 'active' : ''}`.trim()}
              onClick={() => setVolatilityMode('weekday')}
            >
              平日
            </button>
            <button
              type="button"
              className={`mini-segment-button ${volatilityMode === 'all' ? 'active' : ''}`.trim()}
              onClick={() => setVolatilityMode('all')}
            >
              全量
            </button>
          </div>
        }
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
        method={`返工类工时占比 + 现场支持占比 + 多项目率 + >${analysisConfig.thresholds.highIntensityOvertimeHours}h 重度加班日`}
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
        title="员工工时小提琴图"
        subtitle="看团队内谁的日工时波动更大"
        note="这里只展示波动最大的 5 位员工。小提琴越宽，代表该工时段出现得越频繁；黑色菱形是中位数。这里的重点是看加班分布和长工时尾部，不直接把 >7.5h 视为异常。"
        option={violinOption}
        source="derived"
        method={`按员工日工时做核密度分布，并统计 >${analysisConfig.thresholds.standardDailyHours}h 加班日与 >${analysisConfig.thresholds.highIntensityOvertimeHours}h 重度加班日`}
        reliability="中高"
        caution="样本少的员工小提琴形状会更不稳定；这张图更适合看分布，不适合单独作为异常判定"
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

      <ChartPanel
        title="员工特征交集 UpSet 图"
        subtitle="看哪些员工同时具备高工时、高任务、高项目数和高核验缺口等特征"
        note="这张图把员工画像改成更直接的“特征交集”视角。上面的柱子看常见特征组合有多少人，下面的点阵看组合由哪些特征构成，左侧则看单个特征本身覆盖了多少员工。"
        option={employeeUpSetOption}
        height={460}
        className="panel-wide"
        source="derived"
        method="前端计算：基于团队中位数将 4 个直接特征二值化，再统计精确交集"
        reliability="中"
        caution="这里的“高”表示高于当前样本团队中位数，不代表绝对高负载；更适合看特征重叠结构，不适合做绩效判断"
        onChartClick={(params) => {
          const data = params.data as { comboIndex?: number } | undefined;
          const value = params.value;
          const comboIndex =
            typeof data?.comboIndex === 'number'
              ? data.comboIndex
              : Array.isArray(value)
                ? Number(value[0])
                : Number.NaN;
          if (Number.isFinite(comboIndex) && comboIndex >= 0) {
            setSelectedUpSetComboIndex(comboIndex);
          }
        }}
      />

      {selectedUpSetCombo ? (
        <div className="detail-overlay" onClick={() => setSelectedUpSetComboIndex(null)}>
          <div
            className="detail-drawer rlab-upset-drawer"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="detail-header">
              <div>
                <div className="focus-intro-label">员工特征交集</div>
                <h2 className="focus-intro-title">
                  {selectedUpSetCombo.activeKeys.length
                    ? selectedUpSetCombo.activeKeys
                        .map(
                          (key) =>
                            employeeUpSetData.featureDefs.find((feature) => feature.key === key)
                              ?.label ?? key,
                        )
                        .join(' + ')
                    : '四项都未高于团队中位数'}
                </h2>
              </div>
              <button
                type="button"
                className="panel-info-toggle"
                onClick={() => setSelectedUpSetComboIndex(null)}
              >
                关闭
              </button>
            </div>

            <div className="chart-meta">
              <MetaPill tone="derived">{`员工数 ${selectedUpSetCombo.count}`}</MetaPill>
              <span>口径：基于团队中位数判断是否进入高工时、高任务、高项目数和高核验缺口特征</span>
            </div>

            <div className="detail-content">
              <div className="rlab-upset-feature-pills">
                {employeeUpSetData.featureDefs.map((feature) => {
                  const active = selectedUpSetCombo.activeKeys.includes(feature.key);
                  const threshold = employeeUpSetData.thresholds[feature.key];
                  return (
                    <span
                      key={feature.key}
                      className={`rlab-upset-feature-pill ${active ? 'active' : ''}`.trim()}
                      style={{
                        background: active
                          ? `color-mix(in srgb, ${feature.color} 18%, var(--surface-elevated))`
                          : `color-mix(in srgb, ${feature.color} 9%, var(--surface-raised))`,
                        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${feature.color} ${active ? '36%' : '18%'}, transparent)`,
                      }}
                    >
                      <strong>{feature.label}</strong>
                      <span>
                        {feature.key === 'verifyGapRate'
                          ? `阈值 >= ${formatNumber(threshold * 100, 1)}%`
                          : `阈值 >= ${formatNumber(threshold, 2)}${feature.key === 'averageDailyHours' ? 'h' : ''}`}
                      </span>
                    </span>
                  );
                })}
              </div>

              <div className="rlab-upset-member-table">
                <div className="rlab-upset-member-head">
                  <span>员工</span>
                  <span>日均工时</span>
                  <span>日均任务数</span>
                  <span>日均项目数</span>
                  <span>核验缺口率</span>
                </div>
                {selectedUpSetCombo.members
                  .slice()
                  .sort((left, right) => right.averageDailyHours - left.averageDailyHours)
                  .map((member) => (
                    <div className="rlab-upset-member-row" key={member.employeeId}>
                      <strong>{member.employeeName}</strong>
                      <span>{formatNumber(member.averageDailyHours, 2)} h</span>
                      <span>{formatNumber(member.taskPerDay, 2)}</span>
                      <span>{formatNumber(member.averageProjectCount, 2)}</span>
                      <span>{formatNumber(member.verifyGapRate * 100, 1)}%</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
