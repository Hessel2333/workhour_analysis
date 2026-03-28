import type { EmployeeDay, EmployeeStat } from '../types';

export type VolatilityMode = 'weekday' | 'all';
export type EmployeeFeatureKey =
  | 'averageDailyHours'
  | 'taskPerDay'
  | 'averageProjectCount'
  | 'verifyGapRate';

export interface EmployeeUpSetProfile {
  employeeId: string;
  employeeName: string;
  averageDailyHours: number;
  taskPerDay: number;
  averageProjectCount: number;
  verifyGapRate: number;
}

export interface EmployeeUpSetCombination {
  key: string;
  activeKeys: EmployeeFeatureKey[];
  members: EmployeeUpSetProfile[];
  count: number;
}

export function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

export function standardDeviation(values: number[]) {
  if (values.length <= 1) return 0;
  const mean = average(values);
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function rollingAverage(values: number[], windowSize: number) {
  return values.map((_, index) => {
    const startIndex = Math.max(0, index - windowSize + 1);
    return average(values.slice(startIndex, index + 1));
  });
}

export function rollingStandardDeviation(values: number[], windowSize: number) {
  return values.map((_, index) => {
    const startIndex = Math.max(0, index - windowSize + 1);
    return standardDeviation(values.slice(startIndex, index + 1));
  });
}

export function buildEmployeeVolatilityData(
  employeeDays: EmployeeDay[],
  modeLabel: string,
) {
  const employeeMap = new Map<
    string,
    {
      employeeId: string;
      employeeName: string;
      rows: EmployeeDay[];
    }
  >();

  employeeDays.forEach((day) => {
    const current = employeeMap.get(day.employeeId) ?? {
      employeeId: day.employeeId,
      employeeName: day.employeeName,
      rows: [],
    };
    current.rows.push(day);
    employeeMap.set(day.employeeId, current);
  });

  const topItems = Array.from(employeeMap.values())
    .map((item) => {
      const rows = item.rows.slice().sort((left, right) => left.date.localeCompare(right.date));
      const dailyHours = rows.map((row) => row.reportHour);
      const meanHours = average(dailyHours);
      const sdHours = standardDeviation(dailyHours);
      const coefficientOfVariation = meanHours > 0 ? sdHours / meanHours : 0;
      return {
        employeeId: item.employeeId,
        employeeName: item.employeeName,
        meanHours,
        sdHours,
        coefficientOfVariation,
        totalHours: dailyHours.reduce((sum, value) => sum + value, 0),
        daysWorked: rows.length,
        rows,
      };
    })
    .filter((item) => item.daysWorked > 0)
    .sort((left, right) => right.coefficientOfVariation - left.coefficientOfVariation);

  const subject = topItems[0];
  const subjectRows = subject?.rows ?? [];
  const subjectHours = subjectRows.map((row) => row.reportHour);
  const windowSize = Math.min(3, Math.max(subjectRows.length, 1));
  const rollingMean = rollingAverage(subjectHours, windowSize);
  const rollingSd = rollingStandardDeviation(subjectHours, windowSize);

  return {
    modeLabel,
    topItems: topItems.slice(0, 10),
    averageCoefficient: topItems.length
      ? average(topItems.map((item) => item.coefficientOfVariation))
      : 0,
    subjectName: subject?.employeeName ?? '暂无',
    sampleSize: subjectRows.length,
    windowSize,
    series: subjectRows.map((row, index) => ({
      date: row.date,
      hours: row.reportHour,
      rollingMean: rollingMean[index] ?? 0,
      upperBand: (rollingMean[index] ?? 0) + (rollingSd[index] ?? 0),
      lowerBand: Math.max((rollingMean[index] ?? 0) - (rollingSd[index] ?? 0), 0),
    })),
  };
}

export function buildEmployeeUpSetData(
  employeeStats: EmployeeStat[],
  employeeDays: EmployeeDay[],
) {
  const featureDefs: ReadonlyArray<{
    key: EmployeeFeatureKey;
    label: string;
    color: string;
  }> = [
    { key: 'averageDailyHours', label: '高日均工时', color: '#ef4444' },
    { key: 'taskPerDay', label: '高日均任务数', color: '#2563eb' },
    { key: 'averageProjectCount', label: '高日均项目数', color: '#14b8a6' },
    { key: 'verifyGapRate', label: '高核验缺口率', color: '#7c3aed' },
  ];

  const employeeProfiles: EmployeeUpSetProfile[] = employeeStats
    .map((employee) => {
      const days = employeeDays.filter((day) => day.employeeId === employee.employeeId);
      const daysWorked = Math.max(days.length, 1);
      const averageProjectCount = average(days.map((day) => Number(day.projectCount) || 0));
      const verifyGapRate = days.length
        ? average(
            days.map((day) =>
              Number(day.verifyHour) === 0 && Number(day.reportHour) > 0 ? 1 : 0,
            ),
          )
        : 0;

      return {
        employeeId: employee.employeeId,
        employeeName: employee.name,
        averageDailyHours: Number(employee.averageDailyHours) || 0,
        taskPerDay: (Number(employee.taskCount) || 0) / daysWorked,
        averageProjectCount,
        verifyGapRate,
      };
    })
    .filter((employee) => employee.employeeName);

  const thresholds: Record<EmployeeFeatureKey, number> = {
    averageDailyHours: median(employeeProfiles.map((item) => item.averageDailyHours)),
    taskPerDay: median(employeeProfiles.map((item) => item.taskPerDay)),
    averageProjectCount: median(employeeProfiles.map((item) => item.averageProjectCount)),
    verifyGapRate: median(employeeProfiles.map((item) => item.verifyGapRate)),
  };

  const setCounts = new Map<EmployeeFeatureKey, number>();
  const combinations = new Map<string, EmployeeUpSetCombination>();

  employeeProfiles.forEach((employee) => {
    const activeKeys = featureDefs
      .filter((feature) => employee[feature.key] >= thresholds[feature.key])
      .map((feature) => feature.key);

    featureDefs.forEach((feature) => {
      if (activeKeys.includes(feature.key)) {
        setCounts.set(feature.key, (setCounts.get(feature.key) ?? 0) + 1);
      }
    });

    const key = activeKeys.join('|') || 'baseline';
    const current = combinations.get(key) ?? {
      key,
      activeKeys,
      members: [],
      count: 0,
    };
    current.members.push(employee);
    current.count += 1;
    combinations.set(key, current);
  });

  const sortedCombinations = Array.from(combinations.values())
    .sort(
      (left, right) =>
        right.count - left.count ||
        right.activeKeys.length - left.activeKeys.length ||
        left.key.localeCompare(right.key, 'zh-CN'),
    )
    .slice(0, 8);

  return {
    featureDefs,
    thresholds,
    setCounts,
    sortedCombinations,
  };
}
