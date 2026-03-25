export type TrendGranularity = 'day' | 'week' | 'month';

export function trendGranularityLabel(granularity: TrendGranularity) {
  if (granularity === 'day') return '日';
  if (granularity === 'week') return '周';
  return '月';
}

interface SeriesPoint {
  date: string;
  value: number;
}

function isoWeekLabel(dateString: string) {
  const date = new Date(`${dateString}T00:00:00`);
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const diff =
    target.getTime() -
    (firstThursday.getTime() - (((firstThursday.getDay() + 6) % 7) - 3) * 86400000);
  const week = 1 + Math.round(diff / 604800000);
  return `${target.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

function monthLabel(dateString: string) {
  return dateString.slice(0, 7);
}

export function granularityBucketLabel(dateString: string, granularity: TrendGranularity) {
  if (granularity === 'month') return monthLabel(dateString);
  if (granularity === 'week') return isoWeekLabel(dateString);
  return dateString;
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function buildGranularityLabels(
  startDate: string,
  endDate: string,
  granularity: TrendGranularity,
) {
  if (!startDate || !endDate || startDate > endDate) return [];

  if (granularity === 'month') {
    const labels: string[] = [];
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const endCursor = new Date(end.getFullYear(), end.getMonth(), 1);

    while (cursor <= endCursor) {
      labels.push(monthLabel(formatLocalDate(cursor)));
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return labels;
  }

  if (granularity === 'week') {
    const labels: string[] = [];
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    const cursor = new Date(start.valueOf());
    while (cursor <= end) {
      const label = isoWeekLabel(formatLocalDate(cursor));
      if (labels[labels.length - 1] !== label) labels.push(label);
      cursor.setDate(cursor.getDate() + 1);
    }
    return labels;
  }

  const labels: string[] = [];
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const cursor = new Date(start.valueOf());
  while (cursor <= end) {
    labels.push(formatLocalDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return labels;
}

export function fillGroupedSeries(
  labels: string[],
  points: Array<{ label: string; value: number }>,
) {
  const map = new Map(points.map((point) => [point.label, point.value]));
  return labels.map((label) => ({ label, value: map.get(label) ?? 0 }));
}

export function groupSeriesByGranularity(
  points: SeriesPoint[],
  granularity: TrendGranularity,
) {
  const buckets = new Map<string, number>();
  points.forEach((point) => {
    const key = granularityBucketLabel(point.date, granularity);
    buckets.set(key, (buckets.get(key) ?? 0) + point.value);
  });

  return Array.from(buckets.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => left.label.localeCompare(right.label));
}
