import { analysisConfig } from '../config/analysisConfig';
import { isCompanyWorkday, isHoliday } from './holidayCalendar';
import type { EmployeeDay, Filters } from '../types';

export type OvertimeType = 'workday' | 'weekend' | 'holiday' | 'none';

export interface OvertimeRecord {
  employeeId: string;
  employeeName: string;
  date: string;
  reportHour: number;
  overtimeHours: number;
  overtimeType: OvertimeType;
}

export interface OvertimeHistogramBin {
  key: string;
  label: string;
  min: number;
  max: number | null;
  total: number;
  workday: number;
  weekend: number;
  holiday: number;
}

const OVERTIME_HISTOGRAM_BINS: Array<Pick<OvertimeHistogramBin, 'key' | 'label' | 'min' | 'max'>> = [
  { key: '0_1', label: '0-1h', min: 0, max: 1 },
  { key: '1_2', label: '1-2h', min: 1, max: 2 },
  { key: '2_4', label: '2-4h', min: 2, max: 4 },
  { key: '4_6', label: '4-6h', min: 4, max: 6 },
  { key: '6_8', label: '6-8h', min: 6, max: 8 },
  { key: '8_plus', label: '8h+', min: 8, max: null },
];

export function getOvertimeRecord(
  day: Pick<EmployeeDay, 'employeeId' | 'employeeName' | 'date' | 'reportHour'>,
  overtimeMode: Filters['overtimeMode'],
): OvertimeRecord {
  if (isHoliday(day.date)) {
    return {
      employeeId: day.employeeId,
      employeeName: day.employeeName,
      date: day.date,
      reportHour: day.reportHour,
      overtimeHours: day.reportHour,
      overtimeType: day.reportHour > 0 ? 'holiday' : 'none',
    };
  }

  if (isCompanyWorkday(day.date, overtimeMode)) {
    const overtimeHours = Math.max(
      day.reportHour - analysisConfig.thresholds.standardDailyHours,
      0,
    );
    return {
      employeeId: day.employeeId,
      employeeName: day.employeeName,
      date: day.date,
      reportHour: day.reportHour,
      overtimeHours,
      overtimeType: overtimeHours > 0 ? 'workday' : 'none',
    };
  }

  return {
    employeeId: day.employeeId,
    employeeName: day.employeeName,
    date: day.date,
    reportHour: day.reportHour,
    overtimeHours: day.reportHour,
    overtimeType: day.reportHour > 0 ? 'weekend' : 'none',
  };
}

export function buildOvertimeRecords(
  days: Array<Pick<EmployeeDay, 'employeeId' | 'employeeName' | 'date' | 'reportHour'>>,
  overtimeMode: Filters['overtimeMode'],
) {
  return days.map((day) => getOvertimeRecord(day, overtimeMode));
}

export function buildOvertimeHistogram(
  records: Array<Pick<OvertimeRecord, 'overtimeHours' | 'overtimeType'>>,
) {
  const bins = OVERTIME_HISTOGRAM_BINS.map((bin) => ({
    ...bin,
    total: 0,
    workday: 0,
    weekend: 0,
    holiday: 0,
  }));

  records
    .filter((record) => record.overtimeHours > 0 && record.overtimeType !== 'none')
    .forEach((record) => {
      const matchedBin =
        bins.find((bin) =>
          bin.max === null
            ? record.overtimeHours >= bin.min
            : record.overtimeHours >= bin.min && record.overtimeHours < bin.max,
        ) ?? bins[bins.length - 1];

      matchedBin.total += 1;
      if (record.overtimeType === 'workday') matchedBin.workday += 1;
      if (record.overtimeType === 'weekend') matchedBin.weekend += 1;
      if (record.overtimeType === 'holiday') matchedBin.holiday += 1;
    });

  return bins;
}
