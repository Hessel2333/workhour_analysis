const HOLIDAYS_2025 = new Set([
  '2025-01-01',
  '2025-01-28',
  '2025-01-29',
  '2025-01-30',
  '2025-01-31',
  '2025-02-01',
  '2025-02-02',
  '2025-02-03',
  '2025-04-04',
  '2025-04-05',
  '2025-04-06',
  '2025-05-01',
  '2025-05-02',
  '2025-05-03',
  '2025-05-04',
  '2025-05-05',
  '2025-05-31',
  '2025-06-01',
  '2025-06-02',
  '2025-10-01',
  '2025-10-02',
  '2025-10-03',
  '2025-10-04',
  '2025-10-05',
  '2025-10-06',
  '2025-10-07',
  '2025-10-08',
]);

const MAKEUP_WORKDAYS_2025 = new Set([
  '2025-01-26',
  '2025-02-08',
  '2025-04-27',
  '2025-09-28',
  '2025-10-11',
]);

function weekdayIndex(date: string) {
  return new Date(`${date}T00:00:00`).getDay();
}

function isWeekend(date: string) {
  const day = weekdayIndex(date);
  return day === 0 || day === 6;
}

function dayDiff(dateA: string, dateB: string) {
  const left = new Date(`${dateA}T00:00:00`).getTime();
  const right = new Date(`${dateB}T00:00:00`).getTime();
  return Math.round((left - right) / 86400000);
}

export function isHoliday(date: string) {
  return HOLIDAYS_2025.has(date);
}

export function isMakeupWorkday(date: string) {
  return MAKEUP_WORKDAYS_2025.has(date);
}

export function isOfficialWorkday(date: string) {
  if (isHoliday(date)) return false;
  if (isMakeupWorkday(date)) return true;
  return !isWeekend(date);
}

export function isBigSmallWeekSaturday(date: string) {
  if (weekdayIndex(date) !== 6 || isHoliday(date) || isMakeupWorkday(date)) return false;
  const anchorSaturday = '2025-07-05';
  const weeks = Math.floor(dayDiff(date, anchorSaturday) / 7);
  return weeks >= 0 && weeks % 2 === 0;
}

export function isCompanyWorkday(
  date: string,
  overtimeMode: 'standard' | 'bigSmallWeek',
) {
  if (isOfficialWorkday(date)) return true;
  if (overtimeMode === 'bigSmallWeek' && isBigSmallWeekSaturday(date)) return true;
  return false;
}

export function holidayLabel(date: string) {
  if (date === '2025-01-01') return '元旦';
  if (date >= '2025-01-28' && date <= '2025-02-04') return '春节';
  if (date >= '2025-04-04' && date <= '2025-04-06') return '清明';
  if (date >= '2025-05-01' && date <= '2025-05-05') return '劳动节';
  if (date >= '2025-05-31' && date <= '2025-06-02') return '端午';
  if (date >= '2025-10-01' && date <= '2025-10-08') return '国庆/中秋';
  return '法定节假日';
}
