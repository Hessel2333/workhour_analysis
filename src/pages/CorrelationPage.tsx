import { ChartPanel } from '../components/ChartPanel';
import { CollapsiblePanel } from '../components/CollapsiblePanel';
import { DataSourceBoundaryBanner } from '../components/DataSourceBoundaryBanner';
import { MetricCard } from '../components/MetricCard';
import { MetaPill } from '../components/MetaPill';
import { Panel } from '../components/Panel';
import { analysisConfig } from '../config/analysisConfig';
import { formatNumber, formatPercent } from '../lib/format';
import { getEmployeeRiskMetric } from '../lib/metrics';
import { classifyTaskWorkstream, isReworkTask } from '../lib/taskSignals';
import type { BaseDataset, CorrelationCell, Filters } from '../types';

interface CorrelationPageProps {
  dataset: BaseDataset;
  view: import('../types').AnalyticsView;
  filters: Filters;
}

function quartiles(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  if (!sorted.length) return [0, 0, 0, 0, 0];
  const pick = (ratio: number) => sorted[Math.floor((sorted.length - 1) * ratio)];
  return [sorted[0], pick(0.25), pick(0.5), pick(0.75), sorted[sorted.length - 1]];
}

function correlationStrengthLabel(value: number) {
  const absolute = Math.abs(value);
  if (absolute < 0.2) return '很弱';
  if (absolute < 0.4) return '较弱';
  if (absolute < 0.6) return '中等';
  if (absolute < 0.8) return '明显';
  return '强';
}

function getCorrelationValue(cells: CorrelationCell[], x: string, y: string) {
  return cells.find((item) => item.x === x && item.y === y)?.value ?? 0;
}

function getTopPairs(cells: CorrelationCell[]) {
  const seen = new Set<string>();
  return cells
    .filter((item) => item.x !== item.y)
    .filter((item) => {
      const key = [item.x, item.y].sort().join('::');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => Math.abs(right.value) - Math.abs(left.value))
    .slice(0, analysisConfig.displayLimits.correlationTopPairs);
}

function countUpperOutliers(values: number[]) {
  if (values.length < 4) return 0;
  const [, q1, , q3] = quartiles(values);
  const fence = q3 + (q3 - q1) * 1.5;
  return values.filter((value) => value > fence).length;
}

function pearson(valuesX: number[], valuesY: number[]) {
  if (valuesX.length !== valuesY.length || valuesX.length < 2) return 0;
  const meanX = valuesX.reduce((sum, value) => sum + value, 0) / valuesX.length;
  const meanY = valuesY.reduce((sum, value) => sum + value, 0) / valuesY.length;
  const numerator = valuesX.reduce(
    (sum, value, index) => sum + (value - meanX) * (valuesY[index] - meanY),
    0,
  );
  const denominatorX = Math.sqrt(
    valuesX.reduce((sum, value) => sum + (value - meanX) ** 2, 0),
  );
  const denominatorY = Math.sqrt(
    valuesY.reduce((sum, value) => sum + (value - meanY) ** 2, 0),
  );
  if (!denominatorX || !denominatorY) return 0;
  return numerator / (denominatorX * denominatorY);
}

function linearRegression(points: Array<{ x: number; y: number }>) {
  if (points.length < 2) return null;
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const numerator = points.reduce(
    (sum, point) => sum + (point.x - meanX) * (point.y - meanY),
    0,
  );
  const denominator = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
  const slope = denominator ? numerator / denominator : 0;
  const intercept = meanY - slope * meanX;
  return { slope, intercept };
}

function relationDirectionLabel(value: number) {
  if (Math.abs(value) < 0.05) return '几乎没有线性方向';
  return value >= 0 ? '正向联动' : '反向联动';
}

function isWeakCorrelation(value: number) {
  return Math.abs(value) < 0.2;
}

export function CorrelationPage({
  dataset,
  view,
  filters,
}: CorrelationPageProps) {
  const labels = Array.from(new Set(view.correlations.map((item) => item.x)));
  const topPairs = getTopPairs(view.correlations);
  const strongestPair = topPairs[0];
  const multiProjectShare = view.employeeDays.length
    ? view.employeeDays.filter((day) => day.projectCount > 1).length / view.employeeDays.length
    : 0;
  const employeeOutlierCount = countUpperOutliers(
    view.employeeStats.map((item) => item.totalHours),
  );
  const projectOutlierCount = countUpperOutliers(
    view.projectStats.map((item) => item.totalHours),
  );
  const tasksCorrelation = getCorrelationValue(view.correlations, '工时', '任务数');
  const projectsCorrelation = getCorrelationValue(view.correlations, '工时', '项目数');
  const topPairSummary = strongestPair
      ? `${strongestPair.x}与${strongestPair.y}呈${correlationStrengthLabel(strongestPair.value)}${
        strongestPair.value >= 0 ? '正' : '负'
      }相关（r=${formatNumber(strongestPair.value, 1)}）`
    : '当前样本不足以形成稳定的候选关系';

  const loadDriverSummary =
    Math.abs(tasksCorrelation - projectsCorrelation) < 0.12
      ? '工时升高同时伴随任务数和项目数增加，说明负载与切换摩擦可能一起出现。'
      : Math.abs(tasksCorrelation) > Math.abs(projectsCorrelation)
        ? '工时升高更常伴随任务数增加，先关注任务拆分粒度和当日任务堆叠。'
        : '工时升高更常伴随跨项目切换，先关注上下文切换和插单干扰。';

  const outlierSummary =
    employeeOutlierCount || projectOutlierCount
      ? `当前发现 ${employeeOutlierCount} 个员工样本离群、${projectOutlierCount} 个项目样本离群，更适合先做个案复盘。`
      : '当前没有特别突出的工时离群项，更适合先看整体结构关系。';

  const heatmapOption = {
    tooltip: {
      formatter: (params: { value: [number, number, number] }) =>
        `${labels[params.value[0]]} / ${labels[params.value[1]]}<br/>相关系数 r = ${formatNumber(params.value[2], 1)}`,
    },
    grid: { left: 60, right: 28, top: 16, bottom: 56, containLabel: true },
    xAxis: { type: 'category', data: labels },
    yAxis: { type: 'category', data: labels },
    visualMap: {
      min: -1,
      max: 1,
      orient: 'horizontal',
      left: 'center',
      bottom: 8,
      text: ['更强正相关', '更强负相关'],
      calculable: false,
    },
    series: [
      {
        type: 'heatmap',
        data: view.correlations.map((item) => [
          labels.indexOf(item.x),
          labels.indexOf(item.y),
          Number(item.value.toFixed(1)),
        ]),
        label: {
          show: true,
          color: '#1d1d1f',
          fontSize: 11,
          formatter: ({ value }: { value: [number, number, number] }) =>
            formatNumber(value[2], 1),
        },
      },
    ],
  };

  const relationRankingOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: Array<{ name: string; value: number }>) => {
        const item = params[0];
        return `${item.name}<br/>相关系数 r = ${formatNumber(item.value, 1)}<br/>说明：当前只代表同步变化，不代表因果`;
      },
    },
    grid: { left: 112, right: 24, top: 12, bottom: 40 },
    xAxis: {
      type: 'value',
      name: '相关系数 r',
      min: -1,
      max: 1,
      splitNumber: 4,
      axisLabel: { formatter: (value: number) => value.toFixed(1) },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: topPairs.map((item) => `${item.x} × ${item.y}`),
    },
    series: [
      {
        type: 'bar',
        data: topPairs.map((item) => ({
          value: Number(item.value.toFixed(1)),
          itemStyle: {
            color: item.value >= 0 ? '#0071e3' : '#ff9f0a',
            borderRadius: 10,
          },
        })),
      },
    ],
  };

  const scatterOption = {
    tooltip: {
      trigger: 'item',
      formatter: (params: {
        name?: string;
        value: [number, number, number];
        data: { employeeName: string; date: string; value: [number, number, number] };
      }) => {
        const [hours, taskCount, projectCount] = params.value;
        return [
          `${params.data.employeeName} · ${params.data.date}`,
          `单日工时：${formatNumber(hours)}h`,
          `单日任务数：${taskCount}`,
          `涉及项目数：${projectCount}`,
        ].join('<br/>');
      },
    },
    grid: { left: 56, right: 18, top: 24, bottom: 48 },
    xAxis: { type: 'value', name: '单日工时' },
    yAxis: { type: 'value', name: '单日任务数' },
    series: [
      {
        type: 'scatter',
        data: view.employeeDays.map((day) => ({
          value: [day.reportHour, day.taskCount, day.projectCount],
          employeeName: day.employeeName,
          date: day.date,
        })),
        symbolSize: (value: number[]) => 12 + value[2] * 6,
        itemStyle: { color: '#0071e3', opacity: 0.8 },
        markLine: {
          symbol: 'none',
          lineStyle: { color: 'rgba(29,29,31,0.24)', type: 'dashed' },
          data: [{ type: 'average', xAxis: 0 }, { type: 'average', yAxis: 0 }],
        },
      },
    ],
  };

  const employeeBox = quartiles(view.employeeStats.map((item) => item.totalHours));
  const projectBox = quartiles(view.projectStats.map((item) => item.totalHours));
  const boxplotOption = {
    tooltip: {
      trigger: 'item',
      formatter: (params: { name: string; data: number[] }) =>
        [
          params.name,
          `最小值：${formatNumber(params.data[0])}h`,
          `Q1：${formatNumber(params.data[1])}h`,
          `中位数：${formatNumber(params.data[2])}h`,
          `Q3：${formatNumber(params.data[3])}h`,
          `最大值：${formatNumber(params.data[4])}h`,
        ].join('<br/>'),
    },
    grid: { left: 56, right: 20, top: 24, bottom: 40 },
    xAxis: { type: 'category', data: ['员工总工时', '项目总工时'] },
    yAxis: { type: 'value', name: '工时' },
    series: [
      {
        type: 'boxplot',
        itemStyle: { color: '#0071e3', borderColor: '#0071e3' },
        data: [employeeBox, projectBox],
      },
    ],
  };

  const gitByProject = Array.from(
    dataset.connectors.git.reduce((map, item) => {
      if (filters.projectName && item.projectName !== filters.projectName) return map;
      map.set(item.projectName, (map.get(item.projectName) ?? 0) + item.commitCount);
      return map;
    }, new Map<string, number>()),
  );

  const aiByDate = Array.from(
    dataset.connectors.ai.reduce((map, item) => {
      if (item.date < filters.startDate || item.date > filters.endDate) return map;
      map.set(item.date, (map.get(item.date) ?? 0) + item.callCount);
      return map;
    }, new Map<string, number>()),
  ).sort((left, right) => left[0].localeCompare(right[0]));

  const feedbackByProject = Array.from(
    dataset.connectors.feedback.reduce((map, item) => {
      if (filters.projectName && item.projectName !== filters.projectName) return map;
      const current = map.get(item.projectName) ?? { score: 0, count: 0 };
      current.score += item.score;
      current.count += 1;
      map.set(item.projectName, current);
      return map;
    }, new Map<string, { score: number; count: number }>()),
  ).sort((left, right) => right[1].score / right[1].count - left[1].score / left[1].count);

  const employeeRelationPoints = view.employeeStats.map((employee) => ({
    x: Number((employee.multiProjectRate * 100).toFixed(1)),
    y: Number((employee.focusScore * 100).toFixed(1)),
    label: employee.name,
    employeeId: employee.employeeId,
    totalHours: employee.totalHours,
    anomalyDayCount: employee.anomalyDayCount,
  }));
  const employeeRelationCorrelation = pearson(
    employeeRelationPoints.map((item) => item.x),
    employeeRelationPoints.map((item) => item.y),
  );
  const employeeRelationRegression = linearRegression(employeeRelationPoints);
  const employeeRelationWeak = isWeakCorrelation(employeeRelationCorrelation);
  const employeeRelationRange = employeeRelationPoints.reduce(
    (range, point) => ({
      min: Math.min(range.min, point.x),
      max: Math.max(range.max, point.x),
    }),
    { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY },
  );
  const employeeRelationOption = {
    tooltip: {
      trigger: 'item',
      formatter: (params: {
        seriesType?: string;
        data?: { label: string; value: [number, number]; totalHours: number; anomalyDayCount: number };
      }) => {
        if (params.seriesType === 'line') {
          return '趋势线：帮助观察整体方向，不代表因果。';
        }
        const point = params.data;
        return [
          `<strong>${point?.label ?? ''}</strong>`,
          `多项目率：${formatNumber(point?.value?.[0] ?? 0, 1)}%`,
          `集中度：${formatNumber(point?.value?.[1] ?? 0, 1)}%`,
          `总工时：${formatNumber(point?.totalHours ?? 0)} h`,
          `异常日：${point?.anomalyDayCount ?? 0} 天`,
        ].join('<br/>');
      },
    },
    grid: { left: 48, right: 20, top: 24, bottom: 44 },
    xAxis: { type: 'value', name: '多项目率（%）' },
    yAxis: { type: 'value', name: '集中度（%）', max: 100 },
    series: [
      {
        type: 'scatter',
        data: employeeRelationPoints.map((point) => ({
          value: [point.x, point.y],
          label: point.label,
          totalHours: point.totalHours,
          anomalyDayCount: point.anomalyDayCount,
          employeeId: point.employeeId,
        })),
        symbolSize: 16,
        itemStyle: {
          color: employeeRelationWeak ? 'rgba(37,99,235,0.35)' : '#2563eb',
          opacity: employeeRelationWeak ? 0.45 : 0.82,
        },
      },
      ...(employeeRelationRegression && Number.isFinite(employeeRelationRange.min)
        ? [
            {
              type: 'line',
              data: [
                [
                  employeeRelationRange.min,
                  employeeRelationRegression.intercept +
                    employeeRelationRegression.slope * employeeRelationRange.min,
                ],
                [
                  employeeRelationRange.max,
                  employeeRelationRegression.intercept +
                    employeeRelationRegression.slope * employeeRelationRange.max,
                ],
              ],
              showSymbol: false,
              silent: true,
              lineStyle: {
                color: employeeRelationWeak ? '#94a3b8' : '#1d4ed8',
                type: employeeRelationWeak ? 'dashed' : 'solid',
                width: employeeRelationWeak ? 2 : 3,
              },
            },
          ]
        : []),
    ],
  };

  const employeeReworkRiskPoints = view.employeeStats
    .map((employee) => {
      const employeeTasks = view.tasks.filter((task) => task.employeeId === employee.employeeId);
      const totalHours = employeeTasks.reduce((sum, task) => sum + task.reportHour, 0);
      const reworkHours = employeeTasks
        .filter((task) => isReworkTask(task))
        .reduce((sum, task) => sum + task.reportHour, 0);
      return {
        x: totalHours ? Number(((reworkHours / totalHours) * 100).toFixed(1)) : 0,
        y: Number(
          getEmployeeRiskMetric({
            multiProjectRate: employee.multiProjectRate,
            focusScore: employee.focusScore,
            anomalyDayCount: employee.anomalyDayCount,
            taskCount: employee.taskCount,
          }).value.toFixed(1),
        ),
        label: employee.name,
        employeeId: employee.employeeId,
        totalHours,
        reworkHours,
      };
    })
    .filter((item) => item.totalHours > 0);
  const employeeReworkRiskCorrelation = pearson(
    employeeReworkRiskPoints.map((item) => item.x),
    employeeReworkRiskPoints.map((item) => item.y),
  );
  const employeeReworkRiskRegression = linearRegression(employeeReworkRiskPoints);
  const employeeReworkRiskWeak = isWeakCorrelation(employeeReworkRiskCorrelation);
  const employeeReworkRiskRange = employeeReworkRiskPoints.reduce(
    (range, point) => ({
      min: Math.min(range.min, point.x),
      max: Math.max(range.max, point.x),
    }),
    { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY },
  );
  const employeeReworkRiskOption = {
    tooltip: {
      trigger: 'item',
      formatter: (params: {
        seriesType?: string;
        data?: { label: string; value: [number, number]; totalHours: number; reworkHours: number };
      }) => {
        if (params.seriesType === 'line') {
          return '趋势线：帮助观察返工占比与风险分的整体方向。';
        }
        const point = params.data;
        return [
          `<strong>${point?.label ?? ''}</strong>`,
          `返工占比：${formatNumber(point?.value?.[0] ?? 0, 1)}%`,
          `风险分：${formatNumber(point?.value?.[1] ?? 0, 1)}`,
          `总工时：${formatNumber(point?.totalHours ?? 0)} h`,
          `返工类工时：${formatNumber(point?.reworkHours ?? 0)} h`,
        ].join('<br/>');
      },
    },
    grid: { left: 48, right: 20, top: 24, bottom: 44 },
    xAxis: { type: 'value', name: '返工占比（%）' },
    yAxis: { type: 'value', name: '风险分' },
    series: [
      {
        type: 'scatter',
        data: employeeReworkRiskPoints.map((point) => ({
          value: [point.x, point.y],
          label: point.label,
          totalHours: point.totalHours,
          reworkHours: point.reworkHours,
          employeeId: point.employeeId,
        })),
        symbolSize: 16,
        itemStyle: {
          color: employeeReworkRiskWeak ? 'rgba(249,115,22,0.4)' : '#f97316',
          opacity: employeeReworkRiskWeak ? 0.45 : 0.84,
        },
      },
      ...(employeeReworkRiskRegression && Number.isFinite(employeeReworkRiskRange.min)
        ? [
            {
              type: 'line',
              data: [
                [
                  employeeReworkRiskRange.min,
                  employeeReworkRiskRegression.intercept +
                    employeeReworkRiskRegression.slope * employeeReworkRiskRange.min,
                ],
                [
                  employeeReworkRiskRange.max,
                  employeeReworkRiskRegression.intercept +
                    employeeReworkRiskRegression.slope * employeeReworkRiskRange.max,
                ],
              ],
              showSymbol: false,
              silent: true,
              lineStyle: {
                color: employeeReworkRiskWeak ? '#94a3b8' : '#ea580c',
                type: employeeReworkRiskWeak ? 'dashed' : 'solid',
                width: employeeReworkRiskWeak ? 2 : 3,
              },
            },
          ]
        : []),
    ],
  };

  const projectRepairPoints = view.projectStats
    .map((project) => {
      const projectTasks = view.tasks.filter((task) => task.projectName === project.projectName);
      const totalHours = projectTasks.reduce((sum, task) => sum + task.reportHour, 0);
      const repairHours = projectTasks
        .filter((task) => classifyTaskWorkstream(task) === '修补型')
        .reduce((sum, task) => sum + task.reportHour, 0);
      return {
        x: totalHours ? Number(((repairHours / totalHours) * 100).toFixed(1)) : 0,
        y: Number(totalHours.toFixed(1)),
        label: project.projectName,
        participantCount: project.participantCount,
        repairHours,
      };
    })
    .filter((item) => item.y > 0);
  const projectRepairCorrelation = pearson(
    projectRepairPoints.map((item) => item.x),
    projectRepairPoints.map((item) => item.y),
  );
  const projectRepairRegression = linearRegression(projectRepairPoints);
  const projectRepairWeak = isWeakCorrelation(projectRepairCorrelation);
  const projectRepairRange = projectRepairPoints.reduce(
    (range, point) => ({
      min: Math.min(range.min, point.x),
      max: Math.max(range.max, point.x),
    }),
    { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY },
  );
  const projectRepairOption = {
    tooltip: {
      trigger: 'item',
      formatter: (params: {
        seriesType?: string;
        data?: { label: string; value: [number, number]; participantCount: number; repairHours: number };
      }) => {
        if (params.seriesType === 'line') {
          return '趋势线：帮助观察修补型占比与总工时是否一起抬升。';
        }
        const point = params.data;
        return [
          `<strong>${point?.label ?? ''}</strong>`,
          `修补型占比：${formatNumber(point?.value?.[0] ?? 0, 1)}%`,
          `总工时：${formatNumber(point?.value?.[1] ?? 0)} h`,
          `修补型工时：${formatNumber(point?.repairHours ?? 0)} h`,
          `参与人数：${point?.participantCount ?? 0}`,
        ].join('<br/>');
      },
    },
    grid: { left: 48, right: 20, top: 24, bottom: 44 },
    xAxis: { type: 'value', name: '修补型占比（%）' },
    yAxis: { type: 'value', name: '总工时（h）' },
    series: [
      {
        type: 'scatter',
        data: projectRepairPoints.map((point) => ({
          value: [point.x, point.y],
          label: point.label,
          participantCount: point.participantCount,
          repairHours: point.repairHours,
        })),
        symbolSize: 18,
        itemStyle: {
          color: projectRepairWeak ? 'rgba(14,165,164,0.4)' : '#0ea5a4',
          opacity: projectRepairWeak ? 0.45 : 0.82,
        },
      },
      ...(projectRepairRegression && Number.isFinite(projectRepairRange.min)
        ? [
            {
              type: 'line',
              data: [
                [
                  projectRepairRange.min,
                  projectRepairRegression.intercept +
                    projectRepairRegression.slope * projectRepairRange.min,
                ],
                [
                  projectRepairRange.max,
                  projectRepairRegression.intercept +
                    projectRepairRegression.slope * projectRepairRange.max,
                ],
              ],
              showSymbol: false,
              silent: true,
              lineStyle: {
                color: projectRepairWeak ? '#94a3b8' : '#0f766e',
                type: projectRepairWeak ? 'dashed' : 'solid',
                width: projectRepairWeak ? 2 : 3,
              },
            },
          ]
        : []),
    ],
  };

  const aiDepthReworkPoints = Array.from(
    dataset.connectors.ai.reduce((map, item) => {
      if (item.date < filters.startDate || item.date > filters.endDate) return map;
      if (filters.employeeId && item.employeeId !== filters.employeeId) return map;
      const current = map.get(item.employeeId) ?? { depthScore: 0, callCount: 0, recordCount: 0 };
      current.depthScore += item.depthScore;
      current.callCount += item.callCount;
      current.recordCount += 1;
      map.set(item.employeeId, current);
      return map;
    }, new Map<string, { depthScore: number; callCount: number; recordCount: number }>()),
  )
    .map(([employeeId, value]) => {
      const employee = view.employeeStats.find((item) => item.employeeId === employeeId);
      if (!employee) return null;
      const employeeTasks = view.tasks.filter((task) => task.employeeId === employeeId);
      const totalHours = employeeTasks.reduce((sum, task) => sum + task.reportHour, 0);
      const reworkHours = employeeTasks
        .filter((task) => isReworkTask(task))
        .reduce((sum, task) => sum + task.reportHour, 0);
      return {
        x: value.recordCount ? Number((value.depthScore / value.recordCount).toFixed(1)) : 0,
        y: totalHours ? Number(((reworkHours / totalHours) * 100).toFixed(1)) : 0,
        label: employee.name,
        callCount: value.callCount,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const aiDepthReworkCorrelation = pearson(
    aiDepthReworkPoints.map((item) => item.x),
    aiDepthReworkPoints.map((item) => item.y),
  );
  const aiDepthReworkRegression = linearRegression(aiDepthReworkPoints);
  const aiDepthReworkWeak = isWeakCorrelation(aiDepthReworkCorrelation);
  const aiDepthReworkRange = aiDepthReworkPoints.reduce(
    (range, point) => ({
      min: Math.min(range.min, point.x),
      max: Math.max(range.max, point.x),
    }),
    { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY },
  );
  const aiDepthReworkOption = {
    tooltip: {
      trigger: 'item',
      formatter: (params: {
        seriesType?: string;
        data?: { label: string; value: [number, number]; callCount: number };
      }) => {
        if (params.seriesType === 'line') {
          return '趋势线：当前仅示意 AI 深度分与返工率的候选方向。';
        }
        const point = params.data;
        return [
          `<strong>${point?.label ?? ''}</strong>`,
          `AI 深度分：${formatNumber(point?.value?.[0] ?? 0, 1)}`,
          `返工占比：${formatNumber(point?.value?.[1] ?? 0, 1)}%`,
          `调用次数：${point?.callCount ?? 0}`,
        ].join('<br/>');
      },
    },
    grid: { left: 48, right: 20, top: 24, bottom: 44 },
    xAxis: { type: 'value', name: 'AI 深度分' },
    yAxis: { type: 'value', name: '返工占比（%）' },
    series: [
      {
        type: 'scatter',
        data: aiDepthReworkPoints.map((point) => ({
          value: [point.x, point.y],
          label: point.label,
          callCount: point.callCount,
        })),
        symbolSize: 16,
        itemStyle: {
          color: aiDepthReworkWeak ? 'rgba(168,85,247,0.35)' : '#8b5cf6',
          opacity: aiDepthReworkWeak ? 0.42 : 0.8,
        },
      },
      ...(aiDepthReworkRegression && Number.isFinite(aiDepthReworkRange.min)
        ? [
            {
              type: 'line',
              data: [
                [
                  aiDepthReworkRange.min,
                  aiDepthReworkRegression.intercept +
                    aiDepthReworkRegression.slope * aiDepthReworkRange.min,
                ],
                [
                  aiDepthReworkRange.max,
                  aiDepthReworkRegression.intercept +
                    aiDepthReworkRegression.slope * aiDepthReworkRange.max,
                ],
              ],
              showSymbol: false,
              silent: true,
              lineStyle: {
                color: aiDepthReworkWeak ? '#94a3b8' : '#7c3aed',
                type: aiDepthReworkWeak ? 'dashed' : 'solid',
                width: aiDepthReworkWeak ? 2 : 3,
              },
            },
          ]
        : []),
    ],
  };

  const gitOption = {
    tooltip: { trigger: 'item' },
    xAxis: { type: 'value', name: '项目工时' },
    yAxis: { type: 'value', name: 'Commit 数' },
    series: [
      {
        type: 'scatter',
        data: view.projectStats
          .map((project) => [
            project.totalHours,
            gitByProject.find(([name]) => name === project.projectName)?.[1] ?? 0,
            project.projectName,
          ])
          .filter((item) => item[1] !== 0),
        symbolSize: 18,
        itemStyle: { color: '#0071e3' },
      },
    ],
  };

  const aiOption = {
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: aiByDate.map(([date]) => date) },
    yAxis: { type: 'value', name: '调用次数' },
    series: [
      {
        type: 'line',
        smooth: true,
        data: aiByDate.map(([, count]) => count),
        lineStyle: { width: 2, color: '#0071e3' },
        itemStyle: { color: '#0071e3' },
      },
    ],
  };

  const feedbackOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: 32, right: 20, top: 20, bottom: 28, containLabel: true },
    xAxis: { type: 'category', data: feedbackByProject.map(([projectName]) => projectName) },
    yAxis: { type: 'value', min: 0, max: 5, name: '评分' },
    series: [
      {
        type: 'bar',
        data: feedbackByProject.map(([, value]) => value.score / value.count),
        itemStyle: { color: '#0071e3', borderRadius: 8 },
      },
    ],
  };

  return (
    <div className="page-grid">
      <DataSourceBoundaryBanner
        className="panel-wide"
        realSources={['工时原始数据', '员工日聚合指标', '规则推导相关矩阵']}
        mockSources={
          analysisConfig.ruleToggles.showMockCharts ? ['Git', 'AI 使用', '用户反馈'] : []
        }
      />
      <Panel
        title="相关性实验室"
        subtitle="先找值得追问的候选关系，再决定是否继续验证"
        note="参考 research 文档，这一页只负责发现结构摩擦和候选关系，不直接给出因果或绩效结论。"
        className="panel-wide panel-strip"
        meta={
          <div className="chart-meta">
            <MetaPill tone="derived">规则推导</MetaPill>
            <span>当前真实来源：工时员工日聚合</span>
            <span>方法：Pearson 线性相关</span>
            <span>正确用法：描述 → 候选关系 → 再验证</span>
          </div>
        }
      >
        <div className="lab-guide-grid">
          <div className="lab-guide-card">
            <strong>1. 先看候选关系排行</strong>
            <span>先确认哪些指标值得继续追问，不要先盯完整矩阵。</span>
          </div>
          <div className="lab-guide-card">
            <strong>2. 再看结构散点</strong>
            <span>判断工时升高更像来自任务堆叠，还是跨项目切换。</span>
          </div>
          <div className="lab-guide-card">
            <strong>3. 最后看分布离群</strong>
            <span>判断问题是少数离群个案，还是整体流程摩擦。</span>
          </div>
        </div>
      </Panel>

      {view.dataHealth.sampleDays < analysisConfig.thresholds.lowSampleDays ? (
        <Panel
          title="样本限制"
          subtitle="当前处于低样本模式，结论只能作为观察线索"
          note="research 文档建议相关性矩阵同时展示样本量与显著性。当前样本仅适合发现候选关系，不适合给个体下判断。"
          className="panel-wide panel-strip"
          meta={
            <div className="chart-meta">
              <MetaPill tone="warning">低样本模式</MetaPill>
              <span>当前样本天数：{view.dataHealth.sampleDays}</span>
              <span>未做显著性检验</span>
              <span>建议与质量页、项目页联读</span>
            </div>
          }
        >
          <div className="callout">
            <strong>当前更适合回答“哪里可能有摩擦”，不适合回答“谁更高效”。</strong>
            <span>如果要做管理动作，建议先落到项目或员工聚焦页做复盘，再决定是否介入。</span>
          </div>
        </Panel>
      ) : null}

      <div className="metrics-grid">
        <MetricCard
          label="最强候选关系"
          value={strongestPair ? `${strongestPair.x} × ${strongestPair.y}` : '样本不足'}
          hint={topPairSummary}
          tone="derived"
        />
        <MetricCard
          label="多项目工作日占比"
          value={formatPercent(multiProjectShare)}
          hint="表示员工单日涉及多个项目的比例，适合观察上下文切换，不适合直接评价绩效。"
          tone="derived"
        />
        <MetricCard
          label="离群样本"
          value={`${employeeOutlierCount + projectOutlierCount} 个`}
          hint={outlierSummary}
          tone="derived"
        />
        <MetricCard
          label="结论等级"
          value={view.dataHealth.sampleDays < analysisConfig.thresholds.lowSampleDays ? '观察' : '候选验证'}
          hint="当前页只用于发现值得继续验证的变量关系，不输出因果结论。"
          tone="warning"
        />
      </div>

      <Panel
        title="当前可读结论"
        subtitle="用一句话理解这页，而不是直接盯着热力图"
        className="panel-wide panel-strip"
      >
        <div className="insight-grid">
          <div className="insight-card">
            <strong>最值得继续验证的关系</strong>
            <p>{topPairSummary}</p>
          </div>
          <div className="insight-card">
            <strong>工时升高更像由什么驱动</strong>
            <p>{loadDriverSummary}</p>
          </div>
          <div className="insight-card">
            <strong>当前更像系统问题还是个案问题</strong>
            <p>{outlierSummary}</p>
          </div>
        </div>
      </Panel>

      <ChartPanel
        title="候选关系排行"
        subtitle="先看这张图，再决定要不要读完整矩阵"
        note="这张图把当前最值得继续验证的几组关系排出来。绝对值越高，说明同步变化越明显；但仍然不代表因果。"
        option={relationRankingOption}
        source="derived"
        method="Pearson 相关系数绝对值排序，按员工日聚合"
        reliability={view.dataHealth.sampleDays < analysisConfig.thresholds.lowSampleDays ? '低，样本偏短' : '中'}
        caution="只代表同步变化强弱，不代表管理动作优先级"
      />

      <ChartPanel
        title="负载与碎片关系"
        subtitle="工时升高时，更像任务变多，还是项目切换变多"
        note="每个点代表一个员工日。横轴是单日工时，纵轴是任务数，气泡越大表示当天涉及项目越多。先看气泡是否集中在右上区域，再看是否出现大气泡。"
        option={scatterOption}
        source="derived"
        method="员工日级散点观察，气泡大小代表项目数"
        reliability="中"
        caution="任务拆分粒度差异会影响纵轴，不建议把单点直接解释为低效"
      />

      <Panel
        title="关系详情卡片"
        subtitle="把候选关系拆开读，别让完整矩阵一次塞太多信息"
        className="panel-wide panel-strip"
        meta={
          <div className="summary-ribbon">
            <strong>读法：</strong>
            <span>先看样本量 n 是否足够</span>
            <span>再看方向和强弱</span>
            <span>最后决定要不要回到员工页或项目页复盘</span>
            <span>相关不代表因果</span>
          </div>
        }
      >
        <div className="callout">
          <strong>弱相关会默认弱化显示。</strong>
          <span>点会更淡、趋势线会改成虚线，避免视觉上把“暂不稳定的关系”误读成确定结论。</span>
        </div>
      </Panel>

      <div className="connector-grid panel-wide">
        <ChartPanel
          title="多项目率 vs 集中度"
          subtitle="切换越多的人，是否越难保持聚焦"
          note={`当前呈${correlationStrengthLabel(employeeRelationCorrelation)}${relationDirectionLabel(
            employeeRelationCorrelation,
          )}（r=${formatNumber(employeeRelationCorrelation, 1)}，n=${employeeRelationPoints.length}）。`}
          option={employeeRelationOption}
          height={280}
          badge={`n=${employeeRelationPoints.length}`}
          source="derived"
          method="按员工聚合多项目率与集中度，并叠加线性趋势线"
          reliability={employeeRelationWeak ? '低到中，当前关系较弱' : '中'}
          caution="相关不代表因果；切换多也可能来自角色职责或项目分工，而不一定是排班问题"
        />

        <ChartPanel
          title="返工占比 vs 风险分"
          subtitle="返工型工作越多的人，是否更容易进入高风险状态"
          note={`当前呈${correlationStrengthLabel(employeeReworkRiskCorrelation)}${relationDirectionLabel(
            employeeReworkRiskCorrelation,
          )}（r=${formatNumber(employeeReworkRiskCorrelation, 1)}，n=${employeeReworkRiskPoints.length}）。`}
          option={employeeReworkRiskOption}
          height={280}
          badge={`n=${employeeReworkRiskPoints.length}`}
          source="derived"
          method="按员工聚合返工占比与风险分，并叠加线性趋势线"
          reliability={employeeReworkRiskWeak ? '低到中，当前关系较弱' : '中'}
          caution="相关不代表因果；风险分本身含异常日和切换率，适合做复盘线索，不适合直接用于个人评价"
        />

        <ChartPanel
          title="修补型占比 vs 总工时"
          subtitle="修补型工作抬升时，项目总投入会不会一起变重"
          note={`当前呈${correlationStrengthLabel(projectRepairCorrelation)}${relationDirectionLabel(
            projectRepairCorrelation,
          )}（r=${formatNumber(projectRepairCorrelation, 1)}，n=${projectRepairPoints.length}）。`}
          option={projectRepairOption}
          height={280}
          badge={`n=${projectRepairPoints.length}`}
          source="derived"
          method="按项目聚合修补型工时占比与总工时，并叠加线性趋势线"
          reliability={projectRepairWeak ? '低到中，当前关系较弱' : '中'}
          caution="相关不代表因果；修补型占比高可能来自项目阶段不同，也可能来自返工和支持任务叠加"
        />

        {analysisConfig.ruleToggles.showMockCharts ? (
          <ChartPanel
            title="AI 深度分 vs 返工占比"
            subtitle="示意：AI 使用深度是否和返工压力同步变化"
            note={`当前呈${correlationStrengthLabel(aiDepthReworkCorrelation)}${relationDirectionLabel(
              aiDepthReworkCorrelation,
            )}（r=${formatNumber(aiDepthReworkCorrelation, 1)}，n=${aiDepthReworkPoints.length}）。`}
            option={aiDepthReworkOption}
            height={280}
            badge={`n=${aiDepthReworkPoints.length}`}
            source="mock"
            method="按员工聚合模拟 AI 深度分与返工占比，并叠加线性趋势线"
            reliability={aiDepthReworkWeak ? '低，当前仅示意且关系较弱' : '低，仅示意'}
            caution="相关不代表因果；当前 AI 数据仍是模拟来源，只用于验证联动图面与后续接口结构"
          />
        ) : null}
      </div>

      <ChartPanel
        title="分布与离群"
        subtitle="判断问题是少数样本拉高，还是整体分布偏斜"
        note="箱线图适合回答：当前高工时是整体都高，还是只集中在少数员工或项目。优先看中位数和上缘，不要只看最大值。"
        option={boxplotOption}
        source="derived"
        method="四分位统计"
        reliability="中"
        caution="短样本下更适合找离群项，不适合判断长期稳定分布"
      />

      <CollapsiblePanel
        title="完整矩阵"
        subtitle="进阶视图：查看所有指标之间的完整相关矩阵"
        note="只有在前面的候选关系排行已明确目标后，才建议展开这张图。"
        className="panel-wide"
      >
        <ChartPanel
          title="完整相关矩阵"
          subtitle="工时、任务数、项目数的完整联动"
          note="颜色越深只代表相关系数绝对值越大。优先看非对角线，再回到上方候选关系排行确认是否值得继续分析。"
          option={heatmapOption}
          source="derived"
          method="Pearson 相关矩阵"
          reliability={view.dataHealth.sampleDays < analysisConfig.thresholds.lowSampleDays ? '低，样本偏短' : '中'}
          caution="未做显著性检验，当前已排除数据质量类指标"
        />
      </CollapsiblePanel>

      {analysisConfig.ruleToggles.showMockCharts ? (
        <CollapsiblePanel
          title="协同分析预留位"
          subtitle="Git / AI / 用户反馈目前仍是示意图，默认收起"
          note="research 文档建议这部分在真实数据接入后采用周级时间序列、滞后分析和质量指标联读。当前仅用于验证图面和接口。"
          className="panel-wide"
        >
          <div className="connector-grid">
            <ChartPanel
              title="Git 协同"
              subtitle="示意：项目工时 vs Commit 数"
              note="真实接入后建议扩展为 commit、PR、review 时间、code churn，并优先看团队/项目层而非个体排名。"
              option={gitOption}
              height={260}
              badge="示意数据"
              source="mock"
              method="模拟 Git 聚合"
              reliability="低，仅示意"
              caution="当前不代表真实提交表现"
            />
            <ChartPanel
              title="AI 使用"
              subtitle="示意：脱敏后的调用次数趋势"
              note="真实接入后建议结合 token、深度分数、主题复杂度与代码采纳质量一起看，不要单独用 token 高低判断价值。"
              option={aiOption}
              height={260}
              badge="示意数据"
              source="mock"
              method="模拟 AI 使用时序"
              reliability="低，仅示意"
              caution="当前不代表真实 AI 使用强度"
            />
            <ChartPanel
              title="用户反馈"
              subtitle="示意：项目满意度联动"
              note="research 文档建议真实反馈按周聚合，并用滞后窗口观察工时投入对评分和情感的后续影响。"
              option={feedbackOption}
              height={260}
              badge="示意数据"
              source="mock"
              method="模拟反馈评分聚合"
              reliability="低，仅示意"
              caution="当前不代表真实客户满意度"
            />
          </div>
        </CollapsiblePanel>
      ) : null}
    </div>
  );
}
